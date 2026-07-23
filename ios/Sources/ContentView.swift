import SwiftUI

/// The console's address on the tailnet. If the Mac's name ever changes,
/// this is the one line to update.
let consoleURL = URL(string: "https://mac-mini.tailc91701.ts.net")!

/// Brand tokens, mirrored from the console's design system.
enum Brand {
    static let indigo = Color(red: 0x3D / 255, green: 0x44 / 255, blue: 0xD9 / 255)
    static let paper = Color(red: 0xF4 / 255, green: 0xF4 / 255, blue: 0xF8 / 255)
    static let ink = Color(red: 0x10 / 255, green: 0x11 / 255, blue: 0x16 / 255)
    static let slate = Color(red: 0x5E / 255, green: 0x64 / 255, blue: 0x7B / 255)
}

struct ContentView: View {
    @StateObject private var model = WebViewModel()

    var body: some View {
        ZStack {
            Brand.paper.ignoresSafeArea()
            ConsoleWebView(model: model)
                .opacity(model.failed ? 0 : 1)
            if model.failed {
                UnreachableView { model.retry() }
            }
        }
    }
}

/// Shown when the Mac (or Tailscale) is not reachable. Stride voice, no panic.
struct UnreachableView: View {
    let retry: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Triangle()
                .fill(Brand.indigo)
                .frame(width: 40, height: 36)
            Text("The console is unreachable.")
                .font(.system(size: 24, weight: .heavy))
                .foregroundColor(Brand.ink)
            Text("The console lives on the Mac mini. Check that Tailscale is connected on this phone and the Mac is awake, then try again. Your drafts are safe where you left them.")
                .font(.system(size: 15))
                .foregroundColor(Brand.slate)
                .lineSpacing(3)
            Button(action: retry) {
                Text("Try again.")
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
                    .background(Brand.indigo)
                    .cornerRadius(8)
            }
            .padding(.top, 4)
        }
        .padding(28)
        .frame(maxWidth: 420, alignment: .leading)
    }
}

struct Triangle: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.midX, y: rect.minY))
        path.addLine(to: CGPoint(x: rect.minX, y: rect.maxY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.maxY))
        path.closeSubpath()
        return path
    }
}
