import type { Metadata } from "next";

const SITE_URL = "https://ore-no-fusen.vercel.app";
const OG_IMAGE = `${SITE_URL}/screenshots/ScreenShot_OreNoFusen.png`;
const LANDING_DESCRIPTION =
  "俺の付箋は、Windowsのデスクトップ付箋をiPhoneとGoogle Driveでつなぐ無料アプリです。PCで書いたメモをiPhoneへ送り、iPhoneからPCへも戻せます。";

export const metadata: Metadata = {
  title: "FUSEN — My Sticky Notes for Windows",
  description: LANDING_DESCRIPTION,
  keywords: [
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
    siteName: "俺の付箋",
    title: "FUSEN — My Sticky Notes for Windows",
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
    title: "FUSEN — My Sticky Notes for Windows",
    description: LANDING_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return children;
}
