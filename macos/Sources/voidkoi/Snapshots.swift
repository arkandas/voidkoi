#if DEBUG
import AppKit
import SwiftUI
import WebKit

/// With VOIDKOI_SNAPSHOT set to a folder, the app draws itself into pictures there
/// and quits: the menus (menus.txt), Preferences, the window that asks for a server,
/// and the window after each step of VOIDKOI_SNAPSHOT_STEPS on VOIDKOI_SNAPSHOT_SERVER.
/// log.txt says what happened.
///
/// The windows are off the screen. With VOIDKOI_SNAPSHOT_HIDDEN=1 they are on it but
/// transparent, click-through and behind every other window, for pages that need
/// animation frames. Nothing is kept: settings stay in memory, the data store is a
/// temporary one, and nothing reaches the Dock, the clipboard or Notification Center.
///
/// Steps, separated by spaces, each followed by a picture, NN-name.png:
///   /files or https://…   load it
///   js:/path/file.js      run the file in the page, as the body of an async function
///   upload:/path          hand it to Files, as a drop on the Dock icon does
///   drop:/path            drag it onto the page, as from the Finder (WebKit doesn't
///                         always read the stand-in drag's pasteboard, so it can miss)
///   server:https://…      switch servers, as Preferences does
///   signout               sign out, as the app menu does
///   crash                 end the page's web content process, as a crash would
///   reload                reload, as Go → Reload does (Try Again when the error shows)
///   wait:2                wait two seconds
///
/// Also: VOIDKOI_SNAPSHOT_SIZE=1280x800 (the window's content), VOIDKOI_SNAPSHOT_APPEARANCE=dark,
/// VOIDKOI_SNAPSHOT_WAIT=1.5 (seconds to wait after a page settles). At the end,
/// menus-end.txt shows the menus as they'd open: what's checked and what's off.
@MainActor
enum Snapshots {
    private static let environment = ProcessInfo.processInfo.environment
    private static var hidden: Bool { environment["VOIDKOI_SNAPSHOT_HIDDEN"] == "1" }

    static func start(app: AppDelegate) {
        Task { @MainActor in
            await run(app: app)
            exit(0)
        }
    }

