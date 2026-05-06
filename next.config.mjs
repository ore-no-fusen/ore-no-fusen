import withPWA from 'next-pwa';
import { withSentryConfig } from '@sentry/nextjs';

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
  // Vercel配信時のみ '/' を LP (/landing) として配信する。
  // - 本番Tauriビルド (IS_TAURI_BUILD=true) では output:'export' の都合で rewrites は無視されるが、念のため明示的に空にする。
  // - Tauri dev (TAURI_DEV=1) では同じ dev サーバを Tauri が読みに行くため、リライトを無効化してアプリ画面を返す。
  // beforeFiles を使うことで、ファイルシステム上の '/' (= app/page.tsx = Tauri アプリ) より先に書き換える。
  async rewrites() {
    const isTauriContext =
      process.env.IS_TAURI_BUILD === 'true' || process.env.TAURI_DEV === '1';
    if (isTauriContext) return { beforeFiles: [], afterFiles: [], fallback: [] };
    return {
      beforeFiles: [
        { source: '/', destination: '/landing' },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
};

const pwaConfig = withPWA({
  dest: "public",
  register: process.env.IS_TAURI_BUILD !== 'true',
  skipWaiting: false,
  disable: process.env.NODE_ENV === 'development' || process.env.IS_TAURI_BUILD === 'true',
  // カスタム SW ソース — next-pwa が Workbox sw.js に merge する（上書き衝突回避）
  customWorkerDir: 'worker',
  // /viewer はオンライン必須（Google Drive依存）のためprecaching不要
  // precachingを全て無効化することでSWが即座にactivatedになる
  exclude: [/.*/],
})(nextConfig);

// 設定をエクスポート（ここが最後です）
export default withSentryConfig(pwaConfig, {
  // ソースマップをSentryにアップロードしない（ローカルアプリなので不要）
  silent: true,
  telemetry: false,
  // Tauriの静的エクスポートではサーバー側Sentryは不要
  disableServerWebpackPlugin: true,
  disableClientWebpackPlugin: false,
});

