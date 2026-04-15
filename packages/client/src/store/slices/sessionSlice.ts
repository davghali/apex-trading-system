import { StateCreator } from 'zustand';

export type KillzoneName = 'ASIAN' | 'LONDON' | 'NY_AM' | 'NY_PM' | 'NONE';
export type SessionModel = 'CLASSIC' | 'SILVER_BULLET' | 'MACRO' | 'NONE';

export interface KillzoneInfo {
  name: KillzoneName;
  label: string;
  start: string;
  end: string;
  active: boolean;
  progress: number;
  remainingSeconds: number;
  model: SessionModel;
  characteristics: string[];
}

export interface NextKillzone {
  name: KillzoneName;
  label: string;
  startsIn: number;
}

export interface SessionSlice {
  currentKillzone: KillzoneInfo;
  nextKillzone: NextKillzone | null;
  nyTime: string;
  lastSessionUpdate: string;

  // Derived
  isInKillzone: boolean;
  currentSessionLabel: string;
  remainingFormatted: string;

  // Actions
  setCurrentKillzone: (kz: KillzoneInfo) => void;
  setNextKillzone: (next: NextKillzone | null) => void;
  setNYTime: (time: string) => void;
  resetSession: () => void;
}

const defaultKillzone: KillzoneInfo = {
  name: 'NONE',
  label: 'Off Session',
  start: '',
  end: '',
  active: false,
  progress: 0,
  remainingSeconds: 0,
  model: 'NONE',
  characteristics: [],
};

export const createSessionSlice: StateCreator<SessionSlice, [], [], SessionSlice> = (set) => ({
  currentKillzone: { ...defaultKillzone },
  nextKillzone: null,
  nyTime: '',
  lastSessionUpdate: '',
  isInKillzone: false,
  currentSessionLabel: 'Off Session',
  remainingFormatted: '00:00:00',

  setCurrentKillzone: (kz) =>
    set(() => {
      const h = Math.floor(kz.remainingSeconds / 3600);
      const m = Math.floor((kz.remainingSeconds % 3600) / 60);
      const s = Math.floor(kz.remainingSeconds % 60);
      return {
        currentKillzone: kz,
        isInKillzone: kz.active,
        currentSessionLabel: kz.label,
        remainingFormatted: `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`,
        lastSessionUpdate: new Date().toISOString(),
      };
    }),

  setNextKillzone: (next) => set({ nextKillzone: next }),
  setNYTime: (time) => set({ nyTime: time }),

  resetSession: () =>
    set({
      currentKillzone: { ...defaultKillzone },
      nextKillzone: null,
      nyTime: '',
      lastSessionUpdate: '',
      isInKillzone: false,
      currentSessionLabel: 'Off Session',
      remainingFormatted: '00:00:00',
    }),
});
