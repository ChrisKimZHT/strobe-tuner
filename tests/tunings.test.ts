import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { INSTRUMENTS, getTuning, noteLabel } from '../src/tunings.ts';
import { frequency, PhaseDemodulator, TargetTracker, TAU } from '../src/audio/dsp.ts';

test('every preset open string is detected at supported sample rates and A4 references', () => {
  const detector = PitchDetector.forFloat32Array(4096);
  const samples = new Float32Array(4096);
  for (const instrument of INSTRUMENTS) {
    for (const tuning of instrument.tunings) {
      for (const midi of tuning.notes) {
        for (const sampleRate of [44100, 48000]) {
          for (const a4 of [430, 450]) {
            const hz = frequency(midi, a4);
            for (let n = 0; n < samples.length; n++) samples[n] = 0.3 * Math.cos(TAU * hz * n / sampleRate);
            const [measured, clarity] = detector.findPitch(samples, sampleRate);
            assert.ok(Math.abs(1200 * Math.log2(measured / hz)) < 1, `${instrument.id}/${tuning.id}/${noteLabel(midi)}`);
            const tracker = new TargetTracker();
            for (let frame = 0; frame < 3; frame++) tracker.update(measured, clarity, 0.2, a4, tuning.notes);
            assert.equal(tracker.acquired, true);
            assert.equal(tracker.midi, midi);
          }
        }
      }
    }
  }
});

test('instrument tracking selects a detuned open string instead of a chromatic note', () => {
  const notes = getTuning('guitar', 'dropD')!.notes;
  const tracker = new TargetTracker();
  for (let i = 0; i < 3; i++) tracker.update(frequency(39.2), 1, 0.2, 440, notes);
  assert.equal(tracker.midi, 38);
  for (let i = 0; i < 10; i++) assert.equal(tracker.update(frequency(39.4), 1, 0.2, 440, notes), false);
  // F2 is too far from either D2 or A2 to infer an open string.
  const unrelated = new TargetTracker();
  for (let i = 0; i < 10; i++) unrelated.update(frequency(41), 1, 0.2, 440, notes);
  assert.equal(unrelated.acquired, false);
});

test('low B bass string supports stable signed phase measurement', () => {
  const target = frequency(23);
  for (const delta of [-0.03, 0.03]) {
    const dsp = new PhaseDemodulator(48000, target);
    let start = 0;
    for (let n = 0; n <= 48000 * 4; n++) {
      dsp.push(0.3 * Math.cos(TAU * (target + delta) * n / 48000));
      if (n === 48000 * 2) start = dsp.unwrapped;
    }
    assert.ok(dsp.reliable);
    assert.ok(Math.abs((dsp.unwrapped - start) / TAU / 2 - delta) < 0.001);
  }
});
