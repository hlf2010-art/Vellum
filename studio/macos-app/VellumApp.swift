import Cocoa
import WebKit
import QuartzCore
import Darwin

final class SplashView: NSView {
    private let glowLayer = CAGradientLayer()
    private let beamLayer = CAGradientLayer()
    private let statusLabel = NSTextField(labelWithString: "Starting local workspace…")

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        setupLayers()
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    private func setupLayers() {
        guard let root = layer else { return }
        root.backgroundColor = NSColor(srgbRed: 0.043, green: 0.047, blue: 0.062, alpha: 1.0).cgColor

        glowLayer.type = .radial
        glowLayer.colors = [
            NSColor(srgbRed: 1.0, green: 0.86, blue: 0.60, alpha: 0.16).cgColor,
            NSColor(srgbRed: 0.28, green: 0.52, blue: 0.98, alpha: 0.08).cgColor,
            NSColor.clear.cgColor,
        ]
        glowLayer.locations = [0.0, 0.45, 1.0]
        glowLayer.startPoint = CGPoint(x: 0.5, y: 0.5)
        glowLayer.endPoint = CGPoint(x: 1.0, y: 1.0)
        root.addSublayer(glowLayer)

        let pulse = CABasicAnimation(keyPath: "opacity")
        pulse.fromValue = 0.65
        pulse.toValue = 1.0
        pulse.duration = 2.0
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        glowLayer.add(pulse, forKey: "glowPulse")

        let card = NSView()
        card.translatesAutoresizingMaskIntoConstraints = false
        addSubview(card)

        let mark = PrismMarkView()
        mark.translatesAutoresizingMaskIntoConstraints = false

        let title = NSTextField(labelWithString: "Vellum")
        title.font = NSFont.systemFont(ofSize: 26, weight: .semibold)
        title.textColor = NSColor(srgbRed: 0.96, green: 0.97, blue: 0.99, alpha: 1.0)
        title.alignment = .center
        title.translatesAutoresizingMaskIntoConstraints = false

        let sub = NSTextField(labelWithString: "Lumen Creative Workspace")
        sub.font = NSFont.systemFont(ofSize: 12.5, weight: .regular)
        sub.textColor = NSColor(srgbRed: 0.68, green: 0.72, blue: 0.80, alpha: 0.72)
        sub.alignment = .center
        sub.translatesAutoresizingMaskIntoConstraints = false

        let track = NSView()
        track.wantsLayer = true
        track.translatesAutoresizingMaskIntoConstraints = false
        track.layer?.backgroundColor = NSColor(white: 1.0, alpha: 0.09).cgColor
        track.layer?.cornerRadius = 1.25
        track.layer?.masksToBounds = true

        beamLayer.colors = [
            NSColor.clear.cgColor,
            NSColor(srgbRed: 1.0, green: 0.88, blue: 0.66, alpha: 0.92).cgColor,
            NSColor.clear.cgColor,
        ]
        beamLayer.startPoint = CGPoint(x: 0, y: 0.5)
        beamLayer.endPoint = CGPoint(x: 1, y: 0.5)
        beamLayer.frame = CGRect(x: -72, y: 0, width: 72, height: 2.5)
        track.layer?.addSublayer(beamLayer)

        let slide = CABasicAnimation(keyPath: "position.x")
        slide.fromValue = -36
        slide.toValue = 200
        slide.duration = 1.25
        slide.repeatCount = .infinity
        slide.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        beamLayer.add(slide, forKey: "beamSlide")

        statusLabel.font = NSFont.monospacedDigitSystemFont(ofSize: 11.5, weight: .medium)
        statusLabel.textColor = NSColor(srgbRed: 0.72, green: 0.76, blue: 0.84, alpha: 0.62)
        statusLabel.alignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false

        card.addSubview(mark)
        card.addSubview(title)
        card.addSubview(sub)
        card.addSubview(track)
        card.addSubview(statusLabel)

        NSLayoutConstraint.activate([
            card.centerXAnchor.constraint(equalTo: centerXAnchor),
            card.centerYAnchor.constraint(equalTo: centerYAnchor, constant: -10),
            card.widthAnchor.constraint(equalToConstant: 280),

            mark.topAnchor.constraint(equalTo: card.topAnchor),
            mark.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            mark.widthAnchor.constraint(equalToConstant: 60),
            mark.heightAnchor.constraint(equalToConstant: 60),

            title.topAnchor.constraint(equalTo: mark.bottomAnchor, constant: 14),
            title.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            sub.topAnchor.constraint(equalTo: title.bottomAnchor, constant: 4),
            sub.centerXAnchor.constraint(equalTo: card.centerXAnchor),

            track.topAnchor.constraint(equalTo: sub.bottomAnchor, constant: 22),
            track.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            track.widthAnchor.constraint(equalToConstant: 164),
            track.heightAnchor.constraint(equalToConstant: 2.5),

            statusLabel.topAnchor.constraint(equalTo: track.bottomAnchor, constant: 10),
            statusLabel.centerXAnchor.constraint(equalTo: card.centerXAnchor),
            statusLabel.bottomAnchor.constraint(equalTo: card.bottomAnchor),
        ])
    }

