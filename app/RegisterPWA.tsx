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
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker.getRegistrations().then(function (registrations) {
                for (let registration of registrations) {
                    registration.unregister();
                    console.log("Service Worker unregistered: ", registration.scope);
                }
            }).catch(function (err) {
                console.error("Service Worker unregistration failed: ", err);
            });
        }
    }, []);

    return null;
}
