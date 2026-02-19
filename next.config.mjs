import withPWA from 'next-pwa';

import fs from 'fs';
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  reactStrictMode: true,
  // Tauriビルド時のみ 'export' を有効化 (VercelではAPI Routeを使うため無効化)
  output: process.env.IS_TAURI_BUILD === 'true' ? 'export' : undefined,
  images: {
    unoptimized: true,
  },
  staticPageGenerationTimeout: 300, // 5分に延長
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
};

// 設定をエクスポート（ここが最後です）
export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // 開発時は警告を抑制
})(nextConfig);

