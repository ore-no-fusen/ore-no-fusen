import type { Metadata } from "next";

const SITE_URL = "https://ore-no-fusen.vercel.app";
const OG_IMAGE = `${SITE_URL}/screenshots/ScreenShot_OreNoFusen.png`;
const LANDING_DESCRIPTION =
  "FUSEN is a local-first sticky notes app for developers working with AI coding tools. Capture small bits of context on Windows and hand them off to/from iPhone with Google Drive.";

export const metadata: Metadata = {
  title: "FUSEN — My Sticky Notes for AI Coding Tools",
  description: LANDING_DESCRIPTION,
  keywords: [
    "sticky notes for AI coding tools",
    "AI coding notes",
    "local-first sticky notes",
    "Windows sticky notes app",
    "developer notes app",
    "Google Drive handoff notes",
    "iPhone notes to Windows",
    "winget sticky notes",
    "Windows 付箋アプリ",
    "iPhone メモ PC 送信",
    "Google Drive メモ 同期",
    "デスクトップ付箋",
    "無料 付箋アプリ",
    "FUSEN",
    "My Sticky Notes",
    "Ore-no-Fusen",
    "俺の付箋",
  ],
  alternates: {
    canonical: `${SITE_URL}/landing`,
  },
  openGraph: {
    type: "website",
    url: `${SITE_URL}/landing`,
    siteName: "FUSEN",
    title: "FUSEN — My Sticky Notes for AI Coding Tools",
    description: LANDING_DESCRIPTION,
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
    title: "FUSEN — My Sticky Notes for AI Coding Tools",
    description: LANDING_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
