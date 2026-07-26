import type { Metadata, Viewport } from "next";
// Self-hosted, deliberately: the console is installed to a home screen and
// must render the same with no network, which rules out Google-hosted fonts.
// Playfair carries display type, Archivo the body, Plex Mono every label —
// the same three roles the pitch deck uses.
import "@fontsource/archivo/400.css";
import "@fontsource/archivo/600.css";
import "@fontsource/archivo/700.css";
import "@fontsource/playfair-display/500.css";
import "@fontsource/playfair-display/500-italic.css";
import "@fontsource/playfair-display/600.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./globals.css";
import { SWRegister } from "@/components/SWRegister";
import { TabBar } from "@/components/TabBar";

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
  themeColor: "#F4F4F8",
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
        {children}
        <TabBar />
      </body>
    </html>
  );
}
