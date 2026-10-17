import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as dsp from '../src/audio/dsp.ts';
import * as tunings from '../src/tunings.ts';

function loadModule(file: string, dependencies: Record<string, unknown>, globals = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8').replaceAll('import.meta.url', "'file:///test/'");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const exports: any = {};
  runInNewContext(outputText, { exports, require: (id: string) => {
    assert.ok(id in dependencies, `Unexpected import: ${id}`);
    return dependencies[id];
  }, ...globals });
  return exports;
}

function loadSettings(saved: unknown) {
  return loadModule('../src/settings.ts', { './audio/dsp': dsp, './tunings': tunings }, {
    localStorage: { getItem: () => JSON.stringify(saved) },
  });
}

function createEngine() {
  const settings = loadSettings(null);
  const configs: any[] = [];
  let worker: any;
  class Worker {
    onmessage: any;
    constructor() { worker = this; }
    postMessage() {}
    terminate() {}
  }
  class AudioSession {
    node = { port: { postMessage: (data: any) => { if (data.type === 'config') configs.push(data); } } };
    async start(_url: string, onNode: any, onState: any) { onNode(this.node); onState('running'); }
    async stop() {}
  }
  const { TunerEngine } = loadModule('../src/audio/TunerEngine.ts', {
    './AudioSession': { AudioSession }, './dsp': dsp, '../settings': settings, '../tunings': tunings,
    './tuner-worklet.ts?worker&url': { default: 'worklet' },
  }, {
    URL, Worker, performance: { now: () => 100 }, document: { hidden: false },
    window: { isSecureContext: true, AudioContext: true, AudioWorkletNode: true },
    navigator: { mediaDevices: { getUserMedia: true } },
  });
  const engine = new TunerEngine();
  return {
    engine, defaults: settings.DEFAULT_SETTINGS,
    pitch(midi: number, frames = 8) {
      for (let i = 0; i < frames; i++) worker.onmessage({ data: {
        hz: dsp.frequency(midi), clarity: 1, rms: 0.2,
        revision: configs.at(-1).revision, buffer: new ArrayBuffer(16),
      } });
    },
  };
}

test('saved settings migrate safely and retain valid manual strings below C2', () => {
  assert.equal(loadSettings({ mode: 'auto', channel: 'left', midi: 45 }).loadSettings().instrument, 'chromatic');
  const saved = loadSettings({ instrument: 'bass5', tuning: 'standard', mode: 'manual', midi: 28 }).loadSettings();
  const { engine } = createEngine();
  engine.configure(saved);
  assert.equal(engine.snapshot(100).midi, 28);
  assert.equal(loadSettings({ instrument: 'guitar', tuning: 'missing', midi: 0 }).loadSettings().midi, 40);
  assert.equal(loadSettings({ instrument: 'missing' }).loadSettings().instrument, 'chromatic');
});

test('saved capo settings restore sounding pitches and safely handle older or invalid values', () => {
  const guitar = { instrument: 'guitar', tuning: 'standard', mode: 'manual', midi: 66, capo: 2 };
  const saved = loadSettings(guitar).loadSettings();
  assert.equal(saved.capo, 2);
  assert.equal(saved.midi, 66);
  const { engine } = createEngine();
  engine.configure(saved);
  assert.equal(engine.snapshot(100).midi, 66);
  assert.equal(loadSettings({ instrument: 'guitar', midi: 64 }).loadSettings().capo, 0);
  for (const [capo, expected] of [[-1, 0], [99, 12], [2.6, 3], ['2', 0], [null, 0]]) {
    assert.equal(loadSettings({ ...guitar, capo }).loadSettings().capo, expected);
  }
  const bass = loadSettings({ ...guitar, instrument: 'bass' }).loadSettings();
  assert.equal(bass.capo, 0);
  assert.equal(bass.midi, 28);
});

