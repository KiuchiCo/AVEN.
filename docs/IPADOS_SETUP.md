# iPadOS setup

The same app runs on iPad (universal target). Open the project as in `IOS_SETUP.md` and pick an iPad simulator (Air 11", Pro 13").

- Wide windows show the persistent sidebar and hide the iPhone tab bar; narrow windows (Split View / Slide Over, ≤820px) fall back to the drawer and tab bar.
- External keyboard: the web app's shortcuts work; `UIApplicationSupportsIndirectInputEvents` is set.
- Share sheet anchors to a popover on iPad.
- Not yet implemented: multi-column split panels beyond the sidebar, multiple scenes/windows, Stage Manager specific behaviour, drag and drop between apps.
