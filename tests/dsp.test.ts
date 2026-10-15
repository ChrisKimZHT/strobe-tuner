import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PitchDetector } from 'pitchy';
import { PhaseDemodulator, frequency, TargetTracker, TAU } from '../src/dsp.ts';

function measure(target: number, delta: number, sr = 48000, harmonics = false) {
  const dsp = new PhaseDemodulator(sr, target);
  let start = 0, end = 0;
  for (let n = 0; n <= sr * 4; n++) {
    const p = TAU * (target + delta) * n / sr;
    dsp.push(harmonics ? .05 * Math.cos(p) + .3 * Math.cos(2*p) + .4 * Math.cos(3*p) : .3 * Math.cos(p));
    if (n === sr) start = dsp.unwrapped;
    if (n === sr * 4) end = dsp.unwrapped;
  }
  return { drift: (end - start) / TAU / 3, dsp };
}
for (const sr of [44100, 48000]) {
  for (const midi of [40, 45, 69, 88]) {
    const target = frequency(midi);
    for (const delta of [0, -1, 1, target * (2 ** (-1/1200) - 1), target * (2 ** (1/1200) - 1)]) {
      test(`phase ${sr}Hz MIDI ${midi}, delta ${delta.toFixed(6)}Hz`, () => {
        const { drift, dsp } = measure(target, delta, sr);
        console.log(`target=${target.toFixed(5)} delta=${delta.toFixed(7)} measured=${drift.toFixed(7)} cycles/s`);
        assert.ok(Math.abs(drift - delta) < .0002, `${drift} vs ${delta}`);
        assert.ok(dsp.reliable);
        if (delta) assert.equal(Math.sign(drift), Math.sign(delta));
      });
    }
  }
}
test('strong harmonics: same DSP phase and actual Pitchy fundamental', () => {
  const detector = PitchDetector.forFloat32Array(4096);
  for (const midi of [40,45,69]) {
    const f = frequency(midi), samples = new Float32Array(4096);
    for (let n=0;n<samples.length;n++) {
      const p=TAU*(f+1)*n/48000;
      samples[n]=.05*Math.cos(p)+.3*Math.cos(2*p)+.4*Math.cos(3*p);
    }
    const [hz,clarity]=detector.findPitch(samples,48000);
    const {drift,dsp}=measure(f,1,48000,true);
    console.log(`harmonics MIDI=${midi} pitch=${hz.toFixed(5)} clarity=${clarity.toFixed(5)} drift=${drift.toFixed(7)} valid=${dsp.reliable}`);
    assert.ok(Math.abs(hz-(f+1))<.1); assert.ok(clarity>.9);
    assert.ok(Math.abs(drift-1)<.002); assert.ok(dsp.reliable);
  }
});
test('silence, weak signal, decay, target reset', () => {
  const dsp = new PhaseDemodulator(48000,110);
  for(let n=0;n<48000;n++) dsp.push(0);
  assert.equal(dsp.reliable,false);
  for(let n=0;n<48000;n++) dsp.push(.0001*Math.cos(TAU*110*n/48000));
  assert.equal(dsp.reliable,false);
  for(let n=0;n<48000;n++) dsp.push(.2*Math.cos(TAU*110*n/48000));
  assert.equal(dsp.reliable,true);
  for(let n=0;n<48000*3;n++) dsp.push(.2*Math.exp(-n/12000)*Math.cos(TAU*110*n/48000));
  assert.equal(dsp.reliable,false);
  dsp.setTarget(220); assert.equal(dsp.settled,false); assert.equal(dsp.reliable,false);
  for(let n=0;n<48000;n++) dsp.push(.2*Math.cos(TAU*220*n/48000));
  assert.equal(dsp.reliable,true);
});
test('seeded noise is rejected by identification gate', () => {
  let seed = 123456;
  const tracker = new TargetTracker(), detector=PitchDetector.forFloat32Array(4096);
  const samples=new Float32Array(4096);
  for(let frame=0;frame<30;frame++) {
    for(let n=0;n<samples.length;n++) { seed=(Math.imul(seed,1664525)+1013904223)>>>0; samples[n]=(seed/2**32-.5)*.3; }
    const [hz,clarity]=detector.findPitch(samples,48000);
    assert.equal(tracker.update(hz,clarity,.1,440),false);
  }
  assert.equal(tracker.acquired,false);
});
test('absent fundamental does not masquerade as a trustworthy phase', () => {
  const dsp = new PhaseDemodulator(48000, frequency(40));
  for(let n=0;n<96000;n++) {
    const p=TAU*frequency(40)*n/48000;
    dsp.push(.3*Math.cos(2*p)+.4*Math.cos(3*p));
  }
  assert.equal(dsp.reliable,false);
});
test('phase wraps; arbitrary block partition does not change state', () => {
  function run(blocks:number[]) {
    const dsp=new PhaseDemodulator(48000,110); let n=0,k=0, wraps=0, previous=0;
    while(n<96000) {
      const end=Math.min(96000,n+blocks[k++%blocks.length]);
      for(;n<end;n++) { dsp.push(.3*Math.cos(TAU*111*n/48000)); if(dsp.phase-previous < -Math.PI)wraps++; previous=dsp.phase; }
    }
    return {phase:dsp.phase,unwrapped:dsp.unwrapped,wraps};
  }
  assert.deepEqual(run([128]),run([1,17,256,63,1024]));
  assert.ok(run([128]).wraps>=1);
});
test('target stability, hysteresis, octave persistence, A4 and boundary margin', () => {
  const t=new TargetTracker();
  assert.equal(t.update(110,1,.1,440),false); assert.equal(t.update(110,1,.1,440),false);
  assert.equal(t.update(110,1,.1,440),true); assert.equal(t.midi,45);
  for(let n=0;n<10;n++) assert.equal(t.update(frequency(45.6),1,.1,440),false);
  for(let n=0;n<5;n++) assert.equal(t.update(220,1,.1,440),false);
  assert.equal(t.update(220,1,.1,440),true); assert.equal(t.midi,57);
  assert.equal(t.update(220,.1,.1,440),false);
  for(const [m,a] of [[39.5,430],[88.5,450]]) {
    const b=new TargetTracker(); for(let n=0;n<3;n++) b.update(frequency(m,a),1,.1,a);
    assert.equal(b.midi,Math.max(40,Math.min(88,Math.round(m))));
  }
});
