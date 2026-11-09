import AppKit

extension AppDelegate {
    func makeMainMenu() -> NSMenu {
        let main = NSMenu()

        let app = submenu(in: main, title: "voidkoi")
        app.addItem(withTitle: "About voidkoi", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(item("Preferences…", #selector(openPreferences(_:)), ","))
        app.addItem(item("Sign Out…", #selector(signOut(_:)), symbol: "rectangle.portrait.and.arrow.right"))
        app.addItem(.separator())
        let services = NSMenu(title: "Services")
        app.addItem(withTitle: "Services", action: nil, keyEquivalent: "").submenu = services
        NSApp.servicesMenu = services
        app.addItem(.separator())
        app.addItem(withTitle: "Hide voidkoi", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        app.addItem(withTitle: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
            .keyEquivalentModifierMask = [.command, .option]
        app.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        app.addItem(.separator())
        app.addItem(withTitle: "Quit voidkoi", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")

        let file = submenu(in: main, title: "File")
        file.addItem(withTitle: "Close Window", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        file.addItem(.separator())
        file.addItem(item("Print…", #selector(printPage(_:)), "p", symbol: "printer"))

        let edit = submenu(in: main, title: "Edit")
        edit.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        edit.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z").keyEquivalentModifierMask = [.command, .shift]
        edit.addItem(.separator())
        edit.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        edit.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        edit.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        edit.addItem(withTitle: "Paste and Match Style", action: #selector(NSTextView.pasteAsPlainText(_:)), keyEquivalent: "v")
            .keyEquivalentModifierMask = [.command, .option, .shift]
        edit.addItem(withTitle: "Delete", action: #selector(NSText.delete(_:)), keyEquivalent: "")
        edit.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        edit.addItem(.separator())
        edit.addItem(item("Find", #selector(findInPage(_:)), "f", symbol: "magnifyingglass"))

        let view = submenu(in: main, title: "View")
        view.addItem(item("Actual Size", #selector(actualSize(_:)), "0"))
        view.addItem(item("Zoom In", #selector(zoomIn(_:)), "+"))
        // ⌘= zooms in too, as in Safari, without a second line in the menu.
        let zoomInEquals = item("Zoom In", #selector(zoomIn(_:)), "=")
        zoomInEquals.isHidden = true
        zoomInEquals.allowsKeyEquivalentWhenHidden = true
        view.addItem(zoomInEquals)
        view.addItem(item("Zoom Out", #selector(zoomOut(_:)), "-"))
        view.addItem(.separator())
        view.addItem(withTitle: "Enter Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
            .keyEquivalentModifierMask = [.command, .control]

        let go = submenu(in: main, title: "Go")
        go.addItem(item("Back", #selector(goBack(_:)), "[", symbol: "chevron.backward"))
        go.addItem(item("Forward", #selector(goForward(_:)), "]", symbol: "chevron.forward"))
        go.addItem(item("Reload", #selector(reloadPage(_:)), "r", symbol: "arrow.clockwise"))
        go.addItem(.separator())
        for (index, suiteApp) in SuiteApp.all.enumerated() {
            let entry = item(suiteApp.name, #selector(openApp(_:)), "\(index + 1)")
            entry.image = suiteApp.icon(size: 16)
            entry.tag = index
            go.addItem(entry)
        }
        go.addItem(.separator())
        go.addItem(item("Settings", #selector(openSettingsPage(_:)), symbol: "slider.horizontal.3"))
        go.addItem(item("Admin", #selector(openAdminPage(_:)), symbol: "person.2"))

        let window = submenu(in: main, title: "Window")
        window.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        window.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        window.addItem(.separator())
        window.addItem(item("voidkoi", #selector(showMainWindow(_:)), "0", [.command, .option]))
        window.addItem(.separator())
        window.addItem(withTitle: "Bring All to Front", action: #selector(NSApplication.arrangeInFront(_:)), keyEquivalent: "")
        NSApp.windowsMenu = window

        let help = submenu(in: main, title: "Help")
        NSApp.helpMenu = help

        return main
    }

    private func submenu(in main: NSMenu, title: String) -> NSMenu {
        let menu = NSMenu(title: title)
        main.addItem(withTitle: title, action: nil, keyEquivalent: "").submenu = menu
        return menu
    }

    /// macOS 26 and later draw a symbol beside the standard items; `symbol` gives
    /// this one its own there, so a menu doesn't mix items with and without.
    func item(_ title: String, _ action: Selector, _ key: String = "", _ modifiers: NSEvent.ModifierFlags = .command, symbol: String? = nil) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.keyEquivalentModifierMask = modifiers
        item.target = self
        if #available(macOS 26, *), let symbol {
            item.image = NSImage(systemSymbolName: symbol, accessibilityDescription: nil)
        }
        return item
    }

    /// AppKit renames "Preferences…" to "Settings…" as the app finishes launching.
    /// It stays Preferences here: Settings is the server's page, in the Go menu.
    func keepPreferencesTitle() {
        let item = NSApp.mainMenu?.items.first?.submenu?.items.first { $0.action == #selector(openPreferences(_:)) }
        item?.title = "Preferences…"
    }
}
