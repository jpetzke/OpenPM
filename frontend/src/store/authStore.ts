import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "@/types/project";

interface AuthState {
  user: User | null;
  token: string | null;
  refreshToken: string | null;
  hasHydrated: boolean;
  setAuth: (user: User, token: string, refreshToken?: string | null) => void;
  clearAuth: () => void;
  setHasHydrated: (val: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      refreshToken: null,
      hasHydrated: false,
      setAuth: (user, token, refreshToken = null) =>
        set({ user, token, refreshToken: refreshToken ?? null }),
      clearAuth: () => set({ user: null, token: null, refreshToken: null }),
      setHasHydrated: (val) => set({ hasHydrated: val }),
    }),
    {
      name: "openpm-auth",
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);
