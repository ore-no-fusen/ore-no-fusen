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

const SITE_URL = "https://ore-no-fusen.vercel.app";
const OG_IMAGE = `${SITE_URL}/screenshots/ScreenShot_OreNoFusen.png`;
const SITE_DESCRIPTION =
  "PCで書いて、iPhoneへ届く。iPhoneで書いて、PCに残る。Ctrl+N で 0.3 秒起動、無料、データはあなたの手元（PC＋自分の Google Drive）に。";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "俺の付箋",
  alternateName: "FUSEN — My Sticky Notes for Windows",
  applicationCategory: "ProductivityApplication",
  operatingSystem: "Windows",
  url: SITE_URL,
  image: OG_IMAGE,
  description: SITE_DESCRIPTION,
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "JPY",
  },
};

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "俺の付箋 — Win+iPhone を繋ぐ、軽い付箋アプリ",
  description: SITE_DESCRIPTION,
  keywords: [
    "俺の付箋",
    "FUSEN",
    "My Sticky Notes",
    "Ore-no-Fusen",
    "Windows 付箋アプリ",
    "デスクトップ付箋",
    "iPhone メモ PC 送信",
    "iPhoneからPCにメモ",
    "Google Drive 同期 メモ",
    "Markdown 付箋",
    "ローカル保存 メモアプリ",
  ],
  applicationName: "俺の付箋",
  authors: [{ name: "Ore-no-Fusen" }],
  creator: "Ore-no-Fusen",
  publisher: "Ore-no-Fusen",
  category: "productivity",
  manifest: "/manifest.webmanifest",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "俺の付箋",
    title: "FUSEN — My Sticky Notes for Windows",
    description:
      "PCで書いて、iPhoneへ届く。Ctrl+N で 0.3 秒起動。無料・ローカル保存。",
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 800,
        alt: "俺の付箋のスクリーンショット",
      },
    ],
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    site: "@uchikiman",
    creator: "@uchikiman",
    title: "FUSEN — My Sticky Notes for Windows",
    description:
      "PCで書いて、iPhoneへ届く。Ctrl+N で 0.3 秒起動。無料・ローカル保存。",
    images: [OG_IMAGE],
  },
  alternates: {
    canonical: SITE_URL,
  },
  verification: {
    google: "google1ad84f38f94a2097",
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
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
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
