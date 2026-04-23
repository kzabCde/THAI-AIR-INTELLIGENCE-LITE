"use client";

import { useSyncExternalStore } from "react";

type AppState = {
  favorites: string[];
  selectedProvince: string | null;
  toggleFavorite: (slug: string) => void;
  setSelectedProvince: (slug: string | null) => void;
};

type Store = {
  state: Omit<AppState, "toggleFavorite" | "setSelectedProvince">;
  listeners: Set<() => void>;
};

const store: Store = {
  state: {
    favorites: [],
    selectedProvince: null,
  },
  listeners: new Set(),
};

function emit() {
  store.listeners.forEach((listener) => listener());
}

function toggleFavorite(slug: string) {
  const exists = store.state.favorites.includes(slug);
  store.state = {
    ...store.state,
    favorites: exists ? store.state.favorites.filter((item) => item !== slug) : [...store.state.favorites, slug],
  };
  emit();
}

function setSelectedProvince(slug: string | null) {
  store.state = {
    ...store.state,
    selectedProvince: slug,
  };
  emit();
}

function subscribe(listener: () => void) {
  store.listeners.add(listener);
  return () => store.listeners.delete(listener);
}

export function useAppStore<T>(selector: (state: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () =>
      selector({
        ...store.state,
        toggleFavorite,
        setSelectedProvince,
      }),
    () =>
      selector({
        ...store.state,
        toggleFavorite,
        setSelectedProvince,
      }),
  );
}
