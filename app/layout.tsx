import type { Metadata, Viewport } from "next";
import "./globals.css";
import RegisterPWA from "./RegisterPWA";

export const metadata: Metadata = {
  title: "俺の付箋",
  description: "Obsidian VaultのMarkdownを付箋UIで表示",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#faf6ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <RegisterPWA />
        {children}
      </body>
    </html>
  );
}


