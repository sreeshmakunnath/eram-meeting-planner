"use client";

import { useEffect } from "react";

/**
 * React 19 clears every form with a server action after it submits, so a form that comes back with an error
 * would lose what was typed, and selects would jump back to their old value. The app was built on the React 18
 * behaviour (fields keep their values; pages that change show fresh values after revalidating), so cancel those
 * automatic resets. A form that should clear after saving remounts itself instead (see LogForm).
 */
export function KeepFormValues() {
  useEffect(() => {
    const keep = (e: Event) => e.preventDefault();
    document.addEventListener("reset", keep, true);
    return () => document.removeEventListener("reset", keep, true);
  }, []);
  return null;
}