    private static func run(app: AppDelegate) async {
        guard let path = Snapshot.folder else { return }
        let folder = URL(fileURLWithPath: path, isDirectory: true)
        try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        if let name = environment["VOIDKOI_SNAPSHOT_APPEARANCE"] {
            NSApp.appearance = NSAppearance(named: name == "dark" ? .darkAqua : .aqua)
        }
        let size = parseSize(environment["VOIDKOI_SNAPSHOT_SIZE"]) ?? NSSize(width: 1280, height: 800)
        let steps = (environment["VOIDKOI_SNAPSHOT_STEPS"] ?? "").split(separator: " ").map(String.init)

        write(describe(NSApp.mainMenu) + "\nDock menu\n" + describe(app.applicationDockMenu(NSApp), depth: 1), to: folder.appendingPathComponent("menus.txt"))

        app.openPreferences(nil)
        if let window = app.preferences?.window {
            place(window)
            try? await Task.sleep(for: .seconds(0.6))
            await shoot(window, page: nil, to: folder.appendingPathComponent("preferences.png"))
            window.orderOut(nil)
        }

        let ask = AppWindow(contentRect: NSRect(origin: .zero, size: size), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        ask.title = "voidkoi"
        ask.isRestorable = false
        ask.isReleasedWhenClosed = false
        ask.contentView = NSHostingView(rootView: ServerPromptView { _ in })
        place(ask)
        try? await Task.sleep(for: .seconds(0.6))
        await shoot(ask, page: nil, to: folder.appendingPathComponent("server-prompt.png"))
        ask.orderOut(nil)

        guard let main = app.main, let window = main.window else { return }
        window.setContentSize(size)
        place(window)
        await settle(main)
        await shoot(window, page: main.page, to: folder.appendingPathComponent("00-start.png"))
        for (index, step) in steps.enumerated() {
            await perform(step, main: main)
            await settle(main)
            let name = String(format: "%02d-%@.png", index + 1, slug(step))
            await shoot(window, page: main.page, to: folder.appendingPathComponent(name))
        }

        // The menus as they'd open now: what's on, and what's checked.
        NSApp.mainMenu?.items.forEach { $0.submenu?.update() }
        write(describe(NSApp.mainMenu, states: true), to: folder.appendingPathComponent("menus-end.txt"))

        let badge = NSApp.dockTile.badgeLabel ?? "none"
        Snapshot.log("end: title \(window.title) | appearance \(window.effectiveAppearance.isDark ? "dark" : "light") | page \(main.page?.url?.absoluteString ?? "none") | app \(main.currentApp?.name ?? "none") | badge \(badge) | back \(main.canGoBack) | last page \(Settings.shared.lastPage?.absoluteString ?? "none")")
    }

    private static func perform(_ step: String, main: MainWindowController) async {
        Snapshot.log("step: \(step)")
        if step.hasPrefix("js:") {
            guard let source = try? String(contentsOfFile: String(step.dropFirst(3)), encoding: .utf8), let webView = main.page?.webView else {
                return Snapshot.log("js: no script or no page")
            }
            let result: String = await withCheckedContinuation { continuation in
                webView.callAsyncJavaScript(source, arguments: [:], in: nil, in: .page) { result in
                    switch result {
                    case .success(let value): continuation.resume(returning: "\(value)")
                    case .failure(let error): continuation.resume(returning: "error: \(error)")
                    }
                }
            }
            Snapshot.log("js result: \(result)")
        } else if step.hasPrefix("upload:") {
            main.upload([URL(fileURLWithPath: String(step.dropFirst(7)))])
            let deadline = Date().addingTimeInterval(40)
            while main.uploads.isWaiting, Date() < deadline {
                try? await Task.sleep(for: .milliseconds(200))
            }
            try? await Task.sleep(for: .seconds(2))
        } else if step.hasPrefix("drop:") {
            guard let webView = main.page?.webView, let window = webView.window else { return }
            let point = webView.convert(NSPoint(x: webView.bounds.midX, y: webView.bounds.midY), to: nil)
            let drag = Drag(files: [URL(fileURLWithPath: String(step.dropFirst(5)))], at: point, in: window)
            // As AppKit delivers a drag: from the main loop, one event at a time, and
            // the drop only when the view accepts it.
            var done = false
            var operation: NSDragOperation = []
            after(0) { _ = webView.draggingEntered(drag) }
            after(0.4) { _ = webView.draggingUpdated(drag) }
            after(0.7) { operation = webView.draggingUpdated(drag) }
            after(1.0) {
                Snapshot.log("drag operation: \(operation.rawValue)")
                if operation.isEmpty {
                    webView.draggingExited(drag)
                } else {
                    Snapshot.log("drop performed: \(webView.performDragOperation(drag))")
                    if webView.responds(to: #selector(NSDraggingDestination.concludeDragOperation(_:))) {
                        webView.concludeDragOperation(drag)
                    }
                }
                done = true
            }
            let deadline = Date().addingTimeInterval(40)
            while !done || main.uploads.isWaiting, Date() < deadline {
                try? await Task.sleep(for: .milliseconds(200))
            }
            drag.draggingPasteboard.releaseGlobally()
            try? await Task.sleep(for: .seconds(2))
        } else if step.hasPrefix("server:") {
            if let url = Address.parse(String(step.dropFirst(7))) { Settings.shared.setServer(url) }
        } else if step == "signout" {
            main.signOut()
            try? await Task.sleep(for: .seconds(1))
        } else if step == "crash" {
            let key = "_webProcessIdentifier"
            guard let webView = main.page?.webView, webView.responds(to: NSSelectorFromString(key)),
                  let pid = (webView.value(forKey: key) as? NSNumber)?.int32Value, pid > 0 else {
                return Snapshot.log("crash: no web content process")
            }
            Snapshot.log("crash: web content process \(pid)")
            kill(pid, SIGKILL)
            try? await Task.sleep(for: .seconds(1))
        } else if step == "reload" {
            main.reload()
        } else if step.hasPrefix("wait:") {
            try? await Task.sleep(for: .seconds(Double(step.dropFirst(5)) ?? 1))
        } else if let url = URL(string: step), url.scheme != nil {
            main.open(url)
        } else {
            main.go(step)
        }
    }

    /// Until nothing has loaded for a second, and then a little longer.
    private static func settle(_ main: MainWindowController) async {
        let deadline = Date().addingTimeInterval(30)
        var quietSince: Date?
        while Date() < deadline {
            try? await Task.sleep(for: .milliseconds(100))
            if main.page?.webView.isLoading == true {
                quietSince = nil
                continue
            }
            let since = quietSince ?? Date()
            quietSince = since
            if Date().timeIntervalSince(since) > 1 { break }
        }
        try? await Task.sleep(for: .seconds(Double(environment["VOIDKOI_SNAPSHOT_WAIT"] ?? "") ?? 1.5))
    }

    private static func place(_ window: NSWindow) {
        window.isRestorable = false
        if hidden {
            let screen = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
            window.setFrameOrigin(NSPoint(x: screen.minX, y: screen.maxY - window.frame.height))
            window.alphaValue = 0
            window.ignoresMouseEvents = true
            window.hasShadow = false
            window.level = NSWindow.Level(rawValue: NSWindow.Level.normal.rawValue - 1)
            window.collectionBehavior.formUnion([.transient, .ignoresCycle])
        } else {
            window.setFrameOrigin(NSPoint(x: -20000, y: -20000))
        }
        window.orderFrontRegardless()
    }

    /// The window as it looks, at twice its size in points, as on a Retina screen:
    /// its frame and title bar drawn by AppKit, and the web view's content from
    /// WebKit, which draws it in another process.
    private static func shoot(_ window: NSWindow, page: WebPage?, to url: URL) async {
        guard let frameView = window.contentView?.superview else { return }
        frameView.layoutSubtreeIfNeeded()
        let bounds = frameView.bounds
        let scale: CGFloat = 2
        guard let rep = NSBitmapImageRep(
            bitmapDataPlanes: nil, pixelsWide: Int(bounds.width * scale), pixelsHigh: Int(bounds.height * scale),
            bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
            colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0
        ) else { return }
        rep.size = bounds.size
        frameView.cacheDisplay(in: bounds, to: rep)
        if let webView = page?.webView, webView.window === window, webView.superview?.subviews.last === webView {
            if let image = await snapshot(of: webView, width: webView.bounds.width * scale / window.backingScaleFactor) {
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
                image.draw(in: webView.convert(webView.bounds, to: frameView))
                NSGraphicsContext.restoreGraphicsState()
            }
        }
        if let data = rep.representation(using: .png, properties: [:]) {
            try? data.write(to: url)
            Snapshot.log("saved \(url.lastPathComponent) (\(rep.pixelsWide)x\(rep.pixelsHigh))")
        }
    }

    /// The page as WebKit draws it. A page off the screen may not draw again soon,
    /// so a second try takes it as it is.
    private static func snapshot(of webView: WKWebView, width: CGFloat) async -> NSImage? {
        for afterScreenUpdates in [true, false] {
            let configuration = WKSnapshotConfiguration()
            configuration.afterScreenUpdates = afterScreenUpdates
            configuration.snapshotWidth = NSNumber(value: Double(width))
            do {
                return try await webView.takeSnapshot(configuration: configuration)
            } catch {
                Snapshot.log("web snapshot failed (after screen updates: \(afterScreenUpdates)): \(error.localizedDescription)")
            }
        }
        return nil
    }

    private static func describe(_ menu: NSMenu?, depth: Int = 0, states: Bool = false) -> String {
        guard let menu else { return "" }
        var lines: [String] = []
        let indent = String(repeating: "  ", count: depth)
        for item in menu.items {
            if item.isSeparatorItem {
                lines.append(indent + "---")
                continue
            }
            var line = indent + item.title
            if !item.keyEquivalent.isEmpty { line += "  " + shortcut(item) }
            if item.image != nil { line += "  [icon]" }
            if item.isHidden { line += "  (hidden)" }
            if states, item.state == .on { line += "  ✓" }
            if states, !item.isEnabled { line += "  (off)" }
            lines.append(line)
            if let submenu = item.submenu, !submenu.items.isEmpty { lines.append(describe(submenu, depth: depth + 1, states: states)) }
        }
        return lines.joined(separator: "\n")
    }

    private static func shortcut(_ item: NSMenuItem) -> String {
        let modifiers = item.keyEquivalentModifierMask
        var text = ""
        if modifiers.contains(.control) { text += "⌃" }
        if modifiers.contains(.option) { text += "⌥" }
        if modifiers.contains(.shift) { text += "⇧" }
        if modifiers.contains(.command) { text += "⌘" }
        return text + item.keyEquivalent.uppercased()
    }

    private static func slug(_ step: String) -> String {
        let base = step.hasPrefix("js:") || step.hasPrefix("upload:") || step.hasPrefix("drop:")
            ? (step.split(separator: ":", maxSplits: 1).first.map(String.init) ?? "") + "-" + ((step as NSString).lastPathComponent as NSString).deletingPathExtension
            : step
        let allowed = base.lowercased().map { $0.isLetter || $0.isNumber ? $0 : "-" }
        let slug = String(allowed).split(separator: "-").joined(separator: "-")
        return slug.isEmpty ? "home" : String(slug.prefix(40))
    }

    private static func parseSize(_ text: String?) -> NSSize? {
        guard let parts = text?.lowercased().split(separator: "x"), parts.count == 2,
              let width = Double(parts[0]), let height = Double(parts[1]) else { return nil }
        return NSSize(width: width, height: height)
    }

    private static func write(_ text: String, to url: URL) {
        try? text.write(to: url, atomically: true, encoding: .utf8)
    }
}

/// Files dragged from the Finder, as AppKit hands them to a view, on a pasteboard of their own.
private final class Drag: NSObject, NSDraggingInfo {
    let draggingPasteboard = NSPasteboard.withUniqueName()
    let draggingLocation: NSPoint
    private weak var window: NSWindow?

