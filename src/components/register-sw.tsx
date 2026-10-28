"use client";

import { useEffect } from "react";

/** Registers the service worker, which makes the app installable on phones. */
export function RegisterServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
