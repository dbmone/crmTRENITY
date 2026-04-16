import { create } from "zustand";
import type { UserRole } from "../types";

type TourCallback = (() => Promise<void> | void) | null;

interface StartOptions {
  onFinish?: TourCallback;
  onSkip?: TourCallback;
}

interface TourState {
  active: boolean;
  stepIndex: number;
  role: UserRole | null;
  onFinish: TourCallback;
  onSkip: TourCallback;
  start: (role: UserRole, options?: StartOptions) => void;
  next: (maxSteps: number) => void;
  prev: () => void;
  setStep: (stepIndex: number) => void;
  stop: () => void;
  finish: () => Promise<void>;
  skip: () => Promise<void>;
}

export const useTourStore = create<TourState>((set, get) => ({
  active: false,
  stepIndex: 0,
  role: null,
  onFinish: null,
  onSkip: null,
  start: (role, options) =>
    set({
      active: true,
      stepIndex: 0,
      role,
      onFinish: options?.onFinish ?? null,
      onSkip: options?.onSkip ?? null,
    }),
  next: (maxSteps) =>
    set((state) => ({
      stepIndex: Math.min(state.stepIndex + 1, Math.max(0, maxSteps - 1)),
    })),
  prev: () =>
    set((state) => ({
      stepIndex: Math.max(0, state.stepIndex - 1),
    })),
  setStep: (stepIndex) => set({ stepIndex }),
  stop: () =>
    set({
      active: false,
      stepIndex: 0,
      role: null,
      onFinish: null,
      onSkip: null,
    }),
  finish: async () => {
    const cb = get().onFinish;
    get().stop();
    await cb?.();
  },
  skip: async () => {
    const cb = get().onSkip;
    get().stop();
    await cb?.();
  },
}));