    init(files: [URL], at point: NSPoint, in window: NSWindow) {
        draggingLocation = point
        self.window = window
        let filenames = NSPasteboard.PasteboardType("NSFilenamesPboardType")
        draggingPasteboard.declareTypes([.fileURL, filenames], owner: nil)
        draggingPasteboard.setString(files[0].absoluteString, forType: .fileURL)
        draggingPasteboard.setPropertyList(files.map(\.path), forType: filenames)
    }

    var draggingDestinationWindow: NSWindow? { window }
    var draggingSourceOperationMask: NSDragOperation { [.copy, .link, .generic] }
    var draggedImageLocation: NSPoint { draggingLocation }
    var draggedImage: NSImage? { nil }
    var draggingSource: Any? { nil }
    var draggingSequenceNumber: Int { 4242 }
    var draggingFormation: NSDraggingFormation = .default
    var animatesToDestination = false
    var numberOfValidItemsForDrop = 1
    var springLoadingHighlight: NSSpringLoadingHighlight { .none }
    func slideDraggedImage(to screenPoint: NSPoint) {}
    func resetSpringLoading() {}
    func enumerateDraggingItems(
        options enumOpts: NSDraggingItemEnumerationOptions = [],
        for view: NSView?,
        classes classArray: [AnyClass],
        searchOptions: [NSPasteboard.ReadingOptionKey: Any] = [:],
        using block: (NSDraggingItem, Int, UnsafeMutablePointer<ObjCBool>) -> Void
    ) {}
}
#endif
