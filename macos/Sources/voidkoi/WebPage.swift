import AppKit
import WebKit

/// The web view. It notes files and links dropped on it on their way in, for when
/// the page doesn't take them: the page's script says so, or WebKit opens the
/// first one as a page. The app does better with them instead.
final class WebView: WKWebView {
    var onDrop: ((_ files: [URL], _ links: [URL]) -> Void)?

    override func performDragOperation(_ sender: NSDraggingInfo) -> Bool {
        let pasteboard = sender.draggingPasteboard
        let files = pasteboard.readObjects(forClasses: [NSURL.self], options: [.urlReadingFileURLsOnly: true]) as? [URL] ?? []
        let links = (pasteboard.readObjects(forClasses: [NSURL.self], options: nil) as? [URL] ?? []).filter { !$0.isFileURL }
        if !files.isEmpty || !links.isEmpty { onDrop?(files, links) }
        return super.performDragOperation(sender)
    }
}

/// The server's pages in a web view, with what a browser would supply done the Mac way.
@MainActor
final class WebPage: NSObject, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandlerWithReply {
    let server: URL
    let webView: WebView
    private let transfers: Transfers
    private var observations: [NSKeyValueObservation] = []
    private var drop: (files: [URL], links: [URL], at: Date)?

    var onTitle: (() -> Void)?
    var onURL: (() -> Void)?
    /// The page's colour, when it's opaque, and whether the page is dark (nil: can't tell).
    var onColor: ((NSColor?, Bool?) -> Void)?
    var onFailure: ((NSError) -> Void)?
    var onFinish: (() -> Void)?
    /// Files dropped on a page that didn't take them.
    var onUpload: (([URL]) -> Void)?
    /// The files on their way to Files, for the page's picker that asks next.
    var offer: (() -> [URL]?)?
    /// A file picker took files; accepted when the page acted on them.
    var onPicked: ((Bool) -> Void)?

