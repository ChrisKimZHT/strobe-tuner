import { PhaseDemodulator, TAU } from './dsp';
declare const sampleRate: number;
declare class AudioWorkletProcessor { port: MessagePort; constructor(); }
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class TunerProcessor extends AudioWorkletProcessor {
  dsp = new PhaseDemodulator(sampleRate);
  pool: Float32Array[] = [new Float32Array(4096), new Float32Array(4096), new Float32Array(4096)];
  frame: Float32Array | undefined = this.pool.pop();
  index = 0; tick = 0; revision = 0;
  test = false; testFrequency = 110; testPhase = 0;
  constructor() {
    super();
    this.port.onmessage = ({ data }) => {
      if (data.type === 'buffer') this.pool.push(new Float32Array(data.buffer));
      if (data.type === 'config') {
        this.revision = data.revision;
        this.dsp.setTarget(data.target);
        this.test = data.test; this.testFrequency = data.testFrequency;
        // Discard the partial identification window after a configuration change.
        this.index = 0;
      }
    };
  }
  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0][0];
    const input = inputs[0]?.[0];
    for (let n = 0; n < output.length; n++) {
      let x = input?.[n] ?? 0;
      if (this.test) {
        x = .2 * Math.cos(this.testPhase);
        this.testPhase = (this.testPhase + TAU * this.testFrequency / sampleRate) % TAU;
      }
      output[n] = 0; // Never monitor microphone or internal test signal.
      this.dsp.push(x);
      if (!this.frame) this.frame = this.pool.pop();
      if (this.frame) {
        this.frame[this.index++] = x;
        if (this.index === this.frame.length) {
          this.port.postMessage({ type: 'pitch', buffer: this.frame.buffer, revision: this.revision, sampleRate }, [this.frame.buffer]);
          this.frame = undefined; this.index = 0;
        }
      }
      if (++this.tick >= sampleRate / 60) {
        this.tick = 0;
        this.port.postMessage({ type: 'phase', phase: this.dsp.phase, reliable: this.dsp.reliable,
          rms: this.dsp.rms, revision: this.revision });
      }
    }
    return true;
  }
}
registerProcessor('phase-tuner', TunerProcessor);
