export type ProcessorMessage =
  | { type: 'config'; revision: number; target: number }
  | { type: 'buffer'; buffer: ArrayBuffer };

export type PitchRequest = {
  type: 'pitch';
  buffer: ArrayBuffer;
  revision: number;
  sampleRate: number;
};

export type PhaseMessage = {
  type: 'phase';
  phase: number;
  reliable: boolean;
  rms: number;
  revision: number;
};

export type PitchResult = {
  hz: number;
  clarity: number;
  rms: number;
  revision: number;
  buffer: ArrayBuffer;
};