test('capo shifts automatic and manual targets, clears locks and restores open strings when removed', async () => {
  const { engine, defaults, pitch } = createEngine();
  const guitar = { ...defaults, instrument: 'guitar', tuning: 'standard', midi: 40 };
  engine.configure(guitar);
  await engine.start();
  pitch(64);
  engine.setLocked(true);

  const capo = { ...guitar, capo: 2, midi: 66 };
  engine.configure(capo);
  assert.equal(engine.snapshot(100).locked, false);
  assert.equal(engine.snapshot(100).canLock, false);
  assert.equal(engine.snapshot(100).measured, null);
  assert.equal(engine.snapshot(100).midi, 66);
  assert.equal(engine.snapshot(100).target, dsp.frequency(66));
  for (const midi of [42, 47, 52, 57, 61, 66]) {
    pitch(midi + 0.1);
    assert.equal(engine.snapshot(100).midi, midi);
    assert.ok(Math.abs(engine.snapshot(100).cents - 10) < 0.001);
  }
  engine.configure({ ...capo, mode: 'manual', midi: 47, a4: 442 });
  assert.equal(engine.snapshot(100).target, dsp.frequency(47, 442));
  pitch(66);
  assert.equal(engine.snapshot(100).midi, 47);

  engine.configure({ ...capo, tuning: 'dropD', midi: 40 });
  pitch(40);
  assert.equal(engine.snapshot(100).midi, 40);
  engine.configure({ ...guitar, capo: 12, midi: 52 });
  pitch(76);
  assert.equal(engine.snapshot(100).midi, 76);

  engine.configure(guitar);
  pitch(64);
  assert.equal(engine.snapshot(100).midi, 64);
  engine.configure({ ...defaults, instrument: 'bass', tuning: 'standard', midi: 28 });
  pitch(28);
  assert.equal(engine.snapshot(100).midi, 28);
  await engine.stop();
});

test('chromatic engine and saved manual targets retain pitches outside C2–B6', async () => {
  const { engine, defaults, pitch } = createEngine();
  engine.configure(defaults);
  await engine.start();
  for (const midi of [23, 35, 96, 108]) {
    pitch(midi);
    assert.equal(engine.snapshot(100).midi, midi);
    assert.ok(engine.snapshot(100).measured);
    engine.configure({ ...defaults, mode: 'manual', midi });
    assert.equal(engine.snapshot(100).midi, midi);
    assert.equal(loadSettings({ ...defaults, mode: 'manual', midi }).loadSettings().midi, midi);
    engine.configure(defaults);
  }
  await engine.stop();
});

test('engine auto-selects strings, locks, resets on tuning changes and supports manual selection', async () => {
  const { engine, defaults, pitch } = createEngine();
  const guitar = { ...defaults, instrument: 'guitar', tuning: 'standard', midi: 40 };
  engine.configure(guitar);
  await engine.start();
  pitch(45.8);
  assert.equal(engine.snapshot(100).midi, 45);
  assert.ok(engine.snapshot(100).canLock);
  engine.setLocked(true);
  pitch(50);
  assert.equal(engine.snapshot(100).midi, 45);
  assert.ok(engine.snapshot(100).locked);

  engine.configure({ ...guitar, tuning: 'dropD', midi: 38 });
  assert.equal(engine.snapshot(100).locked, false);
  assert.equal(engine.snapshot(100).canLock, false);
  pitch(39.2);
  assert.equal(engine.snapshot(100).midi, 38);

  engine.configure({ ...guitar, mode: 'manual', midi: 64 });
  pitch(45);
  assert.equal(engine.snapshot(100).midi, 64);
  assert.equal(engine.snapshot(100).canLock, false);

  engine.configure({ ...defaults, instrument: 'bass5', tuning: 'standard', midi: 23 });
  pitch(23);
  assert.equal(engine.snapshot(100).midi, 23);
  assert.ok(engine.snapshot(100).canLock);
  assert.ok(engine.snapshot(100).measured < 31);

  engine.configure(defaults);
  assert.equal(engine.snapshot(100).midi, 45);
  assert.equal(engine.snapshot(100).locked, false);
  pitch(61);
  assert.equal(engine.snapshot(100).midi, 61);
  await engine.stop();
});
