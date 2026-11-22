import UIKit
import Capacitor
import WebKit

/// The Capacitor view controller with AVEN.'s own native plugin added.
class AvenBridgeViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(AvenNativePlugin())
        webView?.allowsBackForwardNavigationGestures = true
        #if DEBUG
        if #available(iOS 16.4, *) { webView?.isInspectable = true }
        #endif
    }
}
