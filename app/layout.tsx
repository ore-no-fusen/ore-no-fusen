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
import "./shadcn.css";
import "./globals.css";
import RegisterPWA from "./RegisterPWA";
import { NOTE_COLORS } from './utils/noteAppearance';
import { Analytics } from "@vercel/analytics/next";
import AnalyticsLoader from "./components/AnalyticsLoader";

const SITE_URL = "https://ore-no-fusen.vercel.app";
const OG_IMAGE = `${SITE_URL}/screenshots/ScreenShot_OreNoFusen.png`;
const IS_TAURI_BUILD = process.env.IS_TAURI_BUILD === "true";
const SITE_DESCRIPTION =
  "FUSEN is a local-first sticky notes app for developers working with AI coding tools. Capture small bits of context on Windows and hand them off to/from iPhone with Google Drive.";

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "FUSEN",
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
  title: "FUSEN — My Sticky Notes for AI Coding Tools",
  description: SITE_DESCRIPTION,
  keywords: [
    "sticky notes for AI coding tools",
    "AI coding notes",
    "local-first sticky notes",
    "Windows sticky notes app",
    "developer notes app",
    "Google Drive handoff notes",
    "iPhone notes to Windows",
    "winget sticky notes",
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
  manifest: "/manifest.webmanifest?v=20260802",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "FUSEN",
    title: "FUSEN — My Sticky Notes for AI Coding Tools",
    description: SITE_DESCRIPTION,
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
    site: "@onfstudio",
    creator: "@onfstudio",
    title: "FUSEN — My Sticky Notes for AI Coding Tools",
    description: SITE_DESCRIPTION,
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
        <link rel="icon" href="/favicon.ico?v=20260802" />
        <link rel="shortcut icon" href="/favicon.ico?v=20260802" />
        <link rel="apple-touch-icon" href="/icon-192.png?v=20260802" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        {/* 付箋ウィンドウ（?path=）はglobals.cssの#111827より先に黄色を設定 */}
        <script dangerouslySetInnerHTML={{
          __html: `
          if (new URLSearchParams(location.search).has('path')) {
            var s = document.createElement('style');
            s.textContent = 'html,body{background:${NOTE_COLORS.yellow}!important}';
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

        <AnalyticsLoader isTauriBuild={IS_TAURI_BUILD} />
        {!IS_TAURI_BUILD && <Analytics />} 
      </body>
    </html>
  );
}
