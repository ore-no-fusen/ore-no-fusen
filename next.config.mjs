import withPWA from 'next-pwa';

/** @type {import('next').NextConfig} */
const nextConfig = {
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

