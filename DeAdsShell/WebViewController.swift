import UIKit
import WebKit

/// 目标站点地址 —— 拿到描述文件后把这里换成 WebClip 里那个 URL
private let kTargetURL = URL(string: "https://y9372h05ent.3t4z2ymudt.site/?c=hgti&x=hkyoNWHktEG8B9dRVNm7i7mNt%2Fb1XLaxCutlSK7qpQ8%3D&id=1fde65665c160ef861052374818fe052&h=904cdc4ef55a0390f79ee05cddbb1285a426bab1f16de0e015f395aa852f797c&conf_version=4")!

final class WebViewController: UIViewController {

    private var webView: WKWebView!
    private let refresh = UIRefreshControl()
    private var rules: WKContentRuleList?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.preferences.javaScriptCanOpenWindowsAutomatically = true
        cfg.defaultWebpagePreferences.allowsContentJavaScript = true

        let ucc = cfg.userContentController
        if let js = Self.bundleText("inject", "js") {
            let s = WKUserScript(source: js, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            ucc.addUserScript(s)
        }
        ucc.add(MessageBridge(), name: "deadsLog")

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.allowsBackForwardNavigationGestures = true
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .black
        webView.scrollView.backgroundColor = .black
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        if let id = Bundle.main.bundleIdentifier {
            webView.configuration.applicationNameForUserAgent = id
        }

        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
        ])

        refresh.addTarget(self, action: #selector(reload), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        // 先编译拦截规则，再加载页面，保证首屏广告也拦得住
        WKContentRuleListStore.default().compileContentRuleList(
            forIdentifier: "deads-adblock",
            encodedContentRuleList: Self.bundleText("adblock", "json")
        ) { [weak self] list, error in
            guard let self else { return }
            if let list { self.rules = list; self.webView.configuration.userContentController.add(list) }
            if let error { NSLog("[deads] rule compile failed: \(error)") }
            DispatchQueue.main.async { self.load() }
        }
    }

    @objc private func reload() {
        webView.reload()
        refresh.endRefreshing()
    }

    private func load() {
        // 有些描述文件把整个首页塞成 data:text/html;base64，WKWebView 不认 URLRequest，
        // 得拆出来用 loadHTMLString 喂
        if kTargetURL.scheme == "data" {
            if let comma = kTargetURL.absoluteString.firstIndex(of: ",") {
                let body = String(kTargetURL.absoluteString[kTargetURL.absoluteString.index(after: comma)...])
                if let d = Data(base64Encoded: body),
                   let html = String(data: d, encoding: .utf8) {
                    webView.loadHTMLString(html, baseURL: nil)
                    return
                }
            }
        }
        var req = URLRequest(url: kTargetURL)
        req.setValue("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
                     forHTTPHeaderField: "User-Agent")
        webView.load(req)
    }

    private static func bundleText(_ name: String, _ ext: String) -> String? {
        guard let u = Bundle.main.url(forResource: name, withExtension: ext),
              let s = try? String(contentsOf: u, encoding: .utf8) else { return nil }
        return s
    }

    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }

    override var prefersStatusBarHidden: Bool { false }
}

final class MessageBridge: NSObject, WKScriptMessageHandler {
    func userContentController(_ ucc: WKUserContentController, didReceive message: WKScriptMessage) {
        NSLog("[deads] %@", String(describing: message.body))
    }
}

extension WebViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        refresh.endRefreshing()
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        refresh.endRefreshing()
    }
}

extension WebViewController: WKUIDelegate {
    // target=_blank 一律在本窗口打开，避免弹系统浏览器
    func webView(_ webView: WKWebView,
                 createWebViewWith configuration: WKWebViewConfiguration,
                 for navigationAction: WKNavigationAction,
                 windowFeatures: WKWindowFeatures) -> WKWebView? {
        if navigationAction.targetFrame == nil, let url = navigationAction.request.url {
            webView.load(URLRequest(url: url))
        }
        return nil
    }
}
