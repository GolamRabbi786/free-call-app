const THEME_KEY = "freecall-theme";

export type Theme = "light" | "dark";

export function getTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    /* storage unavailable */
  }
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    /* storage unavailable */
  }
}

/** Apply the saved/system theme before the first render to avoid a flash. */
export function initTheme() {
  applyTheme(getTheme());
}

export function toggleTheme(): Theme {
  const next = getTheme() === "dark" ? "light" : "dark";
  applyTheme(next);
  return next;
}
