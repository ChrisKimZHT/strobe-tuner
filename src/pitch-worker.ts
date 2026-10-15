import { PitchDetector } from 'pitchy';
const detector = PitchDetector.forFloat32Array(4096);
self.onmessage = ({ data }) => {
  const input = new Float32Array(data.buffer);
  let energy = 0;
  for (let i = 0; i < input.length; i++) energy += input[i] * input[i];
  const [hz, clarity] = detector.findPitch(input, data.sampleRate);
  self.postMessage({ hz, clarity, rms: Math.sqrt(energy / input.length), revision: data.revision,
    buffer: data.buffer }, { transfer: [data.buffer] });
};
