export type Tuning = { id: string; notes: readonly number[] };
export type Instrument = { id: string; tunings: readonly Tuning[] };

// Notes follow conventional string numbering, from the highest number to string 1.
export const INSTRUMENTS: readonly Instrument[] = [
  { id: 'guitar', tunings: [
    { id: 'standard', notes: [40, 45, 50, 55, 59, 64] },
    { id: 'dropD', notes: [38, 45, 50, 55, 59, 64] },
    { id: 'dropC', notes: [36, 43, 48, 53, 57, 62] },
    { id: 'halfStepDown', notes: [39, 44, 49, 54, 58, 63] },
    { id: 'wholeStepDown', notes: [38, 43, 48, 53, 57, 62] },
    { id: 'dadgad', notes: [38, 45, 50, 55, 57, 62] },
    { id: 'openD', notes: [38, 45, 50, 54, 57, 62] },
    { id: 'openG', notes: [38, 43, 50, 55, 59, 62] },
    { id: 'openE', notes: [40, 47, 52, 56, 59, 64] },
  ] },
  { id: 'bass', tunings: [
    { id: 'standard', notes: [28, 33, 38, 43] },
    { id: 'dropD', notes: [26, 33, 38, 43] },
    { id: 'halfStepDown', notes: [27, 32, 37, 42] },
    { id: 'wholeStepDown', notes: [26, 31, 36, 41] },
  ] },
  { id: 'bass5', tunings: [{ id: 'standard', notes: [23, 28, 33, 38, 43] }] },
  { id: 'ukulele', tunings: [
    { id: 'highG', notes: [67, 60, 64, 69] },
    { id: 'lowG', notes: [55, 60, 64, 69] },
    { id: 'baritone', notes: [50, 55, 59, 64] },
  ] },
  { id: 'violin', tunings: [
    { id: 'standard', notes: [55, 62, 69, 76] },
    { id: 'crossA', notes: [57, 64, 69, 76] },
    { id: 'crossG', notes: [55, 62, 67, 74] },
  ] },
  { id: 'viola', tunings: [{ id: 'standard', notes: [48, 55, 62, 69] }] },
  { id: 'cello', tunings: [{ id: 'standard', notes: [36, 43, 50, 57] }] },
  { id: 'doubleBass', tunings: [
    { id: 'standard', notes: [28, 33, 38, 43] },
    { id: 'solo', notes: [30, 35, 40, 45] },
  ] },
];

export function getInstrument(id: string) {
  return INSTRUMENTS.find((instrument) => instrument.id === id);
}

export function getTuning(instrument: string, tuning: string) {
  const presets = getInstrument(instrument)?.tunings;
  return presets?.find((preset) => preset.id === tuning) ?? presets?.[0];
}

export function noteLabel(midi: number) {
  return `${['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12]}${Math.floor(midi / 12) - 1}`;
}
