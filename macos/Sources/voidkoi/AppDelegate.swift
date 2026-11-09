import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuItemValidation {
    private(set) var main: MainWindowController?
    private(set) var preferences: PreferencesWindowController?
    private let transfers = Transfers()
    /// Files opened with the app before its window exists.
    private var opened: [URL] = []

    func applicationWillFinishLaunching(_ notification: Notification) {
        if Snapshot.isActive { NSApp.setActivationPolicy(.accessory) }
        NSApp.mainMenu = makeMainMenu()
        Notifier.shared.start()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        keepPreferencesTitle()
        let main = MainWindowController(transfers: transfers)
        self.main = main
        Notifier.shared.onOpen = { [weak self] url in self?.main?.open(url) }
        #if DEBUG
        if Snapshot.isActive { return Snapshots.start(app: self) }
        #endif
        main.show()
        if !opened.isEmpty {
            main.upload(opened)
            opened = []
        }
        NSApp.activate()
    }

    /// Files and folders dropped on the Dock icon, or opened with voidkoi in the Finder: to Files.
    func application(_ application: NSApplication, open urls: [URL]) {
        let files = urls.filter(\.isFileURL)
        guard !files.isEmpty else { return }
        if let main { main.upload(files) } else { opened += files }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        main?.show()
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        guard transfers.isBusy, !Snapshot.isActive else { return .terminateNow }
        main?.show()
        let alert = Alerts.make("voidkoi is still uploading or downloading", "Quitting stops it.", buttons: ["Quit", "Cancel"])
        return alert.runModal() == .alertFirstButtonReturn ? .terminateNow : .terminateCancel
    }

    func applicationDockMenu(_ sender: NSApplication) -> NSMenu? {
        let menu = NSMenu()
        for (index, app) in SuiteApp.all.enumerated() {
            let entry = item(app.name, #selector(openApp(_:)))
            entry.image = app.icon(size: 16)
            entry.tag = index
            menu.addItem(entry)
        }
        return menu
    }

    // MARK: Commands

    @objc func openPreferences(_ sender: Any?) {
        let preferences = self.preferences ?? PreferencesWindowController()
        self.preferences = preferences
        guard !Snapshot.isActive else { return }
        preferences.showWindow(nil)
        preferences.window?.makeKeyAndOrderFront(nil)
        NSApp.activate()
    }

    @objc func signOut(_ sender: Any?) {
        guard let main, let server = main.page?.server else { return }
        let alert = Alerts.make("Sign out of \(Address.name(server))?", buttons: ["Sign Out", "Cancel"])
        Alerts.present(alert, in: main.window) { response in
            if response == .alertFirstButtonReturn { main.signOut() }
        }
    }

    @objc func openApp(_ sender: NSMenuItem) {
        guard SuiteApp.all.indices.contains(sender.tag) else { return }
        main?.go(SuiteApp.all[sender.tag].path)
    }

    @objc func openSettingsPage(_ sender: Any?) { main?.go("/settings") }
    @objc func openAdminPage(_ sender: Any?) { main?.go("/admin") }
    @objc func goBack(_ sender: Any?) { main?.goBack() }
    @objc func goForward(_ sender: Any?) { main?.goForward() }
    @objc func reloadPage(_ sender: Any?) { main?.reload() }
    @objc func actualSize(_ sender: Any?) { main?.zoom(by: nil) }
    @objc func zoomIn(_ sender: Any?) { main?.zoom(by: 1.1) }
    @objc func zoomOut(_ sender: Any?) { main?.zoom(by: 1 / 1.1) }
    @objc func printPage(_ sender: Any?) { main?.printPage() }
    @objc func findInPage(_ sender: Any?) { main?.focusSearch() }
    @objc func showMainWindow(_ sender: Any?) { main?.show() }

    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        let connected = main?.isConnected ?? false
        switch menuItem.action {
        case #selector(goBack(_:)): return main?.canGoBack ?? false
        case #selector(goForward(_:)): return main?.canGoForward ?? false
        case #selector(openApp(_:)):
            menuItem.state = connected && SuiteApp.all.indices.contains(menuItem.tag) && main?.currentApp == SuiteApp.all[menuItem.tag] ? .on : .off
            return connected
        case #selector(signOut(_:)), #selector(reloadPage(_:)), #selector(openSettingsPage(_:)), #selector(openAdminPage(_:)),
             #selector(printPage(_:)), #selector(findInPage(_:)):
            return connected
        default:
            return true
        }
    }
}
