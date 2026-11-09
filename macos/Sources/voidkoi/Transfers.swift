import AppKit
import WebKit

/// Downloads the app saves and uploads the page reports: their progress on the
/// Dock icon, and a notification when they finish while voidkoi is in the background.
@MainActor
final class Transfers: NSObject, WKDownloadDelegate {
    private var downloads: [ObjectIdentifier: (download: WKDownload, destination: URL?, observation: NSKeyValueObservation)] = [:]
    private var uploads = (active: 0, total: 0.0, loaded: 0.0)
    private let dock = DockProgress()

    var isBusy: Bool { uploads.active > 0 || !downloads.isEmpty }

    /// Downloads, or the snapshot's folder in a snapshot run.
    var folder: URL {
        if let folder = Snapshot.folder { return URL(fileURLWithPath: folder, isDirectory: true) }
        return FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask)[0]
    }

    // MARK: Downloads

    func track(_ download: WKDownload) {
        download.delegate = self
        let observation = download.progress.observe(\.fractionCompleted) { [weak self] _, _ in
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.refreshDock() } }
        }
        downloads[ObjectIdentifier(download)] = (download, nil, observation)
        refreshDock()
    }

    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping @MainActor @Sendable (URL?) -> Void
    ) {
        let destination = Self.unusedURL(in: folder, for: suggestedFilename)
        downloads[ObjectIdentifier(download)]?.destination = destination
        Snapshot.log("download: \(destination.lastPathComponent)")
        completionHandler(destination)
    }

    func downloadDidFinish(_ download: WKDownload) {
        let destination = downloads.removeValue(forKey: ObjectIdentifier(download))?.destination
        refreshDock()
        guard let destination else { return }
        quarantine(destination)
        Snapshot.log("downloaded: \(destination.lastPathComponent)")
        // Bounces the Downloads stack in the Dock, as Safari does.
        DistributedNotificationCenter.default().post(name: .init("com.apple.DownloadFileFinished"), object: destination.path)
        Notifier.shared.post(title: "Downloaded", body: destination.lastPathComponent, reveal: destination)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        let destination = downloads.removeValue(forKey: ObjectIdentifier(download))?.destination
        refreshDock()
        if (error as NSError).code == NSURLErrorCancelled { return }
        Snapshot.log("download failed: \(error.localizedDescription)")
        Notifier.shared.post(title: "Download failed", body: destination?.lastPathComponent ?? error.localizedDescription, reveal: nil)
    }

    /// Marks a download as from the internet, as Safari does, so the Mac checks it before it opens.
    private func quarantine(_ file: URL) {
        var values = URLResourceValues()
        values.quarantineProperties = [kLSQuarantineTypeKey as String: kLSQuarantineTypeWebDownload as String]
        var file = file
        do {
            try file.setResourceValues(values)
        } catch {
            Snapshot.log("quarantine failed: \(error.localizedDescription)")
        }
    }

    /// "report.pdf", or "report 2.pdf" when that is taken, as Safari names them.
    static func unusedURL(in folder: URL, for suggested: String) -> URL {
        let name = suggested.isEmpty ? "Download" : suggested.replacingOccurrences(of: "/", with: "-")
        let base = (name as NSString).deletingPathExtension
        let ext = (name as NSString).pathExtension
        var candidate = folder.appendingPathComponent(name)
        var number = 2
        while FileManager.default.fileExists(atPath: candidate.path) {
            candidate = folder.appendingPathComponent(ext.isEmpty ? "\(base) \(number)" : "\(base) \(number).\(ext)")
            number += 1
        }
        return candidate
    }

    // MARK: Uploads

    func uploadsChanged(active: Int, total: Double, loaded: Double, finished: Int) {
        uploads = (active, total, loaded)
        refreshDock()
        if active == 0, finished > 0 {
            Snapshot.log("uploaded: \(finished)")
            Notifier.shared.post(title: finished == 1 ? "Uploaded 1 file" : "Uploaded \(finished) files", body: nil, reveal: nil)
        }
    }

    /// The page went away (reloaded, or another server): its uploads went with it.
    func pageReset() {
        guard uploads.active > 0 else { return }
        uploads = (0, 0, 0)
        refreshDock()
    }

    // MARK: Dock

    private func refreshDock() {
        var total = uploads.total
        var done = uploads.loaded
        var unknown = false
        for (download, _, _) in downloads.values {
            let progress = download.progress
            if progress.totalUnitCount > 0 {
                total += Double(progress.totalUnitCount)
                done += Double(progress.completedUnitCount)
            } else {
                unknown = true
            }
        }
        let moving = uploads.active + downloads.count > 0
        dock.show(moving ? (unknown && total <= 0 ? 0 : min(1, done / max(total, 1))) : nil)
    }
}

/// The app icon with a progress bar on it while anything is moving. The badge
/// stays the page's own.
@MainActor
final class DockProgress {
    private let view = DockTileView(frame: NSRect(x: 0, y: 0, width: 128, height: 128))
    private var shown: Double?

    func show(_ fraction: Double?) {
        // Redraw only on a visible change: a step of 1%.
        let rounded = fraction.map { ($0 * 100).rounded() / 100 }
        guard rounded != shown else { return }
        shown = rounded
        let tile = NSApp.dockTile
        view.fraction = rounded ?? 0
        tile.contentView = rounded == nil ? nil : view
        tile.display()
    }
}

final class DockTileView: NSView {
    var fraction = 0.0

    override func draw(_ dirtyRect: NSRect) {
        NSApp.applicationIconImage?.draw(in: bounds)
        let bar = NSRect(x: bounds.width * 0.14, y: bounds.height * 0.1, width: bounds.width * 0.72, height: bounds.height * 0.11)
        NSColor.black.withAlphaComponent(0.6).setFill()
        NSBezierPath(roundedRect: bar, xRadius: bar.height / 2, yRadius: bar.height / 2).fill()
        let track = bar.insetBy(dx: 3, dy: 3)
        var fill = track
        fill.size.width = max(track.height, track.width * fraction)
        NSColor.white.setFill()
        NSBezierPath(roundedRect: fill, xRadius: fill.height / 2, yRadius: fill.height / 2).fill()
    }
}
