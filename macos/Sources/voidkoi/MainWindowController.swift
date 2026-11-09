import AppKit
import SwiftUI
import WebKit

/// The window: the server's pages, or the question for a server when there is none.
@MainActor
final class MainWindowController: NSWindowController, NSWindowDelegate {
    let uploads = Uploads()
    private let transfers: Transfers
    private let root = NSView()
    private(set) var page: WebPage?
    private var prompt: NSView?
    private var errorView: ErrorView?
    /// The page that couldn't load, for Try Again.
    private var failedURL: URL?
    private var observations: [NSKeyValueObservation] = []
    private var serverObserver: NSObjectProtocol?

    init(transfers: Transfers) {
        self.transfers = transfers
        let window = AppWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1280, height: 820),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        super.init(window: window)

        window.title = "voidkoi"
        window.isReleasedWhenClosed = false
        window.isRestorable = false
        window.tabbingMode = .disallowed
        window.minSize = NSSize(width: 420, height: 480)
        window.delegate = self
        if !Snapshot.isActive {
            window.setFrameAutosaveName("voidkoi")
            if !window.setFrameUsingName("voidkoi") { window.center() }
        }
        root.frame = NSRect(origin: .zero, size: window.contentLayoutRect.size)
        root.autoresizingMask = [.width, .height]
        window.contentView = root
        uploads.window = window
        if let color = Settings.shared.lastColor { applyColor(color, dark: !color.isLight) }

        // The pages follow the system's light or dark, so a page's "System" theme still
        // means the system's; the window takes the colour of the page.
        observations.append(NSApp.observe(\.effectiveAppearance) { [weak self] _, _ in
            onMain {
                guard let self else { return }
                self.page?.webView.appearance = self.systemAppearance
            }
        })
        serverObserver = NotificationCenter.default.addObserver(forName: Settings.serverDidChange, object: nil, queue: .main) { [weak self] _ in
            onMain { self?.connect() }
        }
        connect()
        DataStores.removeUnused()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    private var systemAppearance: NSAppearance? {
        NSAppearance(named: NSApp.effectiveAppearance.isDark ? .darkAqua : .aqua)
    }

    // MARK: Server

    /// Shows the server's pages, or asks for a server when there is none. Another
    /// server gets a new web view and store: nothing of the old one comes along.
    func connect() {
        let server = Settings.shared.server
        if let page, let server, Address.sameOrigin(page.server, server) { return }
        if let page {
            Snapshot.log("leaving \(Address.origin(page.server))")
            let store = page.webView.configuration.websiteDataStore
            closePage()
            uploads.reset()
            Notifier.shared.clear()
            DataStores.discard(store)
        }
        hideError()
        guard let server else { return showPrompt() }
        hidePrompt()
        Snapshot.log("connecting to \(Address.origin(server))")
        openPage(server: server, store: DataStores.store(for: server), at: startURL(for: server))
    }

    private func startURL(for server: URL) -> URL {
        if let last = Settings.shared.lastPage, Address.sameOrigin(last, server) { return last }
        return URL(string: "/", relativeTo: server)?.absoluteURL ?? server
    }

    private func openPage(server: URL, store: WKWebsiteDataStore, at url: URL) {
        let page = WebPage(server: server, store: store, transfers: transfers)
        page.onTitle = { [weak self] in self?.updateTitle() }
        page.onURL = { [weak self] in self?.pageMoved() }
        page.onColor = { [weak self] color, dark in self?.applyColor(color, dark: dark) }
        page.onFailure = { [weak self] error in self?.showError(error) }
        page.onFinish = { [weak self] in
            self?.hideError()
            self?.keepPage()
            self?.uploads.pageChanged()
        }
        page.onUpload = { [weak self] urls in self?.upload(urls) }
        page.offer = { [weak self] in self?.uploads.takeOffer() }
        page.onPicked = { [weak self] accepted in self?.uploads.picked(accepted: accepted) }

        let webView = page.webView
        webView.appearance = systemAppearance
        webView.pageZoom = CGFloat(Settings.shared.zoom)
        if let color = Settings.shared.lastColor { webView.underPageBackgroundColor = color }
        webView.frame = root.bounds
        webView.autoresizingMask = [.width, .height]
        root.addSubview(webView, positioned: .below, relativeTo: nil)
        self.page = page
        uploads.page = page
        window?.makeFirstResponder(webView)
        updateTitle()
        page.load(url)
    }

    private func closePage() {
        page?.close()
        page = nil
        transfers.pageReset()
    }

