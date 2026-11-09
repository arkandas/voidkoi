import AppKit
import WebKit

/// What the app keeps between launches, in its defaults. A snapshot run keeps it
/// in memory, so it starts from nothing and leaves nothing behind.
@MainActor
final class Settings: ObservableObject {
    static let shared = Settings(persistent: !Snapshot.isActive)
    static let serverDidChange = Notification.Name("voidkoi.serverDidChange")

    private let defaults: UserDefaults?
    private var memory: [String: Any] = [:]

    /// The server: the one set in Preferences, else the one built in.
    @Published private(set) var server: URL?

    private init(persistent: Bool) {
        defaults = persistent ? .standard : nil
        server = nil
        server = (string("server").flatMap(Address.parse)) ?? Self.builtIn
        #if DEBUG
        if Snapshot.isActive {
            server = ProcessInfo.processInfo.environment["VOIDKOI_SNAPSHOT_SERVER"].flatMap(Address.parse) ?? Self.builtIn
        }
        #endif
    }

    /// The address built into the app (Info.plist), if any.
    static var builtIn: URL? {
        (Bundle.main.object(forInfoDictionaryKey: "VoidkoiServer") as? String).flatMap(Address.parse)
    }

    func setServer(_ url: URL) {
        guard let url = Address.parse(url.absoluteString) else { return }
        set("server", url.absoluteString)
        guard !Address.sameOrigin(url, server) else { return }
        server = url
        lastPage = nil
        NotificationCenter.default.post(name: Self.serverDidChange, object: self)
    }

    /// The page open last, to open again at the next launch.
    var lastPage: URL? {
        get { string("lastPage").flatMap(URL.init(string:)) }
        set { set("lastPage", newValue?.absoluteString) }
    }

    var zoom: Double {
        get { (value("pageZoom") as? Double).flatMap { $0 > 0 ? $0 : nil } ?? 1 }
        set { set("pageZoom", newValue) }
    }

    /// The colour of the page shown last, for the window before the page has drawn.
    var lastColor: NSColor? {
        get { string("pageColor").flatMap(NSColor.init(hex:)) }
        set { set("pageColor", newValue?.hex) }
    }

    /// The website data store in use, and the server it belongs to.
    var dataStore: (id: UUID, server: String)? {
        get {
            guard let id = string("dataStore").flatMap(UUID.init(uuidString:)), let server = string("dataStoreServer") else { return nil }
            return (id, server)
        }
        set {
            set("dataStore", newValue?.id.uuidString)
            set("dataStoreServer", newValue?.server)
        }
    }

    private func value(_ key: String) -> Any? {
        defaults.map { $0.object(forKey: key) } ?? memory[key]
    }

    private func string(_ key: String) -> String? {
        (value(key) as? String).flatMap { $0.isEmpty ? nil : $0 }
    }

    private func set(_ key: String, _ value: Any?) {
        if let defaults {
            defaults.set(value, forKey: key)
        } else {
            memory[key] = value
        }
    }
}

/// Cookies, storage and caches: a store for each server, so one server's session
/// never reaches another. A store goes when its server does.
@MainActor
enum DataStores {
    /// The server's store: the one in use while the server stays the same, else a new one.
    static func store(for server: URL) -> WKWebsiteDataStore {
        if Snapshot.isActive { return .nonPersistent() }
        let settings = Settings.shared
        let origin = Address.origin(server)
        if let current = settings.dataStore, current.server == origin {
            return WKWebsiteDataStore(forIdentifier: current.id)
        }
        let id = UUID()
        settings.dataStore = (id, origin)
        return WKWebsiteDataStore(forIdentifier: id)
    }

    /// Empties a store a page has stopped using, then removes it with the others
    /// left from earlier servers. What can't go yet goes at the next launch.
    static func discard(_ store: WKWebsiteDataStore?) {
        guard !Snapshot.isActive else { return }
        guard let store else { return removeUnused() }
        store.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: .distantPast) {
            after(2) { removeUnused() }
        }
    }

    /// Removes every store but the current one.
    static func removeUnused() {
        guard !Snapshot.isActive else { return }
        let keep = Settings.shared.dataStore?.id
        WKWebsiteDataStore.fetchAllDataStoreIdentifiers { ids in
            onMain {
                for id in ids where id != keep {
                    WKWebsiteDataStore.remove(forIdentifier: id) { _ in }
                }
            }
        }
    }
}
