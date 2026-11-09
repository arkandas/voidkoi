import AppKit

/// The suite's apps, in the order of its rail.
struct SuiteApp: Equatable {
    let id: String
    let name: String

    var path: String { "/" + id }

    static let all: [SuiteApp] = [
        SuiteApp(id: "notes", name: "Notes"),
        SuiteApp(id: "tasks", name: "Tasks"),
        SuiteApp(id: "files", name: "Files"),
        SuiteApp(id: "utilikit", name: "Utilikit"),
        SuiteApp(id: "habits", name: "Habits"),
        SuiteApp(id: "talk", name: "Talk"),
        SuiteApp(id: "wiki", name: "Wiki"),
    ]

    static let files = all.first { $0.id == "files" }!

    /// The app a page belongs to, from its path.
    static func of(path: String) -> SuiteApp? {
        all.first { path == $0.path || path.hasPrefix($0.path + "/") }
    }

    /// Its icon at the given size, from Resources.
    @MainActor
    func icon(size: CGFloat) -> NSImage? {
        guard let source = Bundle.main.image(forResource: id), let image = source.copy() as? NSImage else { return nil }
        image.size = NSSize(width: size, height: size)
        return image
    }
}
