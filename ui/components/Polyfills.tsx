"use client";

import { useEffect } from "react";

/**
 * Lightweight client-side polyfills for older browsers/environments.
 * - crypto.randomUUID fallback (non-cryptographic)
 */
export default function Polyfills() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = globalThis as any;
    if (typeof g.crypto === "undefined") {
      g.crypto = {};
    }
    if (typeof g.crypto.randomUUID !== "function") {
      g.crypto.randomUUID = () =>
        "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }
  }, []);

  return null;
}