    /// Signs out on this Mac: the cookies, storage and caches go, the server's and the
    /// sign-in provider's, and a new web view opens at the sign-in page, with no way back
    /// to the old pages.
    func signOut() {
        guard let page else { return }
        let server = page.server
        let store = page.webView.configuration.websiteDataStore
        Settings.shared.lastPage = nil
        uploads.reset()
        Notifier.shared.clear()
        closePage()
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) { [weak self] in
            onMain {
                guard let self, self.page == nil, Address.sameOrigin(Settings.shared.server, server) else { return }
                Snapshot.log("signed out")
                self.openPage(server: server, store: store, at: URL(string: "/login?signedOut=1", relativeTo: server)?.absoluteURL ?? server)
            }
        }
    }

    // MARK: The page

    /// The page moved: another one loading, or a move within the app, which loads nothing.
    private func pageMoved() {
        updateTitle()
        if page?.webView.isLoading == false { keepPage() }
        uploads.pageChanged()
    }

    /// The page on show, to open again at the next launch: the server's own, past signing in.
    private func keepPage() {
        guard let page, let url = page.url, page.isOwn(url), !Uploads.isSignIn(url.path),
              !["/welcome", "/share-target"].contains(url.path), !url.path.hasPrefix("/api/") else { return }
        Settings.shared.lastPage = url
    }

    private func updateTitle() {
        let title = page?.title ?? ""
        window?.title = title.isEmpty ? "voidkoi" : title
        // Another site in the window: its host, under the title.
        let subtitle = page?.elsewhere ?? ""
        if window?.subtitle != subtitle {
            Snapshot.log("subtitle: \(subtitle.isEmpty ? "none" : subtitle)")
            window?.subtitle = subtitle
        }
    }

    /// The window takes the page's colour, and its light or dark.
    private func applyColor(_ color: NSColor?, dark: Bool?) {
        guard let window else { return }
        if let color {
            window.backgroundColor = color
            page?.webView.underPageBackgroundColor = color
            Settings.shared.lastColor = color
        }
        if let dark { window.appearance = NSAppearance(named: dark ? .darkAqua : .aqua) }
        Snapshot.log("colour: \(color?.hex ?? "none"), \(dark.map { $0 ? "dark" : "light" } ?? "either")")
    }

    private func showError(_ error: NSError) {
        failedURL = error.userInfo[NSURLErrorFailingURLErrorKey] as? URL
        let host = (failedURL ?? page?.url ?? Settings.shared.server).map(Address.name) ?? "the server"
        let view = errorView ?? ErrorView(
            retry: { [weak self] in self?.reload() },
            changeServer: { NSApp.sendAction(#selector(AppDelegate.openPreferences(_:)), to: nil, from: nil) }
        )
        view.show(host: host, error: error)
        if errorView == nil {
            view.frame = root.bounds
            view.autoresizingMask = [.width, .height]
            root.addSubview(view)
            errorView = view
        }
    }

    private func hideError() {
        errorView?.removeFromSuperview()
        errorView = nil
        failedURL = nil
    }

    private func showPrompt() {
        guard prompt == nil else { return }
        updateTitle()
        let view = NSHostingView(rootView: ServerPromptView { url in Settings.shared.setServer(url) })
        view.frame = root.bounds
        view.autoresizingMask = [.width, .height]
        root.addSubview(view)
        prompt = view
    }

    private func hidePrompt() {
        prompt?.removeFromSuperview()
        prompt = nil
    }

    // MARK: Commands

    var isConnected: Bool { page != nil }
    var canGoBack: Bool { page?.webView.canGoBack ?? false }
    var canGoForward: Bool { page?.webView.canGoForward ?? false }

    /// The app the page belongs to, for the Go menu's mark.
    var currentApp: SuiteApp? {
        guard let page, let url = page.url, page.isOwn(url) else { return nil }
        return SuiteApp.of(path: url.path)
    }

    func show() {
        guard !Snapshot.isActive else { return }
        showWindow(nil)
        window?.makeKeyAndOrderFront(nil)
    }

    /// A page of the server: "/files", "/settings".
    func go(_ path: String) {
        show()
        hideError()
        page?.go(path)
    }

    /// A page of the server from a notification.
    func open(_ url: URL) {
        show()
        guard let page, page.isOwn(url) else { return }
        hideError()
        page.load(url)
    }

    func reload() {
        guard let page else { return }
        if errorView != nil {
            let url = failedURL ?? page.url ?? startURL(for: page.server)
            hideError()
            page.load(url)
        } else {
            page.webView.reload()
        }
    }

    func goBack() { page?.webView.goBack() }
    func goForward() { page?.webView.goForward() }
    func printPage() { page?.printPage() }
    func focusSearch() { page?.focusSearch() }

    func zoom(by factor: CGFloat?) {
        let zoom = factor.map { min(3, max(0.5, CGFloat(Settings.shared.zoom) * $0)) } ?? 1
        Settings.shared.zoom = Double(zoom)
        page?.webView.pageZoom = zoom
    }

    /// Files dropped on the Dock icon or the window: into the folder open in Files.
    func upload(_ urls: [URL]) {
        show()
        uploads.add(urls)
    }

    // MARK: Window

    /// Closing hides the window: calls and uploads carry on, and the Dock icon brings it back.
    func windowShouldClose(_ sender: NSWindow) -> Bool {
        sender.orderOut(nil)
        return false
    }
}