    override func layout() {
        super.layout()
        let size = max(bounds.width, bounds.height) * 0.75
        glowLayer.frame = CGRect(
            x: (bounds.width - size) * 0.5,
            y: (bounds.height - size) * 0.5 + 24,
            width: size,
            height: size
        )
    }

    func setStatus(_ text: String) {
        statusLabel.stringValue = text
    }
}

final class PrismMarkView: NSView {
    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func draw(_ dirtyRect: NSRect) {
        super.draw(dirtyRect)
        guard let ctx = NSGraphicsContext.current?.cgContext else { return }
        let s = min(bounds.width, bounds.height)
        let box = CGRect(x: 1, y: 1, width: s - 2, height: s - 2)
        let bgPath = CGPath(roundedRect: box, cornerWidth: 15, cornerHeight: 15, transform: nil)
        ctx.saveGState()
        ctx.addPath(bgPath)
        ctx.setFillColor(NSColor(white: 1.0, alpha: 0.045).cgColor)
        ctx.fillPath()
        ctx.addPath(bgPath)
        ctx.setStrokeColor(NSColor(white: 1.0, alpha: 0.14).cgColor)
        ctx.setLineWidth(1.0)
        ctx.strokePath()

        let top = CGPoint(x: s * 0.50, y: s * 0.74)
        let left = CGPoint(x: s * 0.25, y: s * 0.28)
        let right = CGPoint(x: s * 0.75, y: s * 0.28)
        let tri = CGMutablePath()
        tri.move(to: top)
        tri.addLine(to: right)
        tri.addLine(to: left)
        tri.closeSubpath()

        ctx.addPath(tri)
        ctx.setLineJoin(.round)
        ctx.setStrokeColor(NSColor(srgbRed: 0.96, green: 0.97, blue: 1.0, alpha: 0.92).cgColor)
        ctx.setLineWidth(2.4)
        ctx.strokePath()

        ctx.move(to: top)
        ctx.addLine(to: CGPoint(x: s * 0.50, y: s * 0.28))
        ctx.setStrokeColor(NSColor(srgbRed: 1.0, green: 0.87, blue: 0.62, alpha: 0.85).cgColor)
        ctx.setLineWidth(1.6)
        ctx.strokePath()
        ctx.restoreGState()
    }
}

final class ServiceManager {
    private var ownedProcesses: [Process] = []
    private let lock = NSLock()

