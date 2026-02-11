import withPWA from 'next-pwa';

import fs from 'fs';
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf-8'));

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: packageJson.version,
  },
  reactStrictMode: true,
  // Tauri用設定
  output: 'export',
  images: {
    unoptimized: true,
  },
};

// 設定をエクスポート（ここが最後です）
export default withPWA({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development', // 開発時は警告を抑制
})(nextConfig);

