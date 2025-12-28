import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development" // 開発中はSW無効（混乱防止）
});

const nextConfig = {
  reactStrictMode: true
};

export default withPWA(nextConfig);