    init(server: URL, store: WKWebsiteDataStore, transfers: Transfers) {
        self.server = server
        self.transfers = transfers

        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = store
        configuration.applicationNameForUserAgent = App.userAgent
        configuration.preferences.isElementFullscreenEnabled = true
        // A call rings without a click first.
        configuration.mediaTypesRequiringUserActionForPlayback = []
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: Bridge.script(server: server), injectionTime: .atDocumentStart, forMainFrameOnly: true))
        configuration.userContentController = content
        webView = WebView(frame: .zero, configuration: configuration)
        super.init()
        content.addScriptMessageHandler(WeakMessageHandler(self), contentWorld: .page, name: Bridge.handler)

        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.onDrop = { [weak self] files, links in
            self?.drop = (files, links, Date())
        }
        observations.append(webView.observe(\.title) { [weak self] _, _ in
            onMain { self?.onTitle?() }
        })
        observations.append(webView.observe(\.url) { [weak self] _, _ in
            onMain { self?.onURL?() }
        })
    }

    /// Lets go of the web view: nothing more loads or calls back.
    func close() {
        observations.forEach { $0.invalidate() }
        observations = []
        webView.stopLoading()
        webView.navigationDelegate = nil
        webView.uiDelegate = nil
        webView.onDrop = nil
        webView.configuration.userContentController.removeAllScriptMessageHandlers()
        webView.configuration.userContentController.removeAllUserScripts()
        webView.removeFromSuperview()
    }

    var url: URL? { webView.url }
    var title: String { webView.title ?? "" }

    func load(_ url: URL) {
        Snapshot.log("load: \(url.absoluteString)")
        requested = url
        webView.load(URLRequest(url: url))
    }

    /// A page of the server: "/files", "/login?signedOut=1".
    func go(_ path: String) {
        guard let url = URL(string: path, relativeTo: server)?.absoluteURL else { return }
        load(url)
    }

    func isOwn(_ url: URL?) -> Bool { Address.sameOrigin(url, server) }

    /// A frame showing one of the server's pages.
    private func isOwn(_ origin: WKSecurityOrigin) -> Bool { Address.sameOrigin(origin, server) }

    /// The page on show, from when it commits: not one still loading.
    private var shown: URL?

    /// The page on show is another site's, such as the sign-in provider's: its host.
    var elsewhere: String? {
        guard let url = shown, ["http", "https"].contains(url.scheme?.lowercased() ?? ""), !isOwn(url) else { return nil }
        return Address.name(url)
    }

    // MARK: Navigation

    /// The sign-in provider's sites, from when the server's page sends the window there
    /// until the window is back at the server.
    private var providers: [URL] = []

    private func isProvider(_ url: URL?) -> Bool { providers.contains { Address.sameOrigin(url, $0) } }

    private var atProvider: Bool { isProvider(shown) }

    /// The page the app asked for last, as Try Again does after a page didn't load.
    private var requested: URL?

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        let source = navigationAction.sourceFrame
        let fromOwn = isOwn(source.securityOrigin)
        let type = navigationAction.navigationType
        let link = type == .linkActivated
        let scheme = url.scheme?.lowercased() ?? ""
        let web = scheme == "http" || scheme == "https"
        // Downloads only from the server's own pages.
        if navigationAction.shouldPerformDownload {
            if !fromOwn { Snapshot.log("download refused: \(url.absoluteString)") }
            return decisionHandler(fromOwn ? .download : .cancel)
        }

        if url.isFileURL {
            Snapshot.log("file navigation: \(url.lastPathComponent)")
            // Files dropped on a page that didn't take them: to Files, all of them.
            if let dropped = takeDrop(matching: url) {
                onMain { [weak self] in self?.onUpload?(dropped.files) }
            }
            return decisionHandler(.cancel)
        }
        if !web && !["about", "blob", "data"].contains(scheme) {
            // mailto:, tel: and the like belong to other apps, for a link on the server's page.
            if link, source.isMainFrame, fromOwn { openInApp(url, scheme: scheme) }
            return decisionHandler(.cancel)
        }
        guard let target = navigationAction.targetFrame else {
            // For a new window: the server's pages go on to createWebViewWith; another site
            // opens in the browser, for a link or for the server's own pages.
            if web, !isOwn(url) {
                if link || fromOwn { openOutside(url) }
                return decisionHandler(.cancel)
            }
            return decisionHandler(.allow)
        }
        if !target.isMainFrame {
            // A frame in the server's page shows the server's pages and what they make
            // themselves. A link in it to another site, as in a PDF, opens in the browser.
            // The sign-in provider's page keeps its own frames.
            if !web || isOwn(url) || atProvider { return decisionHandler(.allow) }
            Snapshot.log("frame navigation refused: \(url.absoluteString)")
            if link { openOutside(url) }
            return decisionHandler(.cancel)
        }
        let asked = url == requested
        requested = nil
        if !web { return decisionHandler(fromOwn ? .allow : .cancel) }
        if isOwn(url) { return decisionHandler(.allow) }
        // A link dropped on the page.
        if takeDrop(matching: url) != nil {
            openOutside(url)
            return decisionHandler(.cancel)
        }
        // Another site stays in the window only as the sign-in provider: where the
        // server's page sends it without a link, by a redirect, a form or its script, as
        // signing in and out at an OpenID Connect provider does. The provider's own pages
        // stay too while the window is there, and so does trying one again that didn't
        // load. Anything else opens in the browser.
        if source.isMainFrame, fromOwn, type == .other || type == .formSubmitted {
            Snapshot.log("sign-in provider: \(Address.origin(url))")
            if !isProvider(url) { providers.append(url) }
            return decisionHandler(.allow)
        }
        if isProvider(url), atProvider || asked { return decisionHandler(.allow) }
        openOutside(url)
        decisionHandler(.cancel)
    }

    /// A link to another app. Mail and phone links open straight away; any other kind asks first.
    private func openInApp(_ url: URL, scheme: String) {
        if scheme == "mailto" || scheme == "tel" { return openOutside(url) }
        let alert = Alerts.make("Open this \(scheme): link in another app?", buttons: ["Open", "Cancel"])
        Alerts.present(alert, in: webView.window) { [weak self] response in
            if response == .alertFirstButtonReturn { self?.openOutside(url) }
        }
    }

    /// Opens a link in the app it belongs to: the default browser, Mail… A snapshot run only notes it.
    private func openOutside(_ url: URL) {
        Snapshot.log("open outside: \(url.absoluteString)")
        guard !Snapshot.isActive else { return }
        NSWorkspace.shared.open(url)
    }

    /// The drop this navigation opens, when it's one WebKit is opening because the page didn't take it.
    private func takeDrop(matching url: URL) -> (files: [URL], links: [URL], at: Date)? {
        guard let drop, Date().timeIntervalSince(drop.at) < 5 else { return nil }
        let matches = url.isFileURL
            ? drop.files.contains { $0.standardizedFileURL.path == url.standardizedFileURL.path }
            : drop.links.contains(url)
        guard matches else { return nil }
        self.drop = nil
        return drop
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping @MainActor @Sendable (WKNavigationResponsePolicy) -> Void
    ) {
        let attachment = (navigationResponse.response as? HTTPURLResponse)?
            .value(forHTTPHeaderField: "Content-Disposition")?.lowercased().hasPrefix("attachment") ?? false
        guard attachment || !navigationResponse.canShowMIMEType else { return decisionHandler(.allow) }
        // Downloads only from the server, or from a blob one of its pages made.
        var url = navigationResponse.response.url
        if url?.scheme?.lowercased() == "blob" { url = url.flatMap { URL(string: String($0.absoluteString.dropFirst(5))) } }
        if !isOwn(url) { Snapshot.log("download refused: \(navigationResponse.response.url?.absoluteString ?? "")") }
        decisionHandler(isOwn(url) ? .download : .cancel)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        transfers.track(download)
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        transfers.track(download)
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        transfers.pageReset()
        shown = webView.url
        if isOwn(shown) { providers = [] }
        onURL?()
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        Snapshot.log("finished: \(webView.url?.absoluteString ?? "")")
        onFinish?()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    private func failed(_ error: Error) {
        let error = error as NSError
        // Cancelled, turned into a download, or stopped here: not a failure. WebKit
        // reports the last two as "frame load interrupted", 102 in its own old domain.
        if error.code == NSURLErrorCancelled || (error.domain == "WebKitErrorDomain" && error.code == 102) { return }
        Snapshot.log("failed: \(error.localizedDescription) (\(error.domain) \(error.code))")
        onFailure?(error)
    }

    /// When the page's process last went down and the page loaded again.
    private var reloadedAfterCrash: Date?

    /// The page loads again once. Down again within a minute, it shows the error instead.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        Snapshot.log("web content process ended")
        if let last = reloadedAfterCrash, Date().timeIntervalSince(last) < 60 {
            var info: [String: Any] = [NSLocalizedDescriptionKey: "The page stopped working."]
            if let url = webView.url { info[NSURLErrorFailingURLErrorKey] = url }
            return failed(NSError(domain: WKError.errorDomain, code: WKError.webContentProcessTerminated.rawValue, userInfo: info))
        }
        reloadedAfterCrash = Date()
        webView.reload()
    }

    // MARK: Windows, pickers, calls and dialogs the page asks for

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // window.open and links meant for a new window, only from the server's own pages:
        // the server's pages here, the rest in the browser.
        guard isOwn(navigationAction.sourceFrame.securityOrigin) else {
            Snapshot.log("new window refused: \(navigationAction.request.url?.absoluteString ?? "")")
            return nil
        }
        if let url = navigationAction.request.url, let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https" {
            if isOwn(url) {
                onMain { [weak self] in self?.load(url) }
            } else {
                openOutside(url)
            }
        }
        return nil
    }

    /// The microphone and camera, for calls: only the server's own pages may use them,
    /// in a frame of the server's own.
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping @MainActor @Sendable (WKPermissionDecision) -> Void
    ) {
        let granted = isOwn(origin) && isOwn(frame.securityOrigin)
        Snapshot.log("media capture: \(origin.protocol)://\(origin.host):\(origin.port) \(granted ? "granted" : "denied")")
        decisionHandler(granted ? .grant : .deny)
    }

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable ([URL]?) -> Void
    ) {
        // Files on their way to Files go only to the server's own page.
        if frame.isMainFrame, isOwn(frame.securityOrigin), let urls = offer?() {
            Snapshot.log("picker answered with \(urls.map(\.lastPathComponent).joined(separator: ", "))")
            return completionHandler(urls)
        }
        guard !Snapshot.isActive, let window = webView.window else { return completionHandler(nil) }
        let panel = NSOpenPanel()
        panel.canChooseFiles = !parameters.allowsDirectories
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    // alert(), confirm() and prompt(): only for the server's own pages.

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable () -> Void
    ) {
        guard ownDialog(frame) else { return completionHandler() }
        Alerts.present(Alerts.make(message), in: webView.window) { _ in completionHandler() }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (Bool) -> Void
    ) {
        guard ownDialog(frame) else { return completionHandler(false) }
        Alerts.present(Alerts.make(message, buttons: ["OK", "Cancel"]), in: webView.window) {
            completionHandler($0 == .alertFirstButtonReturn)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptTextInputPanelWithPrompt prompt: String,
        defaultText: String?,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping @MainActor @Sendable (String?) -> Void
    ) {
        guard ownDialog(frame) else { return completionHandler(nil) }
        let alert = Alerts.make(prompt, buttons: ["OK", "Cancel"])
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 280, height: 24))
        field.stringValue = defaultText ?? ""
        alert.accessoryView = field
        Alerts.present(alert, in: webView.window) {
            completionHandler($0 == .alertFirstButtonReturn ? field.stringValue : nil)
        }
    }

    private func ownDialog(_ frame: WKFrameInfo) -> Bool {
        if isOwn(frame.securityOrigin) { return true }
        Snapshot.log("dialog refused: \(frame.securityOrigin.protocol)://\(frame.securityOrigin.host)")
        return false
    }

    // MARK: Messages from the page

    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            return replyHandler(nil, "A message is an object with a type")
        }
        // Only from the page itself, not from a frame in it.
        guard message.frameInfo.isMainFrame else {
            Snapshot.log("message refused: \(type), from a frame")
            return replyHandler(nil, "Only the page, not a frame in it")
        }
        if type == "color" {
            pageColor(body)
            return replyHandler(nil, nil)
        }
        // Everything else only from the server's own pages.
        guard isOwn(message.frameInfo.securityOrigin) else {
            Snapshot.log("message refused: \(type), from another site")
            return replyHandler(nil, "Only the server's own pages")
        }
        switch type {
        case "notify":
            let title = (body["title"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !title.isEmpty else { return replyHandler(false, nil) }
            let url = (body["url"] as? String)
                .flatMap { URL(string: $0, relativeTo: server)?.absoluteURL }
                .flatMap { isOwn($0) ? $0 : nil }
            Notifier.shared.notify(
                title: title,
                body: (body["body"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                url: url,
                tag: (body["tag"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                silent: (body["silent"] as? Bool) ?? false
            ) { shown in replyHandler(shown, nil) }
        case "badge":
            let count = body["count"].flatMap { $0 is NSNull ? nil : $0 }
            Notifier.shared.setBadge(count == nil ? nil : (count as? NSNumber)?.intValue ?? 0)
            replyHandler(nil, nil)
        case "copy":
            if let text = body["text"] as? String {
                if Snapshot.isActive {
                    Snapshot.log("copy: \(text)")
                } else {
                    NSPasteboard.general.clearContents()
                    NSPasteboard.general.setString(text, forType: .string)
                }
            }
            replyHandler(nil, nil)
        case "print":
            printPage()
            replyHandler(nil, nil)
        case "drop":
            // Files dropped where the page took none: to Files, from the drag.
            Snapshot.log("the page took no drop")
            if let drop, Date().timeIntervalSince(drop.at) < 5, !drop.files.isEmpty {
                self.drop = nil
                Snapshot.log("dropped on the page: \(drop.files.map(\.lastPathComponent).joined(separator: ", "))")
                onMain { [weak self] in self?.onUpload?(drop.files) }
            }
            replyHandler(nil, nil)
        case "picked":
            let accepted = (body["accepted"] as? Bool) ?? true
            Snapshot.log("picked: \((body["count"] as? NSNumber)?.intValue ?? 0) files, accepted \(accepted)")
            onPicked?(accepted)
            replyHandler(nil, nil)
        case "uploads":
            transfers.uploadsChanged(
                active: (body["active"] as? NSNumber)?.intValue ?? 0,
                total: (body["total"] as? NSNumber)?.doubleValue ?? 0,
                loaded: (body["loaded"] as? NSNumber)?.doubleValue ?? 0,
                finished: (body["finished"] as? NSNumber)?.intValue ?? 0
            )
            replyHandler(nil, nil)
        default:
            replyHandler(nil, "Unknown message type: \(type)")
        }
    }

    /// The page's colour when it's opaque, else whether it says it's dark.
    private func pageColor(_ body: [String: Any]) {
        let color = NSColor.css(body["canvas"] as? String)
            ?? NSColor.css(body["body"] as? String)
            ?? NSColor.css(body["root"] as? String)
        let scheme = (body["scheme"] as? String ?? "").split(separator: " ")
        let dark: Bool? = color.map { !$0.isLight } ?? (scheme == ["dark"] ? true : scheme == ["light"] ? false : nil)
        onColor?(color, dark)
    }

    // MARK: Commands

    /// The page's print view, through the Mac's print panel, where Save as PDF is.
    func printPage() {
        guard !Snapshot.isActive else { return Snapshot.log("print") }
        guard let window = webView.window else { return }
        let operation = webView.printOperation(with: NSPrintInfo.shared)
        operation.showsPrintPanel = true
        operation.showsProgressPanel = true
        // Without a frame, WebKit prints blank pages.
        operation.view?.frame = webView.bounds
        operation.runModal(for: window, delegate: self, didRun: #selector(printed(_:success:contextInfo:)), contextInfo: nil)
    }

    @objc private func printed(_ operation: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        webView.evaluateJavaScript("window.dispatchEvent(new Event('afterprint'))")
    }

    func focusSearch() {
        webView.evaluateJavaScript(Bridge.focusSearch) { result, _ in
            if (result as? Bool) != true { NSSound.beep() }
        }
    }

    /// Clicks the page's file picker: true when there was one to click.
    func clickPicker(folder: Bool, done: @escaping @MainActor (Bool) -> Void) {
        webView.evaluateJavaScript(Bridge.clickPicker(folder: folder)) { result, _ in
            let clicked = (result as? Bool) == true
            onMain { done(clicked) }
        }
    }
}
