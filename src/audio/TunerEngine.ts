import workletUrl from './tuner-worklet.ts?worker&url';
import { AudioSession } from './AudioSession';
import { frequency, normalizeMidi, TargetTracker } from './dsp';
import type { PhaseMessage, PitchRequest, PitchResult, ProcessorMessage } from './messages';
import { DEFAULT_SETTINGS, type Settings } from '../settings';
import { getTuning } from '../tunings';

export type TunerStatus = 'stopped' | 'starting' | 'running' | 'suspended';
export type TunerError = 'unsupported' | 'permissionDenied' | 'deviceUnavailable' | 'deviceEnded'
  | 'processingFailed' | 'startFailed' | 'resumeFailed';

export type TunerSnapshot = {
  status: TunerStatus;
  error: TunerError | null;
  midi: number;
  target: number;
  measured: number | null;
  cents: number | null;
  phase: number;
  revision: number;
  valid: boolean;
  signal: 'waiting' | 'stabilizing' | 'tracking' | 'outOfRange';
  locked: boolean;
  canLock: boolean;
};

/** Coordinates the two measurement paths; React never participates in audio processing. */
export class TunerEngine {
  onChange?: () => void;
  private session = new AudioSession();
  private tracker = new TargetTracker();
  private worker?: Worker;
  private settings = { ...DEFAULT_SETTINGS };
  private status: TunerStatus = 'stopped';
  private error: TunerError | null = null;
  private midi = DEFAULT_SETTINGS.midi;
  private locked = false;
  private request = 0;
  private revision = 0;
  private phase = 0;
  private phaseGood = false;
  private pitchGood = false;
  private lastPhase = 0;
  private lastPitch = 0;
  private hz = 0;
  private smoothedHz = 0;

  configure(settings: Settings) {
    const previous = this.settings;
    this.settings = { ...settings };
    const tuningChanged = previous.instrument !== settings.instrument || previous.tuning !== settings.tuning || previous.capo !== settings.capo;
    const notes = getTuning(settings.instrument, settings.tuning, settings.capo)?.notes;
    if (previous.mode !== settings.mode || tuningChanged) {
      this.locked = false;
      this.tracker.acquired = false;
    }
    if (settings.mode === 'manual') this.midi = settings.midi;
    if (tuningChanged) this.midi = notes
      ? notes.includes(settings.midi) ? settings.midi : notes[0]
      : normalizeMidi(settings.midi);
    if (notes && !notes.includes(this.midi)) this.midi = notes[0];
    if (previous.mode !== settings.mode || previous.a4 !== settings.a4 || previous.midi !== settings.midi || tuningChanged) {
      this.configureTarget();
    }
  }

  setLocked(locked: boolean) {
    if (locked && (this.settings.mode !== 'auto' || !this.tracker.acquired)) return;
    this.locked = locked;
    this.configureTarget();
  }

  clearError() {
    this.error = null;
    this.onChange?.();
  }

  private clearReading() {
    this.phaseGood = this.pitchGood = false;
    this.hz = this.smoothedHz = 0;
  }

  private configureTarget() {
    this.revision++;
    this.clearReading();
    this.tracker.reset();
    const config: ProcessorMessage = {
      type: 'config', revision: this.revision, target: frequency(this.midi, this.settings.a4),
    };
    this.session.node?.port.postMessage(config);
    this.onChange?.();
  }

  /** Switch to a synthesized input, or back to the microphone when omitted. */
  async setDebugTone(hz?: number) {
    if (hz !== undefined && (!Number.isFinite(hz) || hz <= 0 ||
      (this.session.context && hz >= this.session.context.sampleRate / 2))) {
      throw new RangeError('Hz must be finite, greater than 0, and below half the audio sample rate.');
    }
    const closing = this.stop();
    const request = this.request;
    await closing;
    if (request === this.request) await this.start(hz);
  }

