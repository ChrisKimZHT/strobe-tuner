import { PhaseDemodulator } from './dsp';
import type { ProcessorMessage } from './messages';

declare const sampleRate: number;
declare class AudioWorkletProcessor {
  port: MessagePort;
  constructor();
}
declare function registerProcessor(name: string, processor: typeof AudioWorkletProcessor): void;

class TunerProcessor extends AudioWorkletProcessor {
  private dsp = new PhaseDemodulator(sampleRate);
  private pool: Float32Array[] = Array.from({ length: 3 }, () => new Float32Array(4096));
  private frame = this.pool.pop();
  private index = 0;
  private tick = 0;
  private revision = 0;

  constructor() {
    super();
    this.port.onmessage = ({ data }: MessageEvent<ProcessorMessage>) => {
      if (data.type === 'buffer') this.pool.push(new Float32Array(data.buffer));
      if (data.type === 'config') {
        this.revision = data.revision;
        this.dsp.setTarget(data.target);
        // Discard the partial identification window after a target change.
        this.index = 0;
      }
    };
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]) {
    const output = outputs[0][0];
    const channels = inputs[0] ?? [];
    for (let index = 0; index < output.length; index++) {
      let sample = 0;
      for (const channel of channels) sample += channel[index] ?? 0;
      if (channels.length) sample /= channels.length;
      output[index] = 0;
      this.dsp.push(sample);

      if (!this.frame) this.frame = this.pool.pop();
      if (this.frame) {
        this.frame[this.index++] = sample;
        if (this.index === this.frame.length) {
          this.port.postMessage({
            type: 'pitch', buffer: this.frame.buffer, revision: this.revision, sampleRate,
          }, [this.frame.buffer]);
          this.frame = undefined;
          this.index = 0;
        }
      }

      if (++this.tick >= sampleRate / 60) {
        this.tick = 0;
        this.port.postMessage({
          type: 'phase', phase: this.dsp.phase, reliable: this.dsp.reliable,
          rms: this.dsp.rms, revision: this.revision,
        });
      }
    }
    return true;
  }
}

registerProcessor('strobe-tuner', TunerProcessor);
