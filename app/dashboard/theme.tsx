"use client";

import { useEffect } from "react";

export interface Theme {
  primary: string;
  secondary: string;
  mode: string;
}

export function ThemeApplier({ theme }: { theme: Theme | null }) {
  useEffect(() => {
    try {
      const cached = localStorage.getItem("markley.theme");
      const t = theme ?? (cached ? JSON.parse(cached) : null);
      if (!t) return;
      const root = document.documentElement.style;
      if (t.primary) root.setProperty("--primary", t.primary);
      if (t.secondary) root.setProperty("--secondary", t.secondary);
      if (theme) localStorage.setItem("markley.theme", JSON.stringify(theme));
    } catch {
      // theme is cosmetic; never break the page
    }
  }, [theme]);
  return null;
}
