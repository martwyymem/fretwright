// SPDX-License-Identifier: GPL-3.0-or-later
//
// Fretwright for macOS: a native window around the web app in Contents/Resources/web.
// The page is served from a private `fretwright://app/` scheme (ES modules don't load from file://),
// downloads go through a save panel, <input type=file> through an open panel, and window.confirm
// through a sheet. Nothing is fetched from the network.

import AppKit
import UniformTypeIdentifiers
import WebKit

private let scheme = "fretwright"
private let startURL = URL(string: "\(scheme)://app/index.html")!
/// Set by FRETWRIGHT_SELFTEST: downloads go straight here instead of through a save panel.
@MainActor private var selfTestDir: URL?

// MARK: - Bundle file server

final class BundleSchemeHandler: NSObject, WKURLSchemeHandler {
  private let root: URL

  init(root: URL) {
    self.root = root.standardizedFileURL
  }

  private static let mimeTypes: [String: String] = [
    "html": "text/html; charset=utf-8",
    "js": "text/javascript; charset=utf-8",
    "mjs": "text/javascript; charset=utf-8",
    "css": "text/css; charset=utf-8",
    "json": "application/json",
    "svg": "image/svg+xml",
    "png": "image/png",
    "jpg": "image/jpeg",
    "ico": "image/x-icon",
    "woff": "font/woff",
    "woff2": "font/woff2",
    "ttf": "font/ttf",
    "wasm": "application/wasm",
    "txt": "text/plain; charset=utf-8",
  ]

  func webView(_ webView: WKWebView, start task: any WKURLSchemeTask) {
    guard let url = task.request.url else {
      task.didFailWithError(URLError(.badURL))
      return
    }
    var path = url.path
    if path.isEmpty || path == "/" { path = "/index.html" }
    let file = root.appendingPathComponent(String(path.dropFirst())).standardizedFileURL
    // Never serve anything outside the bundled web folder.
    guard file.path.hasPrefix(root.path + "/"), let data = try? Data(contentsOf: file) else {
      let notFound = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Length": "0"])!
      task.didReceive(notFound)
      task.didFinish()
      return
    }
    let ext = file.pathExtension.lowercased()
    let mime = Self.mimeTypes[ext] ?? UTType(filenameExtension: ext)?.preferredMIMEType ?? "application/octet-stream"
    let headers = ["Content-Type": mime, "Content-Length": String(data.count), "Cache-Control": "no-cache"]
    task.didReceive(HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!)
    task.didReceive(data)
    task.didFinish()
  }

  func webView(_ webView: WKWebView, stop task: any WKURLSchemeTask) {}
}

// MARK: - Window

final class MainWindowController: NSWindowController, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate, NSWindowDelegate {
  let webView: WKWebView
  private var downloadDestinations: [ObjectIdentifier: URL] = [:]
  var onFirstLoad: (() -> Void)?

  init(webRoot: URL) {
    let config = WKWebViewConfiguration()
    config.setURLSchemeHandler(BundleSchemeHandler(root: webRoot), forURLScheme: scheme)
    config.websiteDataStore = .default() // keeps the autosaved design between launches
    config.preferences.isElementFullscreenEnabled = false
    webView = WKWebView(frame: .zero, configuration: config)
    webView.allowsMagnification = true
    webView.allowsBackForwardNavigationGestures = false
    #if DEBUG
      webView.isInspectable = true
    #endif

    let window = NSWindow(
      contentRect: NSRect(x: 0, y: 0, width: 1360, height: 860),
      styleMask: [.titled, .closable, .miniaturizable, .resizable],
      backing: .buffered,
      defer: false
    )
    window.title = "Fretwright"
    window.minSize = NSSize(width: 900, height: 600)
    window.contentView = webView
    window.center()
    window.setFrameAutosaveName("FretwrightMainWindow")
    window.tabbingMode = .disallowed
    super.init(window: window)
    window.delegate = self
    webView.navigationDelegate = self
    webView.uiDelegate = self
    webView.load(URLRequest(url: startURL))
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("not used") }

  // Navigation: stay on our scheme; real links open in the default browser.
  func webView(
    _ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
    decisionHandler: @escaping @MainActor (WKNavigationActionPolicy) -> Void
  ) {
    if action.shouldPerformDownload {
      decisionHandler(.download)
      return
    }
    guard let url = action.request.url else { return decisionHandler(.cancel) }
    switch url.scheme {
    case scheme, "blob", "data", "about":
      decisionHandler(.allow)
    case "http", "https", "mailto":
      NSWorkspace.shared.open(url)
      decisionHandler(.cancel)
    default:
      decisionHandler(.cancel)
    }
  }