  async start(toneHz?: number) {
    if (this.status !== 'stopped') return;
    const request = ++this.request;
    this.status = 'starting';
    this.error = null;
    this.tracker.acquired = false;
    this.tracker.reset();
    this.clearReading();
    this.onChange?.();

    try {
      if (!window.isSecureContext || !window.AudioContext || !window.AudioWorkletNode ||
        (toneHz === undefined && !navigator.mediaDevices?.getUserMedia)) {
        this.fail('unsupported');
        return;
      }
      this.worker = new Worker(new URL('./pitch-worker.ts', import.meta.url), { type: 'module' });
      this.worker.onerror = () => {
        if (request === this.request) this.fail('processingFailed');
      };
      this.worker.onmessage = ({ data }: MessageEvent<PitchResult>) => {
        if (request !== this.request) return;
        this.session.node?.port.postMessage({ type: 'buffer', buffer: data.buffer }, [data.buffer]);
        if (data.revision !== this.revision || this.status !== 'running') return;
        this.lastPitch = performance.now();
        const midi = 69 + 12 * Math.log2(data.hz / this.settings.a4);
        const notes = getTuning(this.settings.instrument, this.settings.tuning, this.settings.capo)?.notes;
        const min = notes ? Math.min(...notes) - 2 : -Infinity;
        const max = notes ? Math.max(...notes) + 2 : Infinity;
        this.pitchGood = Number.isFinite(midi) && data.clarity >= 0.9 && data.rms > 0.002 &&
          midi >= min && midi <= max;
        if (!this.pitchGood) {
          this.tracker.reset();
          this.clearReading();
          return;
        }
        if (this.settings.mode === 'auto' && !this.locked && this.tracker.update(data.hz, data.clarity, data.rms, this.settings.a4, notes)) {
          this.midi = this.tracker.midi;
          this.configureTarget();
          return;
        }
        this.hz = data.hz;
        this.smoothedHz = this.smoothedHz ? 0.6 * this.smoothedHz + 0.4 * data.hz : data.hz;
      };

      await this.session.start(workletUrl, (node) => {
        node.onprocessorerror = () => {
          if (request === this.request) this.fail('processingFailed');
        };
        node.port.onmessage = ({ data }: MessageEvent<PitchRequest | PhaseMessage>) => {
          if (request !== this.request) return;
          if (data.type === 'pitch') this.worker?.postMessage(data, [data.buffer]);
          if (data.type === 'phase' && data.revision === this.revision) {
            this.phase = data.phase;
            this.phaseGood = data.reliable;
            this.lastPhase = performance.now();
            if (data.rms < 0.002) this.clearReading();
          }
        };
      }, (state) => {
        if (request !== this.request) return;
        if (state === 'ended' || state === 'closed') {
          this.fail('deviceEnded');
          return;
        }
        this.status = state === 'running' ? 'running' : 'suspended';
        this.configureTarget();
      }, toneHz);
    } catch (error) {
      if (request !== this.request) return;
      const name = error instanceof Error ? error.name : '';
      this.fail(name === 'NotAllowedError' ? 'permissionDenied'
        : ['NotFoundError', 'NotReadableError', 'OverconstrainedError'].includes(name) ? 'deviceUnavailable' : 'startFailed');
      if (toneHz !== undefined) throw error;
    }
  }

  async stop() {
    ++this.request;
    this.status = 'stopped';
    this.clearReading();
    this.worker?.terminate();
    this.worker = undefined;
    const closing = this.session.stop();
    this.onChange?.();
    await closing.catch(() => {});
  }

  async resume() {
    const context = this.session.context;
    if (!context) return;
    const request = this.request;
    this.error = null;
    this.onChange?.();
    try {
      await context.resume();
    } catch {
      if (request === this.request) {
        this.error = 'resumeFailed';
        this.onChange?.();
      }
    }
  }

  handleVisibility() {
    this.clearReading();
    if (!document.hidden && this.status !== 'stopped' && this.status !== 'starting') {
      if (this.session.context?.state === 'running') this.configureTarget();
      else void this.resume();
    }
    this.onChange?.();
  }

  private fail(error: TunerError) {
    this.error = error;
    void this.stop();
  }

  snapshot(now = performance.now()): TunerSnapshot {
    const fresh = this.status === 'running' && now - this.lastPitch < 350 && now - this.lastPhase < 150 && !document.hidden;
    const selected = this.settings.mode === 'manual' || this.locked || this.tracker.acquired;
    const target = frequency(this.midi, this.settings.a4);
    const hasPitch = fresh && this.pitchGood && selected;
    const inBand = Math.abs(this.hz - target) <= Math.min(30, target * 0.12) * 0.65;
    const valid = hasPitch && this.phaseGood && inBand;
    return {
      status: this.status,
      error: this.error,
      midi: this.midi,
      target,
      measured: hasPitch ? this.smoothedHz : null,
      cents: hasPitch ? 1200 * Math.log2(this.smoothedHz / target) : null,
      phase: this.phase,
      revision: this.revision,
      valid,
      signal: valid ? 'tracking' : hasPitch && !inBand ? 'outOfRange' : hasPitch ? 'stabilizing' : 'waiting',
      locked: this.locked,
      canLock: this.settings.mode === 'auto' && this.tracker.acquired,
    };
  }
}
