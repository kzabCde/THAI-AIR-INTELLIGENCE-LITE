export type AppTheme = "system" | "light" | "dark";
export type AppLanguage = "th" | "en";

export type AppSettings = {
  theme: AppTheme;
  interval: "60" | "300" | "600";
  notify: boolean;
  lang: AppLanguage;
  favorites: string;
};

const KEYS = {
  darkMode: "thai_air_dark_mode",
  favorite: "thai_air_favorite",
  compare: "thai_air_compare",
  settings: "thai_air_settings_v1",
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: "system",
  interval: "60",
  notify: true,
  lang: "th",
  favorites: "",
};

function canUseStorage() {
  return typeof window !== "undefined";
}

export const storage = {
  getDarkMode: () => (canUseStorage() ? localStorage.getItem(KEYS.darkMode) === "1" : false),
  setDarkMode: (value: boolean) => {
    if (!canUseStorage()) return;
    localStorage.setItem(KEYS.darkMode, value ? "1" : "0");
  },
  getFavorite: () => (canUseStorage() ? localStorage.getItem(KEYS.favorite) ?? "" : ""),
  setFavorite: (slug: string) => {
    if (!canUseStorage()) return;
    localStorage.setItem(KEYS.favorite, slug);
  },
  getCompare: () => {
    if (!canUseStorage()) return [] as string[];
    const raw = localStorage.getItem(KEYS.compare);
    if (!raw) return [];
    try {
      return JSON.parse(raw) as string[];
    } catch {
      return [];
    }
  },
  setCompare: (slugs: string[]) => {
    if (!canUseStorage()) return;
    localStorage.setItem(KEYS.compare, JSON.stringify(slugs));
  },
  getSettings: (): AppSettings => {
    if (!canUseStorage()) return DEFAULT_SETTINGS;
    const raw = localStorage.getItem(KEYS.settings);
    if (!raw) return DEFAULT_SETTINGS;

    try {
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      return {
        theme: parsed.theme ?? DEFAULT_SETTINGS.theme,
        interval: parsed.interval ?? DEFAULT_SETTINGS.interval,
        notify: parsed.notify ?? DEFAULT_SETTINGS.notify,
        lang: parsed.lang ?? DEFAULT_SETTINGS.lang,
        favorites: parsed.favorites ?? DEFAULT_SETTINGS.favorites,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  },
  setSettings: (settings: AppSettings) => {
    if (!canUseStorage()) return;
    localStorage.setItem(KEYS.settings, JSON.stringify(settings));
    if (settings.theme === "dark") {
      storage.setDarkMode(true);
    } else if (settings.theme === "light") {
      storage.setDarkMode(false);
    }
  },
  reset: () => {
    if (!canUseStorage()) return;
    Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  },
};

export { DEFAULT_SETTINGS };
