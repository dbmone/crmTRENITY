import { create } from "zustand";
import { User } from "../types";
import { loginByPin, getMe } from "../api/client";

interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  error: string | null;

  login: (pin: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: JSON.parse(localStorage.getItem("user") || "null"),
  token: localStorage.getItem("token"),
  isLoading: false,
  error: null,

  login: async (pin: string) => {
    set({ isLoading: true, error: null });
    try {
      const data = await loginByPin(pin);
      set({ user: data.user, token: data.token, isLoading: false });
    } catch (err: any) {
      const msg = err.response?.data?.error || "Ошибка авторизации";
      set({ error: msg, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    set({ user: null, token: null });
  },

  checkAuth: async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const user = await getMe();
      set({ user, token });
    } catch {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      set({ user: null, token: null });
    }
  },
}));
