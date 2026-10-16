export const TAU = 2 * Math.PI;
export const MIN_MIDI = 36;
export const MAX_MIDI = 95;
export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
export const clampMidi = (midi: number) => Math.max(MIN_MIDI, Math.min(MAX_MIDI, Math.round(midi)));
export const frequency = (midi: number, a4 = 440) => a4 * 2 ** ((midi - 69) / 12);
export const wrap = (phase: number) => Math.atan2(Math.sin(phase), Math.cos(phase));

/** Four matched one-pole stages per quadrature; all state survives block boundaries. */
export class PhaseDemodulator {
  private i = new Float64Array(4);
  private q = new Float64Array(4);
  private oscillator = 0;
  private step = 0;
  private alpha = 0;
  private energyAlpha: number;
  private energy = 0;
  private previous = 0;
  private samples = 0;
  phase = 0;
  unwrapped = 0;
  cutoff = 0;
  readonly sampleRate: number;
  target: number;

  constructor(sampleRate: number, target = 110) {
    this.sampleRate = sampleRate;
    this.target = target;
    this.energyAlpha = 1 - Math.exp(-1 / (sampleRate * 0.04));
    this.setTarget(target);
  }

  setTarget(target: number) {
    this.target = target;
    this.cutoff = Math.min(30, target * 0.12);
    this.alpha = 1 - Math.exp(-TAU * this.cutoff / this.sampleRate);
    this.step = TAU * target / this.sampleRate;
    this.i.fill(0);
    this.q.fill(0);
    this.oscillator = this.phase = this.previous = this.unwrapped = this.samples = this.energy = 0;
  }

  push(x: number) {
    // cos input -> I=cos(delta)/2, Q=sin(delta)/2: positive delta is sharp.
    let i = x * Math.cos(this.oscillator);
    let q = -x * Math.sin(this.oscillator);
    this.oscillator += this.step;
    if (this.oscillator >= TAU) this.oscillator -= TAU;
    for (let k = 0; k < 4; k++) {
      this.i[k] += this.alpha * (i - this.i[k]);
      this.q[k] += this.alpha * (q - this.q[k]);
      i = this.i[k];
      q = this.q[k];
    }
    this.energy += this.energyAlpha * (x * x - this.energy);
    this.phase = Math.atan2(q, i);
    this.unwrapped += wrap(this.phase - this.previous);
    this.previous = this.phase;
    this.samples++;
  }

  get rms() { return Math.sqrt(Math.max(0, this.energy)); }
  get amplitude() { return 2 * Math.hypot(this.i[3], this.q[3]); }
  get settled() { return this.samples >= 0.4 * this.sampleRate; }
  get reliable() {
    return this.settled && this.rms > 0.002 && this.amplitude > 0.0015 &&
      this.amplitude / Math.max(this.rms * Math.SQRT2, 1e-10) > 0.08;
  }
}

export class TargetTracker {
  midi = 45;
  acquired = false;
  private candidate = -1;
  private count = 0;

  reset() {
    this.candidate = -1;
    this.count = 0;
  }

  update(hz: number, clarity: number, rms: number, a4: number) {
    const m = 69 + 12 * Math.log2(hz / a4);
    if (!Number.isFinite(m) || m < MIN_MIDI - 0.6 || m > MAX_MIDI + 0.6 || clarity < 0.9 || rms < 0.002) {
      this.reset();
      return false;
    }
    if (this.acquired && Math.abs(m - this.midi) < 0.65) {
      this.reset();
      return false;
    }
    const next = clampMidi(m);
    if (next !== this.candidate) {
      this.candidate = next;
      this.count = 0;
    }
    // Larger jumps, including octave candidates, require six consecutive frames.
    if (++this.count < (this.acquired && Math.abs(next - this.midi) >= 12 ? 6 : 3)) return false;
    this.midi = next;
    this.acquired = true;
    this.reset();
    return true;
  }
}
