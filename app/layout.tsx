import type { Metadata, Viewport } from "next";
// Self-hosted, deliberately: the console is installed to a home screen and
// must render the same with no network, which rules out Google-hosted fonts.
// Plus Jakarta Sans and JetBrains Mono come from the icon library; Playfair
// stays on display type, as the deck sets it.
import "@fontsource/plus-jakarta-sans/400.css";
import "@fontsource/plus-jakarta-sans/500.css";
import "@fontsource/plus-jakarta-sans/600.css";
import "@fontsource/plus-jakarta-sans/700.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/500-italic.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { SWRegister } from "@/components/SWRegister";
import { TabBar } from "@/components/TabBar";
import { AppMenu } from "@/components/AppMenu";

export const metadata: Metadata = {
  title: "Stride Console",
  description: "The Stride AI marketing machine.",
  appleWebApp: {
    capable: true,
    title: "Stride",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#F6F7FA",
  // The chrome is translucent and content scrolls under it, so the page has
  // to own the safe areas rather than let iOS letterbox them.
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full bg-paper text-ink">
        <SWRegister />
        {/* AppMenu owns the sheet and shares its open state down the tree, so
            the header pill and the tab bar's last slot drive the same one. */}
        <AppMenu>
          {children}
          <TabBar />
        </AppMenu>
      </body>
    </html>
  );
}
