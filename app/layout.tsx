/**
 * Root Layout
 *
 * 責務:
 * - アプリケーション全体のHTML構造定義
 * - グローバルCSS、フォント、メタデータの適用
 * - GA4スクリプトのロード
 * - PWA登録コンポーネントの配置
 */

import type { Metadata, Viewport } from "next";
import Script from "next/script";   // ← 追加
import "./shadcn.css";
import "./globals.css";
import RegisterPWA from "./RegisterPWA";
import { Analytics } from "@vercel/analytics/next";

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
        {/* 付箋ウィンドウ（?path=）はglobals.cssの#111827より先に黄色を設定 */}
        <script dangerouslySetInnerHTML={{
          __html: `
          if (new URLSearchParams(location.search).has('path')) {
            var s = document.createElement('style');
            s.textContent = 'html,body{background:#f7e9b0!important}';
            document.head.appendChild(s);
          }
          (function() {
            function forceRepaint() {
              var el = document.documentElement;
              el.style.transform = 'translateZ(0)';
              requestAnimationFrame(function() { el.style.transform = ''; });
            }
            window.addEventListener('focus', forceRepaint);
            document.addEventListener('visibilitychange', function() {
              if (document.visibilityState === 'visible') forceRepaint();
            });
          })();
        `}} />
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
            gtag('config', 'G-MGPKF0MQH4', {
              send_page_view: !new URLSearchParams(location.search).has('path')
            });
          `}
        </Script>
        <Analytics /> 
      </body>
    </html>
  );
}
