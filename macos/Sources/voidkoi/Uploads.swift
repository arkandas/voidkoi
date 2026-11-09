import AppKit

/// Files and folders dropped on the Dock icon, or on a page that didn't take them,
/// on their way into the folder open in Files. They go through the page's own
/// pickers: the same uploads, panel and questions as picking them there.
@MainActor
final class Uploads {
    private struct Drop: Equatable {
        let id = UUID()
        let folder: Bool
        let urls: [URL]
    }

    weak var page: WebPage?
    weak var window: NSWindow?

    /// Waiting their turn: the files together, then each folder, as the pickers take them.
    private var queue: [Drop] = []
    /// The picker was clicked for it; the picker takes it when it asks for files.
    private var offered: Drop?
    /// The picker took it; the page hasn't said yet whether it acted on it.
    private var handedOver: Drop?
    private var attempts = 0
    /// When the app opened Files for the drops waiting.
    private var openedFiles: Date?
    private var toldToSignIn = false
    private var scheduled = false

    var isWaiting: Bool { !queue.isEmpty }

    func add(_ urls: [URL]) {
        var files: [URL] = []
        var folders: [URL] = []
        for url in urls {
            var isFolder: ObjCBool = false
            guard FileManager.default.fileExists(atPath: url.path, isDirectory: &isFolder) else { continue }
            if isFolder.boolValue { folders.append(url) } else { files.append(url) }
        }
        guard !files.isEmpty || !folders.isEmpty else { return }
        Snapshot.log("upload: \(files.count) files, \(folders.count) folders")
        if !files.isEmpty { queue.append(Drop(folder: false, urls: files)) }
        queue.append(contentsOf: folders.map { Drop(folder: true, urls: [$0]) })
        attempts = 0
        openedFiles = nil
        toldToSignIn = false
        deliver()
    }

    /// Another page loaded, or the page moved within the app.
    func pageChanged() {
        schedule(0.5)
    }

    /// Another server: what was waiting goes.
    func reset() {
        queue = []
        offered = nil
        handedOver = nil
    }

    // MARK: Handing over

    private func schedule(_ seconds: Double) {
        guard !scheduled else { return }
        scheduled = true
        after(seconds) { [weak self] in
            self?.scheduled = false
            self?.deliver()
        }
    }

    private func deliver() {
        guard let page, offered == nil, handedOver == nil, let drop = queue.first else { return }
        // Still loading, or not loaded at all: the next page calls again.
        guard !page.webView.isLoading, let url = page.url else { return }
        guard page.isOwn(url), !Self.isSignIn(url.path) else { return tellToSignIn() }
        // Choosing apps at the first sign-in: Files may be one of them.
        if url.path == "/welcome" { return }
        if url.path != "/files" && !url.path.hasPrefix("/files/") {
            // Sent somewhere else right after opening Files: the account doesn't use it.
            if let opened = openedFiles, Date().timeIntervalSince(opened) < 10 {
                return giveUp("Files is off for this account")
            }
            openedFiles = Date()
            page.go(SuiteApp.files.path)
            return
        }
        offered = drop
        page.clickPicker(folder: drop.folder) { [weak self] clicked in
            guard let self, self.offered == drop else { return }
            if clicked {
                // The picker asks for its files next; if it never does, again.
                after(3) { [weak self] in
                    guard let self, self.offered == drop else { return }
                    self.offered = nil
                    self.retry()
                }
            } else {
                // The page is still starting.
                self.offered = nil
                self.retry()
            }
        }
    }

    /// The page's picker asks for files: the ones on offer, if any.
    func takeOffer() -> [URL]? {
        guard let drop = offered else { return nil }
        offered = nil
        handedOver = drop
        after(3) { [weak self] in
            guard let self, self.handedOver == drop else { return }
            // No word from the page.
            self.handedOver = nil
            self.retry()
        }
        return drop.urls
    }

    /// The page's input got the files. Accepted: the page acted on them. It doesn't
    /// while its folder is still loading, so they go again.
    func picked(accepted: Bool) {
        guard let drop = handedOver else { return }
        handedOver = nil
        guard accepted else { return retry() }
        queue.removeAll { $0 == drop }
        attempts = 0
        schedule(0.3)
    }

    private func retry() {
        attempts += 1
        guard attempts <= 30 else { return giveUp("Couldn't upload to Files") }
        schedule(attempts < 4 ? 0.5 : 1)
    }

    private func giveUp(_ message: String) {
        Snapshot.log("upload given up: \(message)")
        queue = []
        NSSound.beep()
        Alerts.present(Alerts.make(message), in: window)
    }

    private func tellToSignIn() {
        guard !toldToSignIn else { return }
        toldToSignIn = true
        let count = queue.reduce(0) { $0 + $1.urls.count }
        Alerts.present(Alerts.make("Sign in to upload", count == 1 ? "1 item is waiting." : "\(count) items are waiting."), in: window)
    }

    /// Pages from before signing in.
    static func isSignIn(_ path: String) -> Bool {
        ["/login", "/setup"].contains { path == $0 || path.hasPrefix($0 + "/") }
    }
}
