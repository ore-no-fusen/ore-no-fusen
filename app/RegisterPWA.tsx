/**
 * PWA登録コンポーネント (RegisterPWA)
 *
 * 責務:
 * - Service Workerの登録
 * - オフライン対応とキャッシュ管理の有効化
 */

"use client";

import { useEffect } from "react";

export default function RegisterPWA() {
    useEffect(() => {
        if ("serviceWorker" in navigator && process.env.NODE_ENV !== "development") {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => console.log("Service Worker registered (scope: " + reg.scope + ")"))
                .catch((error) => console.error("Service Worker registration failed: " + error));
        }
    }, []);

    return null;
}
