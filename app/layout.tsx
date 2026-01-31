import type { Metadata, Viewport } from "next";
import "./shadcn.css";  // Tailwind base + shadcn/ui variables
import "./globals.css";
import RegisterPWA from "./RegisterPWA";

export const metadata: Metadata = {
  title: "俺の付箋",
  description: "Obsidian VaultのMarkdownを付箋UIで表示",
  manifest: "/manifest.webmanifest",
  // icons is removed to prioritize the manual link in head or default favicon.ico resolution
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


