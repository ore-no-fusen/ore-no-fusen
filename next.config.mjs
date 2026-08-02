import withPWA from 'next-pwa';
import defaultRuntimeCaching from 'next-pwa/cache.js';
import { withSentryConfig } from '@sentry/nextjs';

import fs from 'fs';
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));
const isPreviewDeployment = process.env.VERCEL_ENV === 'preview' || process.env.NODE_ENV === 'development';

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
  distDir: process.env.NEXT_DIST_DIR || '.next',
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || 'tsconfig.json',
  },
  // Tauriビルド時のみ 'export' を有効化 (VercelではAPI Routeを使うため無効化)
  output: process.env.IS_TAURI_BUILD === 'true' ? 'export' : undefined,
  images: {
    unoptimized: process.env.IS_TAURI_BUILD === 'true',
  },
  staticPageGenerationTimeout: 300, // 5分に延長
  // Vercel配信時のみ '/' を LP (/landing) として配信する。
  // Tauri build/export では rewrites 自体を持たせない。output:'export' では rewrites が無効で warning になるため。
  ...(process.env.IS_TAURI_BUILD === 'true' || process.env.TAURI_DEV === '1'
    ? {}
    : {
        async rewrites() {
          return {
            beforeFiles: [
              { source: '/', destination: '/landing' },
              ...(isPreviewDeployment
                ? [{ source: '/manifest.webmanifest', destination: '/manifest.preview.webmanifest' }]
                : []),
            ],
            afterFiles: [],
            fallback: [],
          };
        },
      }),
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
  runtimeCaching: [
    {
      urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname === '/viewer',
      handler: 'StaleWhileRevalidate',
      method: 'GET',
      options: {
        cacheName: 'viewer-shell',
        cacheableResponse: { statuses: [200] },
        expiration: { maxEntries: 2, maxAgeSeconds: 24 * 60 * 60 },
      },
    },
    ...defaultRuntimeCaching,
  ],
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
