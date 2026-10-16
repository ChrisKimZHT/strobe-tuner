/// <reference lib="webworker" />
import { PitchDetector } from 'pitchy';
import type { PitchRequest, PitchResult } from './messages';

declare const self: DedicatedWorkerGlobalScope;
const detector = PitchDetector.forFloat32Array(4096);
self.onmessage = ({ data }: MessageEvent<PitchRequest>) => {
  const input = new Float32Array(data.buffer);
  let energy = 0;
  for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
  const [hz, clarity] = detector.findPitch(input, data.sampleRate);
  const result: PitchResult = {
    hz, clarity, rms: Math.sqrt(energy / input.length), revision: data.revision, buffer: data.buffer,
  };
  self.postMessage(result, { transfer: [data.buffer] });
};
