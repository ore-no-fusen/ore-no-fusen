import type { Metadata, Viewport } from "next";
import Script from "next/script";   // ← 追加
import "./shadcn.css";
import "./globals.css";
import RegisterPWA from "./RegisterPWA";

export const metadata: Metadata = {
  title: "俺の付箋",
  description: "Obsidian VaultのMarkdownを付箋UIで表示",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#faf6ee",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body>
        <RegisterPWA />
        {children}

        {/* GA4 */}
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-MGPKF0MQH4"
          strategy="afterInteractive"
        />
        <Script id="ga4" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-MGPKF0MQH4');
          `}
        </Script>

      </body>
    </html>
  );
}
