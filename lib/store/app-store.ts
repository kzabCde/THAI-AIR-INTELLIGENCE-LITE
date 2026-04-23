import { create } from "zustand";

type AppState = {
  favorites: string[];
  selectedProvince: string | null;
  toggleFavorite: (slug: string) => void;
  setSelectedProvince: (slug: string | null) => void;
};

export const useAppStore = create<AppState>((set) => ({
  favorites: [],
  selectedProvince: null,
  toggleFavorite: (slug: string) => set((state: AppState) => ({
    favorites: state.favorites.includes(slug)
      ? state.favorites.filter((x: string) => x !== slug)
      : [...state.favorites, slug],
  })),
  setSelectedProvince: (slug: string | null) => set({ selectedProvince: slug }),
}));
