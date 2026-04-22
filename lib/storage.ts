const KEYS = {
  darkMode: "thai_air_dark_mode",
  favorite: "thai_air_favorite",
  compare: "thai_air_compare",
};

export const storage = {
  getDarkMode: () => (typeof window === "undefined" ? false : localStorage.getItem(KEYS.darkMode) === "1"),
  setDarkMode: (value: boolean) => localStorage.setItem(KEYS.darkMode, value ? "1" : "0"),
  getFavorite: () => (typeof window === "undefined" ? "" : localStorage.getItem(KEYS.favorite) ?? ""),
  setFavorite: (slug: string) => localStorage.setItem(KEYS.favorite, slug),
  getCompare: () => {
    if (typeof window === "undefined") return [] as string[];
    const raw = localStorage.getItem(KEYS.compare);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  },
  setCompare: (slugs: string[]) => localStorage.setItem(KEYS.compare, JSON.stringify(slugs)),
  reset: () => Object.values(KEYS).forEach((k) => localStorage.removeItem(k)),
};
