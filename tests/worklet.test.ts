import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { PhaseDemodulator } from '../src/audio/dsp.ts';

// Exercise the actual processor without depending on a browser audio device.
function createProcessor() {
  let Processor: any;
  const messages: any[] = [];
  const source = readFileSync(new URL('../src/audio/tuner-worklet.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  runInNewContext(outputText, {
    exports: {}, sampleRate: 48000,
    require: () => ({ PhaseDemodulator }),
    AudioWorkletProcessor: class {
      port = { onmessage: undefined, postMessage: (message: unknown) => messages.push(message) };
    },
    registerProcessor: (_name: string, constructor: any) => { Processor = constructor; },
  });
  const processor = new Processor();
  const configure = (target = 440, revision = 1) => processor.port.onmessage({
    data: { type: 'config', target, revision },
  });
  const process = (channels: number[], blocks = 32) => {
    const input = channels.map((value) => new Float32Array(128).fill(value));
    for (let i = 0; i < blocks; i++) {
      const output = new Float32Array(128).fill(1);
      assert.equal(processor.process([input], [[output]]), true);
      assert.ok(output.every((value) => value === 0), 'input must never play through speakers');
    }
    return messages.filter((message) => message.type === 'pitch');
  };
  return { configure, process };
}

test('processor averages stereo input by default', () => {
  const processor = createProcessor();
  const frames = processor.process([0.25, 0.75]);
  assert.equal(frames.length, 1);
  assert.ok(new Float32Array(frames[0].buffer).every((value) => value === 0.5));
});

test('mono input keeps its amplitude and disconnected input stays silent', () => {
  for (const input of [[0.25], []]) {
    const processor = createProcessor();
    processor.configure();
    const [frame] = processor.process(input);
    assert.ok(new Float32Array(frame.buffer).every((value) => value === (input[0] ?? 0)));
  }
});

test('changing target discards the partial frame from the previous configuration', () => {
  const processor = createProcessor();
  processor.configure();
  assert.equal(processor.process([0.25, 0.75], 16).length, 0);
  processor.configure(442, 2);
  const [frame] = processor.process([0.5, 1]);
  assert.equal(frame.revision, 2);
  assert.ok(new Float32Array(frame.buffer).every((value) => value === 0.75));
});
