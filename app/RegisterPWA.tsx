/**
 * PWA登録コンポーネント (RegisterPWA)
 *
 * 責務:
 * - Tauri環境: Service Workerを全解除（既存動作を維持）
 * - Safari PWA環境: push対応カスタムSWを登録
 */

"use client";

import { useEffect } from "react";

export default function RegisterPWA() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const isTauri = typeof (window as any).__TAURI_INTERNALS__ !== 'undefined';

    if (isTauri) {
      // Tauri: 全SW登録解除（既存動作を維持）
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const reg of registrations) {
          reg.unregister();
          console.log("Service Worker unregistered: ", reg.scope);
        }
      }).catch((err) => {
        console.error("Service Worker unregistration failed: ", err);
      });
    } else {
      // Safari PWA: next-pwa が生成した push 対応 sw.js を登録
      navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((err) => console.error('SW register failed:', err));
    }
  }, []);

  return null;
}
