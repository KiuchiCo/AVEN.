import UIKit
import LocalAuthentication

/// Two protections that sit on top of AVEN.'s sign-in (they never replace it):
/// 1. A privacy screen: whenever the app leaves the foreground it covers the window, so the app switcher and screenshots of it show the wordmark, not workspace content.
/// 2. An optional lock: when switched on in Settings, coming back after more than `graceSeconds` needs Face ID, Touch ID or the device passcode.
/// Nothing here holds or releases a sign-in: the web app's Clerk session is untouched, and the backend still checks every request.
final class AppLock {
    static let shared = AppLock()
    private static let enabledKey = "appLockEnabled"
    private let graceSeconds: TimeInterval = 30
    private var shield: UIView?
    private var leftAt: Date?
    private var authenticating = false
    private weak var window: UIWindow?

    var isEnabled: Bool { Keychain.get(Self.enabledKey) == "1" }
    func setEnabled(_ on: Bool) { if on { Keychain.set("1", for: Self.enabledKey) } else { Keychain.remove(Self.enabledKey) } }

    static func biometry() -> (available: Bool, type: String) {
        let context = LAContext(); var error: NSError?
        let available = context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error)
        switch context.biometryType {
        case .faceID: return (available, "faceID")
        case .touchID: return (available, "touchID")
        case .opticID: return (available, "opticID")
        default: return (available, available ? "passcode" : "none")
        }
    }

    func authenticate(reason: String, completion: @escaping (Bool) -> Void) {
        let context = LAContext()
        context.localizedFallbackTitle = "Use passcode"
        context.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in DispatchQueue.main.async { completion(ok) } }
    }

    func attach(to window: UIWindow?) { self.window = window; if isEnabled { cover(locked: true) } } // a cold start is locked too

    func willResignActive() { leftAt = leftAt ?? Date(); cover(locked: false) }

    func didBecomeActive() {
        let away = leftAt.map { Date().timeIntervalSince($0) } ?? .infinity
        leftAt = nil
        guard shield != nil else { return }
        if isEnabled && away > graceSeconds { unlock() } else { uncover() }
    }

    private func unlock() {
        guard !authenticating else { return }
        authenticating = true
        authenticate(reason: "Unlock AVEN.") { [weak self] ok in
            self?.authenticating = false
            if ok { self?.uncover() } else { self?.showUnlockButton() }
        }
    }

    private func cover(locked: Bool) {
        guard let window, shield == nil else { return }
        let view = UIView(frame: window.bounds)
        view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        view.backgroundColor = UIColor(named: "LaunchBackground") ?? UIColor(red: 0.973, green: 0.965, blue: 0.945, alpha: 1)
        let mark = UILabel(); mark.text = "AVEN."; mark.font = UIFont(name: "Georgia-Bold", size: 46) ?? .boldSystemFont(ofSize: 46)
        mark.textColor = UIColor(named: "LaunchInk") ?? UIColor(red: 0.169, green: 0.165, blue: 0.153, alpha: 1)
        mark.translatesAutoresizingMaskIntoConstraints = false; mark.accessibilityLabel = "AVEN."
        view.addSubview(mark)
        NSLayoutConstraint.activate([mark.centerXAnchor.constraint(equalTo: view.centerXAnchor), mark.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        view.accessibilityViewIsModal = true
        window.addSubview(view); shield = view
    }

    private func showUnlockButton() {
        guard let view = shield, view.viewWithTag(77) == nil else { return }
        var configuration = UIButton.Configuration.filled(); configuration.title = "Unlock"; configuration.baseBackgroundColor = UIColor(red: 0.169, green: 0.165, blue: 0.153, alpha: 1); configuration.baseForegroundColor = UIColor(red: 0.973, green: 0.965, blue: 0.945, alpha: 1); configuration.cornerStyle = .capsule
        let button = UIButton(configuration: configuration, primaryAction: UIAction { [weak self] _ in self?.unlock() })
        button.tag = 77; button.translatesAutoresizingMaskIntoConstraints = false; button.accessibilityHint = "Unlocks AVEN. with Face ID, Touch ID or your passcode"
        view.addSubview(button)
        NSLayoutConstraint.activate([button.centerXAnchor.constraint(equalTo: view.centerXAnchor), button.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: 70), button.heightAnchor.constraint(greaterThanOrEqualToConstant: 44), button.widthAnchor.constraint(greaterThanOrEqualToConstant: 140)])
    }

    private func uncover() { UIView.animate(withDuration: UIAccessibility.isReduceMotionEnabled ? 0 : 0.18, animations: { self.shield?.alpha = 0 }) { _ in self.shield?.removeFromSuperview(); self.shield = nil } }
}
