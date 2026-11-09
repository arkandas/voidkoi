import AppKit
import WebKit

enum App {
    static var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0"
    }

    /// Safari's version goes with the system's, so the pages see a current Safari.
    static var userAgent: String {
        "Version/\(ProcessInfo.processInfo.operatingSystemVersion.majorVersion).0 Safari/605.1.15 voidkoi/\(version)"
    }
}

/// A snapshot run (debug builds only): the windows are drawn off the screen into
/// pictures, nothing is kept and nothing reaches the screen, the Dock or the clipboard.
enum Snapshot {
    #if DEBUG
    static let folder = ProcessInfo.processInfo.environment["VOIDKOI_SNAPSHOT"].flatMap { $0.isEmpty ? nil : $0 }
    #else
    static let folder: String? = nil
    #endif

    static var isActive: Bool { folder != nil }

    /// What happened, in the folder's log.txt as it happens.
    static func log(_ line: String) {
        guard let folder else { return }
        let time = String(format: "%.2f", Date().timeIntervalSince(started))
        let url = URL(fileURLWithPath: folder).appendingPathComponent("log.txt")
        let data = Data("[\(time)] \(line)\n".utf8)
        if !fresh, let handle = try? FileHandle(forWritingTo: url) {
            handle.seekToEndOfFile()
            handle.write(data)
            try? handle.close()
        } else {
            try? FileManager.default.createDirectory(atPath: folder, withIntermediateDirectories: true)
            try? data.write(to: url)
            fresh = false
        }
    }

    nonisolated(unsafe) private static var fresh = true
    private static let started = Date()
}

/// Web addresses as people type them, and whether two belong to the same site.
enum Address {
    /// "example.com", "https://example.com/" or "http://192.168.1.20:3000": the site, with no path.
    /// http only for this Mac, a private network address or a .local name.
    static func parse(_ text: String) -> URL? {
        var text = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") { text = "https://" + text }
        guard var components = URLComponents(string: text),
              let scheme = components.scheme?.lowercased(), scheme == "https" || scheme == "http",
              let host = components.host, !host.isEmpty,
              scheme == "https" || isLocal(host)
        else { return nil }
        components.scheme = scheme
        components.host = host.lowercased()
        if components.port == defaultPort(scheme) { components.port = nil }
        components.user = nil
        components.password = nil
        components.path = ""
        components.query = nil
        components.fragment = nil
        return components.url
    }

    /// Two addresses are the same site when scheme, host and port match.
    static func sameOrigin(_ a: URL?, _ b: URL?) -> Bool {
        guard let a, let b, let schemeA = a.scheme?.lowercased(), let schemeB = b.scheme?.lowercased() else { return false }
        return schemeA == schemeB
            && a.host?.lowercased() == b.host?.lowercased()
            && (a.port ?? defaultPort(schemeA)) == (b.port ?? defaultPort(schemeB))
    }

    /// A frame's origin, as WebKit gives it, belongs to the site.
    static func sameOrigin(_ origin: WKSecurityOrigin, _ url: URL?) -> Bool {
        sameOrigin(protocol: origin.protocol, host: origin.host, port: origin.port, url)
    }

    /// The same protocol, host and port (0 for the protocol's own). A sandboxed frame's
    /// origin has no protocol and belongs to no site.
    static func sameOrigin(protocol: String, host: String, port: Int, _ url: URL?) -> Bool {
        let scheme = `protocol`.lowercased()
        guard !scheme.isEmpty, let url, let urlScheme = url.scheme?.lowercased(), let urlHost = url.host else { return false }
        return scheme == urlScheme
            && bare(host) == bare(urlHost)
            && (port == 0 ? defaultPort(scheme) : port) == (url.port ?? defaultPort(urlScheme))
    }

    /// This Mac, an address on a private network, or a .local name.
    static func isLocal(_ host: String) -> Bool {
        let host = bare(host)
        if host == "localhost" || host.hasSuffix(".local") { return true }
        var v4 = in_addr()
        if inet_pton(AF_INET, host, &v4) == 1 {
            let octets = withUnsafeBytes(of: v4) { Array($0) }
            switch (octets[0], octets[1]) {
            case (127, _), (10, _), (172, 16...31), (192, 168), (169, 254): return true
            default: return false
            }
        }
        // ::1, unique local fc00::/7 and link-local fe80::/10, with or without a zone ("%en0").
        var v6 = in6_addr()
        let address = host.split(separator: "%", maxSplits: 1).first.map(String.init) ?? host
        guard inet_pton(AF_INET6, address, &v6) == 1 else { return false }
        let bytes = withUnsafeBytes(of: v6) { Array($0) }
        return bytes == Array(repeating: 0, count: 15) + [1]
            || bytes[0] & 0xFE == 0xFC
            || (bytes[0] == 0xFE && bytes[1] & 0xC0 == 0x80)
    }

    /// The host lowercased, an IPv6 address without its brackets.
    private static func bare(_ host: String) -> String {
        host.lowercased().trimmingCharacters(in: CharacterSet(charactersIn: "[]"))
    }