  func webView(
    _ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
    decisionHandler: @escaping @MainActor (WKNavigationResponsePolicy) -> Void
  ) {
    decisionHandler(response.canShowMIMEType ? .allow : .download)
  }

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    if let f = onFirstLoad {
      onFirstLoad = nil
      f()
    }
  }

  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    webView.reload()
  }

  // Downloads (SVG / PDF / DXF / project files) → save panel.
  func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
    download.delegate = self
  }

  func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
    download.delegate = self
  }

  func download(
    _ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
    completionHandler: @escaping @MainActor (URL?) -> Void
  ) {
    if let dir = selfTestDir {
      let url = dir.appendingPathComponent(suggestedFilename)
      try? FileManager.default.removeItem(at: url)
      return completionHandler(url)
    }
    let panel = NSSavePanel()
    panel.nameFieldStringValue = suggestedFilename
    panel.canCreateDirectories = true
    panel.isExtensionHidden = false
    if let ext = suggestedFilename.split(separator: ".").last.map(String.init), let type = UTType(filenameExtension: ext) {
      panel.allowedContentTypes = [type]
    }
    panel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
    let finish: (NSApplication.ModalResponse) -> Void = { [weak self] result in
      guard result == .OK, let url = panel.url else { return completionHandler(nil) }
      // The panel already asked about replacing; WKDownload refuses to overwrite by itself.
      try? FileManager.default.removeItem(at: url)
      self?.downloadDestinations[ObjectIdentifier(download)] = url
      completionHandler(url)
    }
    if let window { panel.beginSheetModal(for: window, completionHandler: finish) } else { finish(panel.runModal()) }
  }

  func downloadDidFinish(_ download: WKDownload) {
    downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
  }

  func download(_ download: WKDownload, didFailWithError error: any Error, resumeData: Data?) {
    downloadDestinations.removeValue(forKey: ObjectIdentifier(download))
    showError("The file could not be saved.", detail: error.localizedDescription)
  }

  // <input type="file"> → open panel.
  func webView(
    _ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor ([URL]?) -> Void
  ) {
    let panel = NSOpenPanel()
    panel.allowsMultipleSelection = parameters.allowsMultipleSelection
    panel.canChooseDirectories = false
    panel.canChooseFiles = true
    let finish: (NSApplication.ModalResponse) -> Void = { result in
      completionHandler(result == .OK ? panel.urls : nil)
    }
    if let window { panel.beginSheetModal(for: window, completionHandler: finish) } else { finish(panel.runModal()) }
  }

  // window.alert / window.confirm → sheets.
  func webView(
    _ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor () -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "OK")
    present(alert) { _ in completionHandler() }
  }

  func webView(
    _ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo,
    completionHandler: @escaping @MainActor (Bool) -> Void
  ) {
    let alert = NSAlert()
    alert.messageText = message
    alert.addButton(withTitle: "Continue")
    alert.addButton(withTitle: "Cancel")
    present(alert) { completionHandler($0 == .alertFirstButtonReturn) }
  }

  private func present(_ alert: NSAlert, _ done: @escaping (NSApplication.ModalResponse) -> Void) {
    if let window { alert.beginSheetModal(for: window, completionHandler: done) } else { done(alert.runModal()) }
  }

  private func showError(_ text: String, detail: String) {
    let alert = NSAlert()
    alert.alertStyle = .warning
    alert.messageText = text
    alert.informativeText = detail
    alert.addButton(withTitle: "OK")
    present(alert) { _ in }
  }

  // View menu actions.
  @objc func zoomIn(_ sender: Any?) { webView.pageZoom = min(webView.pageZoom + 0.1, 2.0) }
  @objc func zoomOut(_ sender: Any?) { webView.pageZoom = max(webView.pageZoom - 0.1, 0.6) }
  @objc func actualSize(_ sender: Any?) { webView.pageZoom = 1.0 }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
  private var controller: MainWindowController?

  func applicationDidFinishLaunching(_ notification: Notification) {
    guard let webRoot = Bundle.main.resourceURL?.appendingPathComponent("web", isDirectory: true),
      FileManager.default.fileExists(atPath: webRoot.appendingPathComponent("index.html").path)
    else {
      let alert = NSAlert()
      alert.messageText = "Fretwright is damaged"
      alert.informativeText = "The app’s web files are missing. Download or build the app again."
      alert.runModal()
      NSApp.terminate(nil)
      return
    }
    NSApp.mainMenu = buildMenu()
    let c = MainWindowController(webRoot: webRoot)
    controller = c
    if let selfTest = ProcessInfo.processInfo.environment["FRETWRIGHT_SELFTEST"] {
      c.onFirstLoad = { runSelfTest(c.webView, output: selfTest) }
    }
    c.showWindow(nil)
    NSApp.activate()
  }

  func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

  func applicationSupportsSecureRestorableState(_ app: NSApplication) -> Bool { true }

  private func buildMenu() -> NSMenu {
    let main = NSMenu()
    func submenu(_ title: String, _ items: [NSMenuItem]) {
      let holder = NSMenuItem(title: title, action: nil, keyEquivalent: "")
      let menu = NSMenu(title: title)
      items.forEach(menu.addItem)
      holder.submenu = menu
      main.addItem(holder)
    }
    func item(_ title: String, _ action: Selector?, _ key: String = "", _ mods: NSEvent.ModifierFlags = .command) -> NSMenuItem {
      let i = NSMenuItem(title: title, action: action, keyEquivalent: key)
      i.keyEquivalentModifierMask = mods
      return i
    }
    submenu("Fretwright", [
      item("About Fretwright", #selector(NSApplication.orderFrontStandardAboutPanel(_:))),
      .separator(),
      item("Hide Fretwright", #selector(NSApplication.hide(_:)), "h"),
      item("Hide Others", #selector(NSApplication.hideOtherApplications(_:)), "h", [.command, .option]),
      item("Show All", #selector(NSApplication.unhideAllApplications(_:))),
      .separator(),
      item("Quit Fretwright", #selector(NSApplication.terminate(_:)), "q"),
    ])
    submenu("File", [item("Close Window", #selector(NSWindow.performClose(_:)), "w")])
    // Undo/Redo are left to the page (it has its own design history on ⌘Z / ⇧⌘Z).
    submenu("Edit", [
      item("Cut", #selector(NSText.cut(_:)), "x"),
      item("Copy", #selector(NSText.copy(_:)), "c"),
      item("Paste", #selector(NSText.paste(_:)), "v"),
      item("Select All", #selector(NSText.selectAll(_:)), "a"),
    ])
    submenu("View", [
      item("Actual Size", #selector(MainWindowController.actualSize(_:)), "0"),
      item("Zoom In", #selector(MainWindowController.zoomIn(_:)), "+"),
      item("Zoom Out", #selector(MainWindowController.zoomOut(_:)), "-"),
      .separator(),
      item("Enter Full Screen", #selector(NSWindow.toggleFullScreen(_:)), "f", [.command, .control]),
    ])
    let windowMenu = NSMenu(title: "Window")
    windowMenu.addItem(item("Minimize", #selector(NSWindow.performMiniaturize(_:)), "m"))
    windowMenu.addItem(item("Zoom", #selector(NSWindow.performZoom(_:))))
    let windowHolder = NSMenuItem(title: "Window", action: nil, keyEquivalent: "")
    windowHolder.submenu = windowMenu
    main.addItem(windowHolder)
    NSApp.windowsMenu = windowMenu
    return main
  }
}

// MARK: - Self test (FRETWRIGHT_SELFTEST=<dir>): report page state, snapshot the window, quit.

@MainActor
private func runSelfTest(_ webView: WKWebView, output: String) {
  let dir = URL(fileURLWithPath: output, isDirectory: true)
  selfTestDir = dir
  let js = """
    (() => {
      const before = localStorage.getItem('fretwright-selftest');
      localStorage.setItem('fretwright-selftest', String(Date.now()));
      return JSON.stringify({
        title: document.title,
        svgs: document.querySelectorAll('svg').length,
        buttons: document.querySelectorAll('button').length,
        text: document.body.innerText.slice(0, 400),
        previousRun: before,
        autosaveKeys: Object.keys(localStorage),
      });
    })()
    """
  DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
    webView.evaluateJavaScript(js) { result, error in
      let report = (result as? String) ?? "error: \(String(describing: error))"
      try? report.write(to: dir.appendingPathComponent("selftest.json"), atomically: true, encoding: .utf8)
      webView.takeSnapshot(with: nil) { image, _ in
        if let image, let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff),
          let png = rep.representation(using: .png, properties: [:])
        {
          try? png.write(to: dir.appendingPathComponent("selftest.png"))
        }
        // Exercise the download path: the page's own SVG and PDF export buttons.
        let click = """
          ['SVG', 'DXF', 'PDF'].forEach((name, i) => setTimeout(() => {
            for (const b of document.querySelectorAll('button')) if (b.textContent.trim() === name) b.click();
          }, i * 1000));
          """
        webView.evaluateJavaScript(click) { _, _ in
          DispatchQueue.main.asyncAfter(deadline: .now() + 6) { NSApp.terminate(nil) }
        }
      }
    }
  }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
