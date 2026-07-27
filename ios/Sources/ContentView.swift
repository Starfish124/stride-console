import SwiftUI

/// The console's address on the tailnet. If the Mac's name ever changes,
/// this is the one line to update.
let consoleURL = URL(string: "https://mac-mini.tailc91701.ts.net")!

/// Brand tokens, mirrored from lib/brand.ts, which mirrors the icon library.
/// Only the unreachable screen uses them — everything else is the web view —
/// so they exist to keep that one screen from looking like a different app.
enum Brand {
    static let indigo = Color(red: 0x2E / 255, green: 0x30 / 255, blue: 0xF8 / 255)
    static let paper = Color(red: 0xF6 / 255, green: 0xF7 / 255, blue: 0xFA / 255)
    static let ink = Color(red: 0x0A / 255, green: 0x0C / 255, blue: 0x14 / 255)
    static let slate = Color(red: 0x5A / 255, green: 0x61 / 255, blue: 0x72 / 255)
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
            StrideMark()
                .fill(Brand.indigo)
                .frame(width: 40, height: 40)
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

/// The mark: two bars sheared along the library's own 12:24 diagonal. The
/// coordinates are the library's, on its 24-unit grid, scaled to whatever
/// frame this is given. The unreachable screen used to show a plain triangle,
/// which is not the logo of anything.
struct StrideMark: Shape {
    private static let bars: [[CGPoint]] = [
        [CGPoint(x: 19.43, y: 1), CGPoint(x: 9.75, y: 1),
         CGPoint(x: 1.37, y: 12.19), CGPoint(x: 10.99, y: 12.19)],
        [CGPoint(x: 22.63, y: 11.41), CGPoint(x: 14.03, y: 11.41),
         CGPoint(x: 5.33, y: 23), CGPoint(x: 13.97, y: 23)],
    ]

    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 24
        var path = Path()
        for bar in Self.bars {
            path.move(to: CGPoint(x: bar[0].x * s, y: bar[0].y * s))
            for point in bar.dropFirst() {
                path.addLine(to: CGPoint(x: point.x * s, y: point.y * s))
            }
            path.closeSubpath()
        }
        return path
    }
}
