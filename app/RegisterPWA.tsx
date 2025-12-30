"use client";

import { useEffect } from "react";

export default function RegisterPWA() {
    useEffect(() => {
        if ("serviceWorker" in navigator) {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => console.log("Service Worker registered (scope: " + reg.scope + ")"))
                .catch((error) => console.log("Service Worker registration failed: " + error));
        }
    }, []);

    return null;
}
