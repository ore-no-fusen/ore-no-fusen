import withPWA from 'next-pwa';

import fs from 'fs';
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

/**
 * Next.js 設定ファイル
 *
 * 責務:
 * - Next.jsのビルド・ランタイム設定
 * - React Strict Modeの有効化
 * - スタティックエクスポート設定 (Tauri用)
 */

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  reactStrictMode: false,
  // Tauriビルド時のみ 'export' を有効化 (VercelではAPI Routeを使うため無効化)
  output: process.env.IS_TAURI_BUILD === 'true' ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  staticPageGenerationTimeout: 300, // 5分に延長
};

// 設定をエクスポート（ここが最後です）
export default withPWA({
  dest: "public",
  register: process.env.IS_TAURI_BUILD !== 'true',
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development' || process.env.IS_TAURI_BUILD === 'true',
})(nextConfig);

