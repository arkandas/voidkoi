import AppKit

/// Over the page when the server can't be reached.
@MainActor
final class ErrorView: NSView {
    private let title = NSTextField(labelWithString: "")
    private let detail = NSTextField(wrappingLabelWithString: "")
    private let retry: () -> Void
    private let changeServer: () -> Void

    init(retry: @escaping () -> Void, changeServer: @escaping () -> Void) {
        self.retry = retry
        self.changeServer = changeServer
        super.init(frame: .zero)
        wantsLayer = true

        let icon = NSImageView(image: NSImage(systemSymbolName: "wifi.exclamationmark", accessibilityDescription: nil) ?? NSImage())
        icon.symbolConfiguration = NSImage.SymbolConfiguration(pointSize: 40, weight: .regular)
        icon.contentTintColor = .secondaryLabelColor

        title.font = .systemFont(ofSize: 20, weight: .semibold)
        title.alignment = .center
        detail.font = .systemFont(ofSize: 13)
        detail.textColor = .secondaryLabelColor
        detail.alignment = .center
        detail.preferredMaxLayoutWidth = 380

        let tryAgain = NSButton(title: "Try Again", target: self, action: #selector(tryAgainClicked))
        tryAgain.keyEquivalent = "\r"
        let change = NSButton(title: "Change Server…", target: self, action: #selector(changeClicked))
        let buttons = NSStackView(views: [change, tryAgain])
        buttons.spacing = 12

        let stack = NSStackView(views: [icon, title, detail, buttons])
        stack.orientation = .vertical
        stack.spacing = 12
        stack.setCustomSpacing(20, after: detail)
        stack.translatesAutoresizingMaskIntoConstraints = false
        addSubview(stack)
        NSLayoutConstraint.activate([
            stack.centerXAnchor.constraint(equalTo: centerXAnchor),
            stack.centerYAnchor.constraint(equalTo: centerYAnchor),
            stack.widthAnchor.constraint(lessThanOrEqualToConstant: 420),
        ])
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var wantsUpdateLayer: Bool { true }

    override func updateLayer() {
        layer?.backgroundColor = NSColor.windowBackgroundColor.cgColor
    }

    func show(host: String, error: NSError) {
        title.stringValue = "Can't connect to \(host)"
        detail.stringValue = error.localizedDescription
    }

    @objc private func tryAgainClicked() { retry() }
    @objc private func changeClicked() { changeServer() }
}
