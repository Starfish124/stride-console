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
import { RailOffset, SideNav } from "@/components/SideNav";
import { listClients } from "@/lib/store";
import { Toaster } from "sonner";

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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F6F7FA" },
    { media: "(prefers-color-scheme: dark)", color: "#0A0C14" },
  ],
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
          {/* Wide screens get the persistent rail; the sheet stays for ⌘K.
              The rail also carries one door per live client, read here on the
              server so the client list never ships to the login page. */}
          <SideNav
            clients={listClients()
              .filter((c) => c.stage !== "past")
              .slice(0, 8)
              .map((c) => ({ id: c.id, label: c.company || c.name }))}
          />
          <RailOffset>{children}</RailOffset>
          {/* Transient confirmations only. Anything that failed says so
              inline where it failed; a toast is for "that worked" moments
              that need no reply. */}
          <Toaster
            position="top-center"
            toastOptions={{
              style: {
                background: "#ffffff",
                color: "#0a0c14",
                border: "1px solid #e5e8f0",
                borderRadius: "12px",
                fontSize: "13px",
                fontWeight: 600,
              },
            }}
          />
          <TabBar />
        </AppMenu>
      </body>
    </html>
  );
}
