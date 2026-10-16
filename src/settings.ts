import { clampMidi } from './audio/dsp';

export type InputChannel = 'left' | 'mix' | 'right';

export type Settings = {
  mode: 'auto' | 'manual';
  midi: number;
  a4: number;
  channel: InputChannel;
};

export const MIN_A4 = 430;
export const MAX_A4 = 450;
export const DEFAULT_SETTINGS: Settings = { mode: 'auto', midi: 45, a4: 440, channel: 'mix' };
const STORAGE_KEY = 'strobe-tuner.settings.v1';

export function clampA4(value: number) {
  return Math.round(Math.max(MIN_A4, Math.min(MAX_A4, value)));
}

export function loadSettings(): Settings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!saved || typeof saved !== 'object') return { ...DEFAULT_SETTINGS };
    return {
      mode: saved.mode === 'manual' ? 'manual' : 'auto',
      midi: typeof saved.midi === 'number' && Number.isFinite(saved.midi) ? clampMidi(saved.midi) : DEFAULT_SETTINGS.midi,
      a4: typeof saved.a4 === 'number' && Number.isFinite(saved.a4) ? clampA4(saved.a4) : DEFAULT_SETTINGS.a4,
      channel: saved.channel === 'left' || saved.channel === 'right' ? saved.channel : 'mix',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Tuning works when storage is unavailable.
  }
}