    /// The site as the page sees it in `location.origin`.
    static func origin(_ url: URL) -> String {
        let scheme = url.scheme?.lowercased() ?? "https"
        var origin = "\(scheme)://\(url.host?.lowercased() ?? "")"
        if let port = url.port, port != defaultPort(scheme) { origin += ":\(port)" }
        return origin
    }

    /// "example.com", or "example.com:8443".
    static func name(_ url: URL) -> String {
        var name = url.host ?? url.absoluteString
        if let port = url.port, port != defaultPort(url.scheme?.lowercased() ?? "https") { name += ":\(port)" }
        return name
    }

    private static func defaultPort(_ scheme: String) -> Int? {
        switch scheme {
        case "http": return 80
        case "https": return 443
        default: return nil
        }
    }
}

extension NSAppearance {
    var isDark: Bool { bestMatch(from: [.aqua, .darkAqua]) == .darkAqua }
}

extension NSColor {
    /// "rgb(238, 243, 245)", "rgb(12 16 18)" or "rgba(0, 0, 0, 0.5)"; nothing when it isn't opaque.
    static func css(_ css: String?) -> NSColor? {
        guard let css, let open = css.firstIndex(of: "("), let close = css.lastIndex(of: ")"),
              css.hasPrefix("rgb") else { return nil }
        let parts = css[css.index(after: open)..<close]
            .split(whereSeparator: { $0 == "," || $0 == " " || $0 == "/" })
            .compactMap { Double($0) }
        guard parts.count >= 3 else { return nil }
        if parts.count >= 4, parts[3] < 1 { return nil }
        return NSColor(srgbRed: parts[0] / 255, green: parts[1] / 255, blue: parts[2] / 255, alpha: 1)
    }

    /// "#0c1012", to keep.
    var hex: String {
        guard let rgb = usingColorSpace(.sRGB) else { return "" }
        return String(format: "#%02x%02x%02x", Int(rgb.redComponent * 255), Int(rgb.greenComponent * 255), Int(rgb.blueComponent * 255))
    }

    convenience init?(hex: String) {
        guard hex.count == 7, hex.hasPrefix("#"), let value = Int(hex.dropFirst(), radix: 16) else { return nil }
        self.init(srgbRed: CGFloat((value >> 16) & 0xFF) / 255, green: CGFloat((value >> 8) & 0xFF) / 255, blue: CGFloat(value & 0xFF) / 255, alpha: 1)
    }

    var isLight: Bool {
        guard let rgb = usingColorSpace(.sRGB) else { return true }
        return 0.2126 * rgb.redComponent + 0.7152 * rgb.greenComponent + 0.0722 * rgb.blueComponent > 0.5
    }
}

/// Holds its target weakly: WebKit keeps message handlers for as long as the web view lives.
final class WeakMessageHandler: NSObject, WKScriptMessageHandlerWithReply {
    private weak var target: WKScriptMessageHandlerWithReply?

    init(_ target: WKScriptMessageHandlerWithReply) {
        self.target = target
    }

    @MainActor
    func userContentController(
        _ userContentController: WKUserContentController,
        didReceive message: WKScriptMessage,
        replyHandler: @escaping @MainActor @Sendable (Any?, String?) -> Void
    ) {
        if let target {
            target.userContentController(userContentController, didReceive: message, replyHandler: replyHandler)
        } else {
            replyHandler(nil, nil)
        }
    }
}

@MainActor
enum Alerts {
    /// As a sheet on the window when it's on show, else on its own. A snapshot run
    /// only notes it and takes the first button.
    static func present(_ alert: NSAlert, in window: NSWindow?, then: @escaping (NSApplication.ModalResponse) -> Void = { _ in }) {
        if Snapshot.isActive {
            Snapshot.log("alert: \(alert.messageText) \(alert.informativeText)".trimmingCharacters(in: .whitespaces))
            return then(.alertFirstButtonReturn)
        }
        if let window, window.isVisible, window.attachedSheet == nil {
            alert.beginSheetModal(for: window, completionHandler: then)
        } else {
            then(alert.runModal())
        }
    }

    static func make(_ message: String, _ detail: String = "", buttons: [String] = []) -> NSAlert {
        let alert = NSAlert()
        alert.messageText = message
        alert.informativeText = detail
        for title in buttons { alert.addButton(withTitle: title) }
        return alert
    }
}

/// Runs `work` on the main actor after `seconds`.
func after(_ seconds: Double, _ work: @escaping @MainActor () -> Void) {
    DispatchQueue.main.asyncAfter(deadline: .now() + seconds) {
        MainActor.assumeIsolated { work() }
    }
}

/// Runs `work` on the main actor at the next turn of the main loop, outside
/// whatever WebKit is in the middle of. Called back inside a WebKit delegate
/// method, `MainActor.assumeIsolated` can crash, and a load started there runs
/// into the decision WebKit is still waiting for.
func onMain(_ work: @escaping @MainActor () -> Void) {
    DispatchQueue.main.async {
        MainActor.assumeIsolated { work() }
    }
}
