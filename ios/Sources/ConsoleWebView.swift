import SwiftUI
import WebKit
import UIKit

/// Owns the WKWebView so SwiftUI state and the navigation delegate share it.
final class WebViewModel: NSObject, ObservableObject {
    @Published var failed = false

    let webView: WKWebView

    override init() {
        let config = WKWebViewConfiguration()
        // Persistent store: the 30-day login cookie survives relaunches.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.refreshControl = UIRefreshControl()
        webView.scrollView.refreshControl?.addTarget(
            self, action: #selector(pullToRefresh), for: .valueChanged)
        load()
    }

    func load() {
        failed = false
        webView.load(URLRequest(url: consoleURL))
    }

    func retry() { load() }

    @objc private func pullToRefresh() {
        webView.reload()
    }

    /// Anything that is not the console opens outside: LinkedIn belongs in
    /// its own app, and posting stays a founder action out there.
    private func isConsole(_ url: URL) -> Bool {
        url.host == consoleURL.host
    }

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url)
    }

    private func presentShareSheet(for fileURL: URL) {
        guard
            let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
            let root = scene.keyWindow?.rootViewController
        else { return }
        let sheet = UIActivityViewController(activityItems: [fileURL], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = root.view
        root.present(sheet, animated: true)
    }

    fileprivate var downloadDestination: URL?
}

extension WebViewModel: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }
        if !isConsole(url), ["http", "https"].contains(url.scheme ?? "") {
            openExternally(url)
            decisionHandler(.cancel)
            return
        }
        if navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        // Renders and carousel PDFs come down as attachments: hand them to
        // the share sheet so they can land in Photos or Files.
        if !navigationResponse.canShowMIMEType {
            decisionHandler(.download)
            return
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        failed = false
    }

    func webView(
        _ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
        failed = true
    }

    func webView(
        _ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error
    ) {
        webView.scrollView.refreshControl?.endRefreshing()
    }

    func webView(
        _ webView: WKWebView, navigationAction: WKNavigationAction,
        didBecome download: WKDownload
    ) {
        download.delegate = self
    }

    func webView(
        _ webView: WKWebView, navigationResponse: WKNavigationResponse,
        didBecome download: WKDownload
    ) {
        download.delegate = self
    }
}

extension WebViewModel: WKDownloadDelegate {
    func download(
        _ download: WKDownload, decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let destination = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        let file = destination.appendingPathComponent(suggestedFilename)
        downloadDestination = file
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let file = downloadDestination {
            presentShareSheet(for: file)
        }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloadDestination = nil
    }
}

extension WebViewModel: WKUIDelegate {
    /// target=_blank links ("Open LinkedIn.") have no window here; route them
    /// to the system so the LinkedIn app picks them up.
    func webView(
        _ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            openExternally(url)
        }
        return nil
    }
}

/// SwiftUI wrapper. The model owns the view; this just mounts it.
struct ConsoleWebView: UIViewRepresentable {
    @ObservedObject var model: WebViewModel

    func makeUIView(context: Context) -> WKWebView {
        model.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
