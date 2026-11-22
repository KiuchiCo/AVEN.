import UIKit
import Capacitor
import WebKit
import UserNotifications
import VisionKit

extension Notification.Name {
    static let avenPushToken = Notification.Name("avenPushToken")
    static let avenPushAction = Notification.Name("avenPushAction")
}

/// What the AVEN. web app can ask of the device. Everything here is a small, single-purpose capability: the web app (and the backend behind it) stays in charge of who the person is and what they may see.
@objc(AvenNativePlugin)
public class AvenNativePlugin: CAPPlugin, CAPBridgedPlugin, VNDocumentCameraViewControllerDelegate {
    public let identifier = "AvenNativePlugin"
    public let jsName = "AvenNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "haptic", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "share", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "biometryStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setAppLock", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scanDocument", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "registerForPush", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "consumePending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "wipeLocalData", returnType: CAPPluginReturnPromise),
    ]

    // Links and notification taps that arrive before the web app is listening are held here and handed over by consumePending().
    private static var pendingLinks: [String] = []
    private static weak var current: AvenNativePlugin?
    private static var pushToken: String?
    private var scanCall: CAPPluginCall?

    public override func load() {
        AvenNativePlugin.current = self
        NotificationCenter.default.addObserver(self, selector: #selector(onPushToken(_:)), name: .avenPushToken, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(onPushAction(_:)), name: .avenPushAction, object: nil)
    }

    /// Called by the app delegates for aven:// links, universal links and notification taps.
    static func receive(link: URL) {
        let text = link.absoluteString
        if let plugin = current, plugin.hasListeners("deepLink") { plugin.notifyListeners("deepLink", data: ["url": text]) } else { pendingLinks.append(text) }
    }

    @objc private func onPushToken(_ note: Notification) {
        guard let token = note.userInfo?["token"] as? String else { return }
        AvenNativePlugin.pushToken = token
        notifyListeners("pushToken", data: ["token": token, "environment": AvenNativePlugin.apnsEnvironment], retainUntilConsumed: true)
    }
    @objc private func onPushAction(_ note: Notification) {
        guard let path = note.userInfo?["path"] as? String else { return }
        if hasListeners("pushAction") { notifyListeners("pushAction", data: ["path": path]) } else { AvenNativePlugin.pendingLinks.append("aven://open" + (path.hasPrefix("/") ? path : "/" + path)) }
    }

    /// The Apple Push service this build talks to: sandbox for development builds, production otherwise.
    static var apnsEnvironment: String {
        #if DEBUG
        return "development"
        #else
        return "production"
        #endif
    }

    // MARK: haptics

    @objc func haptic(_ call: CAPPluginCall) {
        let style = call.getString("style") ?? "light"
        DispatchQueue.main.async {
            switch style {
            case "selection": UISelectionFeedbackGenerator().selectionChanged()
            case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            case "error": UINotificationFeedbackGenerator().notificationOccurred(.error)
            case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "heavy": UIImpactFeedbackGenerator(style: .heavy).impactOccurred()
            default: UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
            call.resolve()
        }
    }

    // MARK: share sheet

    @objc func share(_ call: CAPPluginCall) {
        var items: [Any] = []
        if let text = call.getString("text"), !text.isEmpty { items.append(text) }
        if let link = call.getString("url"), let url = URL(string: link), ["https", "http"].contains(url.scheme?.lowercased() ?? "") { items.append(url) }
        guard !items.isEmpty else { call.reject("Nothing to share."); return }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else { call.reject("Cannot show the share sheet."); return }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            if let title = call.getString("title") { sheet.setValue(title, forKey: "subject") }
            // On iPad the sheet is a popover and needs somewhere to point.
            sheet.popoverPresentationController?.sourceView = controller.view
            sheet.popoverPresentationController?.sourceRect = CGRect(x: controller.view.bounds.midX, y: controller.view.bounds.midY, width: 0, height: 0)
            sheet.popoverPresentationController?.permittedArrowDirections = []
            sheet.completionWithItemsHandler = { _, completed, _, _ in call.resolve(["completed": completed]) }
            controller.present(sheet, animated: true)
        }
    }

    // MARK: Face ID / Touch ID app lock (an extra local protection, not a sign-in)

    @objc func biometryStatus(_ call: CAPPluginCall) {
        let status = AppLock.biometry()
        call.resolve(["available": status.available, "type": status.type, "lockEnabled": AppLock.shared.isEnabled])
    }

    @objc func setAppLock(_ call: CAPPluginCall) {
        let enable = call.getBool("enabled") ?? false
        guard enable else { AppLock.shared.setEnabled(false); call.resolve(["lockEnabled": false]); return }
        guard AppLock.biometry().available else { call.reject("This device has no passcode or biometrics set up, so the lock cannot be turned on."); return }
        // Turning it on needs a successful unlock, so it cannot be switched on by mistake or by someone else holding an unlocked phone for a moment.
        DispatchQueue.main.async {
            AppLock.shared.authenticate(reason: "Turn on the AVEN. lock") { ok in
                if ok { AppLock.shared.setEnabled(true) }
                call.resolve(["lockEnabled": ok && AppLock.shared.isEnabled])
            }
        }
    }

    // MARK: document scanning

    @objc func scanDocument(_ call: CAPPluginCall) {
        guard VNDocumentCameraViewController.isSupported else { call.reject("Scanning is not available on this device."); return }
        DispatchQueue.main.async {
            guard let controller = self.bridge?.viewController else { call.reject("Cannot open the scanner."); return }
            self.scanCall = call
            let scanner = VNDocumentCameraViewController(); scanner.delegate = self
            controller.present(scanner, animated: true)
        }
    }

    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFinishWith scan: VNDocumentCameraScan) {
        let pages = (0..<min(scan.pageCount, 20)).compactMap { scan.imageOfPage(at: $0).jpegData(compressionQuality: 0.8)?.base64EncodedString() }
        controller.dismiss(animated: true) { self.scanCall?.resolve(["pages": pages, "mimeType": "image/jpeg"]); self.scanCall = nil }
    }
    public func documentCameraViewControllerDidCancel(_ controller: VNDocumentCameraViewController) {
        controller.dismiss(animated: true) { self.scanCall?.resolve(["pages": [String](), "mimeType": "image/jpeg"]); self.scanCall = nil }
    }
    public func documentCameraViewController(_ controller: VNDocumentCameraViewController, didFailWithError error: Error) {
        controller.dismiss(animated: true) { self.scanCall?.reject("The scan could not be completed."); self.scanCall = nil }
    }

    // MARK: push notifications

    @objc func registerForPush(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { granted, _ in
            DispatchQueue.main.async { if granted { UIApplication.shared.registerForRemoteNotifications() } }
            call.resolve(["granted": granted])
        }
    }

    @objc func pushStatus(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            let state: String
            switch settings.authorizationStatus { case .authorized, .provisional, .ephemeral: state = "granted"; case .denied: state = "denied"; default: state = "prompt" }
            call.resolve(["permission": state, "token": AvenNativePlugin.pushToken as Any, "environment": AvenNativePlugin.apnsEnvironment])
        }
    }

    // MARK: links held until the web app is ready

    @objc func consumePending(_ call: CAPPluginCall) {
        let links = AvenNativePlugin.pendingLinks; AvenNativePlugin.pendingLinks = []
        call.resolve(["links": links])
    }

    // MARK: sign-out

    /// Removes everything this device holds for the signed-in person: Keychain items, cached pages, local storage (including unsent drafts) and cookies of the web view.
    @objc func wipeLocalData(_ call: CAPPluginCall) {
        let keepLock = AppLock.shared.isEnabled // the lock is a preference of this device, not of the account
        Keychain.removeAll(); if keepLock { AppLock.shared.setEnabled(true) }
        DispatchQueue.main.async {
            WKWebsiteDataStore.default().removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: Date(timeIntervalSince1970: 0)) { call.resolve() }
        }
    }
}
