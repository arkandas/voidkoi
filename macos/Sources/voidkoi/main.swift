import AppKit

MainActor.assumeIsolated {
    let app = NSApplication.shared
    // A snapshot run stays out of the Dock and off the screen.
    if Snapshot.isActive { app.setActivationPolicy(.accessory) }
    Snapshot.log("started \(App.userAgent)")
    // NSApplication holds its delegate weakly: this one lives as long as run() does.
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
