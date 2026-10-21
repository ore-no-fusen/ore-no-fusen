/**
 * PWA登録コンポーネント (RegisterPWA)
 *
 * 責務:
 * - Tauri環境: Service Workerを全解除（既存動作を維持）
 * - Safari PWA環境: push対応カスタムSWを登録
 */

"use client";

import { useEffect } from "react";
import { isTauri } from "@tauri-apps/api/core";

export default function RegisterPWA() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isTauriRuntime =
      isTauri() ||
      typeof (window as any).__TAURI_INTERNALS__ !== "undefined" ||
      typeof (window as any).__TAURI__ !== "undefined" ||
      window.location.hostname === "tauri.localhost";

    if (isTauriRuntime) {
      // Tauri: 全SW登録解除（既存動作を維持）
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        const hadController = navigator.serviceWorker.controller !== null;
        for (const reg of registrations) {
          reg.unregister();
          console.log("Service Worker unregistered: ", reg.scope);
        }
        if (hadController && registrations.length > 0 && !sessionStorage.getItem("tauri_sw_cleanup_reloaded")) {
          sessionStorage.setItem("tauri_sw_cleanup_reloaded", "1");
          window.location.reload();
        }
      }).catch((err) => {
        console.error("Service Worker unregistration failed: ", err);
      });
    } else if (process.env.NODE_ENV === "development") {
      // 開発中は、public/sw.js に残った本番用SWがNextの画面配信を横取りしないよう解除する。
      // PWAの登録は本番だけで行い、iPhoneの本番動作は変更しない。
      navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        const hadController = navigator.serviceWorker.controller !== null;
        const results = await Promise.all(registrations.map((reg) => reg.unregister()));
        const removedAny = results.some(Boolean);
        const isOAuthCallback = new URLSearchParams(window.location.search).has("code");
        if (hadController && removedAny && !isOAuthCallback && !sessionStorage.getItem("dev_sw_cleanup_reloaded")) {
          sessionStorage.setItem("dev_sw_cleanup_reloaded", "1");
          window.location.reload();
        }
      }).catch((err) => {
        console.error("Development service worker cleanup failed:", err);
      });
    } else {
      // Safari PWA: next-pwa が生成した push 対応 sw.js を登録
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((err) => console.error('SW register failed:', err));
    }
  }, []);

  return null;
}
