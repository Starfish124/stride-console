// The Stride Console iPhone app: a native shell around the console the Mac
// mini serves over Tailscale. Reviewing and approving happens in here; the
// heavy lifting stays on the Mac.

import SwiftUI

@main
struct StrideConsoleApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