    static func portInUse(_ port: UInt16) -> Bool {
        let fd = socket(AF_INET, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }

        var addr = sockaddr_in()
        addr.sin_len = UInt8(MemoryLayout<sockaddr_in>.size)
        addr.sin_family = sa_family_t(AF_INET)
        addr.sin_port = port.bigEndian
        inet_pton(AF_INET, "127.0.0.1", &addr.sin_addr)

        let res = withUnsafePointer(to: &addr) {
            $0.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                Darwin.connect(fd, $0, socklen_t(MemoryLayout<sockaddr_in>.size))
            }
        }
        return res == 0
    }

    static func pythonExecutable() -> String {
        let candidates = [
            "/usr/bin/python3",
            "/opt/homebrew/bin/python3",
            "/usr/local/bin/python3",
        ]
        for path in candidates where FileManager.default.isExecutableFile(atPath: path) {
            return path
        }
        return "/usr/bin/python3"
    }

    func startIfNeeded(scriptPath: String, arguments: [String], port: UInt16, workingDirectory: String) {
        guard FileManager.default.fileExists(atPath: scriptPath) else { return }
        if Self.portInUse(port) {
            return
        }
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: Self.pythonExecutable())
        proc.arguments = [scriptPath] + arguments
        proc.currentDirectoryURL = URL(fileURLWithPath: workingDirectory)

        var env = ProcessInfo.processInfo.environment
        let basePath = env["PATH"] ?? "/usr/bin:/bin:/usr/sbin:/sbin"
        env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:" + basePath
        env["PYTHONUNBUFFERED"] = "1"
        proc.environment = env

        let devNull = FileHandle.nullDevice
        proc.standardInput = devNull
        proc.standardOutput = devNull
        proc.standardError = devNull

        do {
            try proc.run()
            lock.lock()
            ownedProcesses.append(proc)
            lock.unlock()
        } catch {
            NSLog("Vellum failed to launch \(scriptPath): \(error)")
        }
    }

    func stopAll() {
        lock.lock()
        let procs = ownedProcesses
        ownedProcesses.removeAll()
        lock.unlock()

        for proc in procs where proc.isRunning {
            proc.terminate()
        }
        let deadline = Date().addingTimeInterval(1.5)
        for proc in procs where proc.isRunning {
            while proc.isRunning && Date() < deadline {
                usleep(40_000)
            }
            if proc.isRunning {
                kill(proc.processIdentifier, SIGKILL)
            }
        }
    }
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    private var window: NSWindow!
    private var webView: WKWebView!
    private var splashView: SplashView?
    private var launchAt = Date()
    private let services = ServiceManager()
    private let uiPort: UInt16 = 8791

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.appearance = NSAppearance(named: .darkAqua)
        setupMainMenu()
        setupWindowAndWebView()
        bootServicesAndLoad()
    }

    func applicationWillTerminate(_ notification: Notification) {
        services.stopAll()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func setupMainMenu() {
        let mainMenu = NSMenu()

        // App Menu
        let appItem = NSMenuItem()
        mainMenu.addItem(appItem)
        let appMenu = NSMenu(title: "Vellum")
        appMenu.addItem(withTitle: "About Vellum", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Hide Vellum", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthers = NSMenuItem(title: "Hide Others", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(hideOthers)
        appMenu.addItem(withTitle: "Show All", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "Quit Vellum", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appItem.submenu = appMenu

        // Edit Menu
        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editItem.submenu = editMenu

        // View Menu
        let viewItem = NSMenuItem()
        mainMenu.addItem(viewItem)
        let viewMenu = NSMenu(title: "View")
        viewMenu.addItem(withTitle: "Reload", action: #selector(reloadPage), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "Toggle Full Screen", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewMenu.items.last?.keyEquivalentModifierMask = [.command, .control]
        viewItem.submenu = viewMenu

        // Window Menu
        let winItem = NSMenuItem()
        mainMenu.addItem(winItem)
        let winMenu = NSMenu(title: "Window")
        winMenu.addItem(withTitle: "Minimize", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        winMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        winItem.submenu = winMenu
        NSApp.windowsMenu = winMenu

        NSApp.mainMenu = mainMenu
    }

    private func setupWindowAndWebView() {
        let cfg = WKWebViewConfiguration()
        cfg.preferences.setValue(true, forKey: "developerExtrasEnabled")
        cfg.mediaTypesRequiringUserActionForPlayback = []

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.uiDelegate = self
        webView.navigationDelegate = self
        if #available(macOS 13.3, *) {
            webView.isInspectable = true
        }
        webView.setValue(false, forKey: "drawsBackground")

        let container = NSView()
        container.wantsLayer = true

        webView.translatesAutoresizingMaskIntoConstraints = false
        webView.alphaValue = 0.0

        let splash = SplashView()
        splash.translatesAutoresizingMaskIntoConstraints = false
        splashView = splash

        container.addSubview(webView)
        container.addSubview(splash)
        NSLayoutConstraint.activate([
            webView.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            webView.topAnchor.constraint(equalTo: container.topAnchor),
            webView.bottomAnchor.constraint(equalTo: container.bottomAnchor),
            splash.leadingAnchor.constraint(equalTo: container.leadingAnchor),
            splash.trailingAnchor.constraint(equalTo: container.trailingAnchor),
            splash.topAnchor.constraint(equalTo: container.topAnchor),
            splash.bottomAnchor.constraint(equalTo: container.bottomAnchor),
        ])

        let bg = NSColor(srgbRed: 0.043, green: 0.047, blue: 0.062, alpha: 1.0)
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 1440, height: 900),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Vellum"
        window.titleVisibility = .visible
        window.titlebarAppearsTransparent = true
        window.backgroundColor = bg
        window.minSize = NSSize(width: 960, height: 640)
        window.center()
        window.setFrameAutosaveName("VellumMainWindow")
        window.contentView = container
        window.delegate = self
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    private func appBundleRoot() -> String {
        if let res = Bundle.main.resourcePath {
            let candidate = (res as NSString).appendingPathComponent("app")
            if FileManager.default.fileExists(atPath: candidate) {
                return candidate
            }
        }
        return FileManager.default.currentDirectoryPath
    }

    private func bootServicesAndLoad() {
        launchAt = Date()
        splashView?.setStatus("Starting local services…")
        let root = appBundleRoot()
        let serveScript = (root as NSString).appendingPathComponent("studio/macos-app/serve_vellum.py")
        let studioScript = (root as NSString).appendingPathComponent("Start Studio AI.command")
        let imageScript = (root as NSString).appendingPathComponent("Start MOD WORK Image Service.command")

        services.startIfNeeded(scriptPath: serveScript, arguments: ["--port", String(uiPort)], port: uiPort, workingDirectory: root)
        services.startIfNeeded(scriptPath: studioScript, arguments: ["--serve"], port: 59631, workingDirectory: root)
        services.startIfNeeded(scriptPath: imageScript, arguments: [], port: 59639, workingDirectory: root)

        waitForUIAndLoad(attemptsRemaining: 50)
    }

    private func waitForUIAndLoad(attemptsRemaining: Int) {
        if ServiceManager.portInUse(uiPort) {
            splashView?.setStatus("Loading canvas…")
            let url = URL(string: "http://127.0.0.1:\(uiPort)/Vellum-Lumen.html")!
            webView.load(URLRequest(url: url))
            return
        }
        if attemptsRemaining <= 0 {
            splashView?.setStatus("Local server did not start — retrying…")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
                guard let self else { return }
                let url = URL(string: "http://127.0.0.1:\(self.uiPort)/Vellum-Lumen.html")!
                self.webView.load(URLRequest(url: url))
            }
            return
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.08) { [weak self] in
            self?.waitForUIAndLoad(attemptsRemaining: attemptsRemaining - 1)
        }
    }

    private func revealWorkspace() {
        guard let splash = splashView else {
            webView.alphaValue = 1.0
            return
        }
        splash.setStatus("Workspace ready")
        let elapsed = Date().timeIntervalSince(launchAt)
        let delay = max(0.0, 2.0 - elapsed)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self else { return }
            self.splashView = nil
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.42
                ctx.timingFunction = CAMediaTimingFunction(name: .easeOut)
                self.webView.animator().alphaValue = 1.0
                splash.animator().alphaValue = 0.0
            }, completionHandler: {
                splash.removeFromSuperview()
            })
        }
    }

    @objc private func reloadPage() {
        webView.reload()
    }

    // MARK: - WKUIDelegate

    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = false
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.beginSheetModal(for: window) { response in
            completionHandler(response == .OK ? panel.urls : nil)
        }
    }

    func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    @available(macOS 12.0, *)
    func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        if origin.host == "127.0.0.1" || origin.host == "localhost" {
            decisionHandler(.grant)
        } else {
            decisionHandler(.prompt)
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.beginSheetModal(for: window) { _ in completionHandler() }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = message
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Cancel")
        alert.beginSheetModal(for: window) { resp in
            completionHandler(resp == .alertFirstButtonReturn)
        }
    }

    // MARK: - WKNavigationDelegate & Downloads

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if #available(macOS 11.3, *), navigationAction.shouldPerformDownload {
            decisionHandler(.download)
            return
        }
        if let url = navigationAction.request.url {
            let scheme = (url.scheme ?? "").lowercased()
            let host = (url.host ?? "").lowercased()
            if (scheme == "http" || scheme == "https"), host != "127.0.0.1", host != "localhost", navigationAction.navigationType == .linkActivated {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        revealWorkspace()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        splashView?.setStatus("Startup delayed (\(error.localizedDescription))")
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        splashView?.setStatus("Retrying local connection…")
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self else { return }
            let url = URL(string: "http://127.0.0.1:\(self.uiPort)/Vellum-Lumen.html")!
            self.webView.load(URLRequest(url: url))
        }
    }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    @available(macOS 11.3, *)
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let panel = NSSavePanel()
        panel.nameFieldStringValue = suggestedFilename.isEmpty ? "vellum-export" : suggestedFilename
        panel.canCreateDirectories = true
        panel.beginSheetModal(for: window) { resp in
            completionHandler(resp == .OK ? panel.url : nil)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
