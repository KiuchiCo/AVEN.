import UIKit
import UserNotifications

/// Shows notifications while the app is open, and turns a tap on one into a link for the web app. A notification may carry a `path` (such as /workspace/tasks/<id>); the web app checks it again before opening anything.
final class AvenNotificationCenter: NSObject, UNUserNotificationCenterDelegate {
    static let shared = AvenNotificationCenter()

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .sound, .badge])
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
        if let path = response.notification.request.content.userInfo["path"] as? String { NotificationCenter.default.post(name: .avenPushAction, object: nil, userInfo: ["path": path]) }
        completionHandler()
    }
}
