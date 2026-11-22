import UIKit
import Capacitor

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = AvenBridgeViewController()
        window?.makeKeyAndVisible()
        AppLock.shared.attach(to: window)

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
        for context in connectionOptions.urlContexts { AvenNativePlugin.receive(link: context.url) }
        if let activity = connectionOptions.userActivities.first(where: { $0.activityType == NSUserActivityTypeBrowsingWeb }), let url = activity.webpageURL { AvenNativePlugin.receive(link: url) }
    }

    func sceneWillResignActive(_ scene: UIScene) { AppLock.shared.willResignActive() }
    func sceneDidBecomeActive(_ scene: UIScene) { AppLock.shared.didBecomeActive() }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        for context in URLContexts { AvenNativePlugin.receive(link: context.url) }
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
        if userActivity.activityType == NSUserActivityTypeBrowsingWeb, let url = userActivity.webpageURL { AvenNativePlugin.receive(link: url) }
    }
}
