import AppKit
@preconcurrency import UserNotifications

/// Notifications and the badge on the Dock icon: the ones the page asks for
/// through the bridge, and the app's own (a download done, uploads finished).
@MainActor
final class Notifier: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Notifier()

    /// A page's notification was clicked: the page it named.
    var onOpen: ((URL) -> Void)?

    private var available: Bool { !Snapshot.isActive && Bundle.main.bundleIdentifier != nil }

    /// Before the app finishes launching, so a click that launched it still arrives.
    func start() {
        guard available else { return }
        UNUserNotificationCenter.current().delegate = self
    }

    /// A notification from the page. `url` opens in the window when it's clicked;
    /// a later one with the same `tag` takes this one's place. Answers whether it
    /// could be shown: false when notifications are off for voidkoi.
    func notify(title: String, body: String?, url: URL?, tag: String?, silent: Bool, done: @escaping (Bool) -> Void) {
        if Snapshot.isActive {
            Snapshot.log("notify: \(title) | \(body ?? "") | \(url?.absoluteString ?? "") | tag \(tag ?? "") | silent \(silent)")
            return done(true)
        }
        guard available else { return done(false) }
        let content = UNMutableNotificationContent()
        content.title = title
        if let body { content.body = body }
        if let url { content.userInfo = ["url": url.absoluteString] }
        if let tag { content.threadIdentifier = tag }
        content.sound = silent ? nil : .default
        deliver(content, id: tag.map { "page-\($0)" } ?? UUID().uuidString, done: done)
    }

    /// One of the app's own, shown only while voidkoi is in the background: in
    /// front, the page already shows it. Clicking it shows `reveal` in the Finder.
    func post(title: String, body: String?, reveal: URL?) {
        guard available, !NSApp.isActive else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        if let body { content.body = body }
        if let reveal { content.userInfo = ["reveal": reveal.path] }
        deliver(content, id: UUID().uuidString) { _ in }
    }

    /// The number on the Dock icon. Nil shows a dot; zero clears it.
    func setBadge(_ count: Int?) {
        let label: String?
        switch count {
        case nil: label = "•"
        case let count? where count > 0: label = count > 999 ? "999+" : String(count)
        default: label = nil
        }
        NSApp.dockTile.badgeLabel = label
        Snapshot.log("badge: \(label ?? "none")")
    }

    /// Signed out, or another server: its badge and notifications go.
    func clear() {
        setBadge(0)
        guard available else { return }
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
        UNUserNotificationCenter.current().removeAllPendingNotificationRequests()
    }

    private func deliver(_ content: UNMutableNotificationContent, id: String, done: @escaping (Bool) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else {
                DispatchQueue.main.async { done(false) }
                return
            }
            let request = UNNotificationRequest(identifier: id, content: content, trigger: nil)
            UNUserNotificationCenter.current().add(request) { error in
                DispatchQueue.main.async { done(error == nil) }
            }
        }
    }

    // MARK: UNUserNotificationCenterDelegate

    /// The page decides when to notify, so its notifications show in front too.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        let info = response.notification.request.content.userInfo
        let url = (info["url"] as? String).flatMap(URL.init(string:))
        let reveal = info["reveal"] as? String
        DispatchQueue.main.async {
            MainActor.assumeIsolated {
                if let reveal {
                    NSWorkspace.shared.activateFileViewerSelecting([URL(fileURLWithPath: reveal)])
                } else if let url {
                    Notifier.shared.onOpen?(url)
                } else {
                    NSApp.activate()
                }
            }
        }
        completionHandler()
    }
}
