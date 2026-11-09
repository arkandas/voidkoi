import AppKit
import SwiftUI

/// Preferences: the server.
@MainActor
final class PreferencesWindowController: NSWindowController {
    init() {
        let window = AppWindow(contentRect: NSRect(x: 0, y: 0, width: 460, height: 120), styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.title = "Preferences"
        window.isReleasedWhenClosed = false
        window.isRestorable = false
        window.tabbingMode = .disallowed
        super.init(window: window)
        let hosting = NSHostingController(rootView: PreferencesView(settings: .shared) { [weak self] url in self?.connect(url) })
        hosting.sizingOptions = [.preferredContentSize]
        window.contentViewController = hosting
        window.center()
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// Another server signs out of this one, so it asks first.
    private func connect(_ url: URL) {
        let settings = Settings.shared
        guard let current = settings.server, !Address.sameOrigin(current, url) else { return settings.setServer(url) }
        guard window?.attachedSheet == nil else { return }
        let alert = Alerts.make("Switch to \(Address.name(url))?", "You'll be signed out of \(Address.name(current)).", buttons: ["Switch", "Cancel"])
        Alerts.present(alert, in: window) { response in
            if response == .alertFirstButtonReturn { settings.setServer(url) }
        }
    }
}

struct PreferencesView: View {
    @ObservedObject var settings: Settings
    let connect: (URL) -> Void
    @State private var address = ""

    var body: some View {
        Form {
            Section {
                TextField("Server", text: $address, prompt: Text(verbatim: "https://example.com"))
            } footer: {
                HStack {
                    Spacer()
                    Button("Connect", action: submit)
                        .keyboardShortcut(.defaultAction)
                        .disabled(!changed)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 460)
        .fixedSize(horizontal: false, vertical: true)
        .onReceive(settings.$server) { address = $0?.absoluteString ?? "" }
    }

    private var parsed: URL? { Address.parse(address) }

    private var changed: Bool {
        guard let parsed else { return false }
        return !Address.sameOrigin(parsed, settings.server)
    }

    private func submit() {
        guard let parsed, changed else { return }
        connect(parsed)
    }
}

/// In the window when there's no server yet.
struct ServerPromptView: View {
    let connect: (URL) -> Void
    @State private var address = ""

    var body: some View {
        VStack(spacing: 28) {
            Image(nsImage: Bundle.main.image(forResource: "koi") ?? NSImage())
                .resizable()
                .interpolation(.high)
                .frame(width: 128, height: 128)
            HStack(spacing: 10) {
                Text("Server")
                    .foregroundStyle(.secondary)
                TextField("Server", text: $address, prompt: Text(verbatim: "https://example.com"))
                    .textFieldStyle(.roundedBorder)
                    .labelsHidden()
                    .frame(width: 300)
                Button("Connect", action: submit)
                    .keyboardShortcut(.defaultAction)
                    .disabled(Address.parse(address) == nil)
            }
            .controlSize(.large)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func submit() {
        guard let url = Address.parse(address) else { return }
        connect(url)
    }
}

/// A window a snapshot run can put off the screen, where AppKit would otherwise pull it back.
final class AppWindow: NSWindow {
    override func constrainFrameRect(_ frameRect: NSRect, to screen: NSScreen?) -> NSRect {
        Snapshot.isActive ? frameRect : super.constrainFrameRect(frameRect, to: screen)
    }
}
