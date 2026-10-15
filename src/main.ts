import './style.css';
import workletUrl from './audio-worklet.ts?worker&url';
import { frequency, TargetTracker, wrap } from './dsp';
import { AudioSession } from './session';

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
<main><header><a class="brand" href="./">PHASE<span> / 01</span></a><span class="local">● 本地音频处理</span></header>
<section class="intro"><p class="eyebrow">REAL PHASE · STROBE TUNER</p><h1>让音准，慢下来。</h1><p>一次一根弦。观察相位，而非追逐指针。</p></section>
<section class="instrument" aria-label="相位频闪调音器"><div class="topline"><span id="modeBadge">自动识别</span><span id="sourceBadge">麦克风</span></div>
<div class="dial"><canvas aria-label="单环真实相位频闪，偏高顺时针，偏低逆时针"></canvas><div class="note"><span class="eyebrow">TARGET</span><strong id="note">A<span>2</span></strong><span id="quality">等待开始</span></div></div>
<p class="direction">↶ 偏低 <span>同频趋于静止</span> 偏高 ↷</p>
<div class="readings"><div><label>实测 / Hz</label><output id="measured">—</output></div><div><label>偏差 / cent</label><output id="cents">—</output></div><div><label>目标 / Hz</label><output id="target">110.00</output></div></div>
<p id="status" role="status" aria-live="polite">点击开始，允许使用麦克风</p>
<div class="actions"><button id="start" class="primary">开始调音</button><button id="stop" disabled>停止</button><button id="resume" hidden>恢复音频</button></div></section>
<section class="settings"><div class="section-label">调音设置 <span>E2 — E6</span></div><div class="grid">
<label>目标模式<select id="mode"><option value="auto">自动识别</option><option value="manual">手动选择</option></select></label>
<label>参考音高 A4 / Hz<input id="a4" type="number" min="430" max="450" step="0.1" value="440"></label>
<label>音名<select id="pitchClass" disabled></select></label><label>八度<select id="octave" disabled></select></label>
</div><button id="lock" class="wide" disabled>锁定当前目标音</button>
<details><summary>内部信号测试</summary><p>合成信号与参考共用采样时钟，仅验证算法，不代表麦克风测量精度。切换输入前请停止。</p><label>输入源<select id="source"><option value="mic">麦克风</option><option value="test">内部合成信号（静音输出）</option></select></label><div class="grid"><label>测试基准<select id="testNote"><option value="40">E2</option><option value="45" selected>A2</option><option value="69">A4</option><option value="88">E6</option></select></label><label>偏移 / Hz<input id="offset" type="number" min="-10" max="10" step="0.01" value="1"></label></div></details></section>
<footer>一个测量环 · 十二平均律 · 无录音、无上传<br>数字读数来自 Pitchy；条纹位置来自连续 I/Q 解调。</footer></main>`;
const el = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const mode = el<HTMLSelectElement>('mode'), a4 = el<HTMLInputElement>('a4');
const pc = el<HTMLSelectElement>('pitchClass'), octave = el<HTMLSelectElement>('octave');
const source = el<HTMLSelectElement>('source'), testNote = el<HTMLSelectElement>('testNote'), offset = el<HTMLInputElement>('offset');
const start = el<HTMLButtonElement>('start'), stop = el<HTMLButtonElement>('stop'), lock = el<HTMLButtonElement>('lock');
const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
pc.innerHTML = names.map((name, i) => `<option value="${i}">${name}</option>`).join('');
octave.innerHTML = [2,3,4,5,6].map(n => `<option>${n}</option>`).join('');
const session = new AudioSession(), tracker = new TargetTracker();
let worker: Worker | undefined;
let midi = 45, calibration = 440, locked = false, revision = 0, running = false;
let phase = 0, displayedPhase = 0, phaseGood = false, pitchGood = false, lastPhase = 0, lastPitch = 0;
let hz = 0, smoothedHz = 0;
function clearReading() {
  phaseGood = pitchGood = false; hz = smoothedHz = 0;
  el('measured').textContent = el('cents').textContent = '—';
}
function configure() {
  revision++; clearReading(); tracker.reset();
  const target = frequency(midi, calibration);
  session.node?.port.postMessage({ type: 'config', revision, target, test: source.value === 'test',
    testFrequency: frequency(Number(testNote.value), calibration) + Number(offset.value) });
  el('note').innerHTML = `${names[midi % 12]}<span>${Math.floor(midi / 12) - 1}</span>`;
  el('target').textContent = target.toFixed(2);
  el('modeBadge').textContent = locked ? '目标已锁定' : mode.value === 'auto' ? '自动识别' : '手动选择';
  pc.value = String(midi % 12); octave.value = String(Math.floor(midi / 12) - 1);
  pc.disabled = octave.disabled = mode.value !== 'manual' || locked;
  for (const option of Array.from(pc.options)) {
    const m = (Number(octave.value) + 1) * 12 + Number(option.value);
    option.disabled = m < 40 || m > 88;
  }
  lock.textContent = locked ? '解除目标锁定' : '锁定当前目标音';
  lock.disabled = !locked && mode.value === 'auto' && !tracker.acquired;
}
function stateChanged(state: string) {
  running = state === 'running'; clearReading();
  el('resume').hidden = state !== 'suspended' && state !== 'interrupted';
  el('status').textContent = running ? (source.value === 'test' ? '内部信号运行中 · 未使用麦克风' : '监听中 · 请弹奏单根弦') : state === 'ended' ? '麦克风音轨已结束，请重新开始' : '音频已暂停，请恢复';
  if (state === 'ended') { void shutdown(); el('status').textContent = '设备已断开，音轨结束'; }
  if (running) configure();
}
async function shutdown() {
  running = false; clearReading(); worker?.terminate(); worker = undefined;
  const closing = session.stop();
  start.disabled = false; stop.disabled = true; source.disabled = false;
  el('resume').hidden = true; el('quality').textContent = '已停止';
  await closing;
}
start.onclick = async () => {
  start.disabled = true; stop.disabled = false; source.disabled = true;
  el('status').textContent = source.value === 'mic' ? '等待麦克风授权…' : '正在启动内部信号…';
  try {
    if (!window.isSecureContext || !window.AudioWorkletNode || (source.value === 'mic' && !navigator.mediaDevices))
      throw new Error('需要支持 AudioWorklet 的浏览器，并通过 HTTPS 或 localhost 打开');
    tracker.acquired = false; tracker.reset();
    worker = new Worker(new URL('./pitch-worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      session.node?.port.postMessage({ type: 'buffer', buffer: data.buffer }, [data.buffer]);
      if (data.revision !== revision || !running) return;
      lastPitch = performance.now();
      const floatingMidi = 69 + 12 * Math.log2(data.hz / calibration);
      pitchGood = data.clarity >= .9 && data.rms > .002 && floatingMidi >= 39.4 && floatingMidi <= 88.6;
      if (!pitchGood) { tracker.reset(); clearReading(); return; }
      if (mode.value === 'auto' && !locked && tracker.update(data.hz, data.clarity, data.rms, calibration)) {
        midi = tracker.midi; configure(); return;
      }
      hz = data.hz;
      smoothedHz = smoothedHz ? .6 * smoothedHz + .4 * hz : hz;
    };
    await session.start(source.value === 'test', workletUrl, node => {
      node.onprocessorerror = () => { void shutdown(); el('status').textContent = '音频处理失败，请重新开始'; };
      node.port.onmessage = ({ data }) => {
        if (data.type === 'pitch') worker?.postMessage(data, [data.buffer]);
        if (data.type === 'phase' && data.revision === revision) {
          phase = data.phase; phaseGood = data.reliable; lastPhase = performance.now();
          if (data.rms < .002) clearReading();
        }
      };
      configure();
    }, stateChanged);
    el('sourceBadge').textContent = source.value === 'test' ? '内部合成信号 · 非麦克风' : '麦克风';
  } catch (error) {
    await shutdown();
    const e = error as Error;
    el('status').textContent = e.name === 'NotAllowedError' ? '麦克风权限被拒绝，请在浏览器设置中允许后重试' :
      ['NotFoundError','NotReadableError'].includes(e.name) ? '麦克风设备不可用或被占用' : e.message;
  }
};
stop.onclick = () => { void shutdown(); el('status').textContent = '已停止 · 麦克风资源已释放'; };
el('resume').onclick = () => { void session.context?.resume().catch(() => { el('status').textContent = '恢复失败，请停止后重新启动'; }); };
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearReading();
  else if (session.context) {
    stateChanged(session.context.state);
    if (session.context.state !== 'running') void session.context.resume().catch(() => {});
  }
});
window.addEventListener('pagehide', () => { void shutdown(); });
mode.onchange = () => { locked = false; tracker.acquired = false; configure(); };
lock.onclick = () => { locked = !locked; configure(); };
function manual() {
  midi = Math.max(40, Math.min(88, (Number(octave.value) + 1) * 12 + Number(pc.value)));
  configure();
}
pc.onchange = octave.onchange = manual;
a4.onchange = () => {
  calibration = Math.round(Math.max(430, Math.min(450, Number(a4.value) || 440)) * 10) / 10;
  a4.value = calibration.toFixed(1); configure();
};
testNote.onchange = offset.onchange = () => {
  offset.value = String(Math.max(-10, Math.min(10, Number(offset.value) || 0))); configure();
};
configure();
const canvas = document.querySelector('canvas')!, ctx = canvas.getContext('2d')!;
let opacity = 0;
function draw(now: number) {
  const fresh = running && now - lastPitch < 350 && now - lastPhase < 150 && !document.hidden;
  const selected = mode.value === 'manual' || locked || tracker.acquired;
  const target = frequency(midi, calibration);
  const inBand = Math.abs(hz - target) <= Math.min(30, target * .12) * .65;
  const valid = fresh && selected && pitchGood && phaseGood && inBand;
  // Only interpolate toward a measured phase. Never integrate frequency/cents.
  displayedPhase += .65 * wrap(phase - displayedPhase);
  opacity += ((valid ? 1 : 0) - opacity) * .22;
  if (!valid && opacity < .01) opacity = 0;
  const rect = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
  const size = Math.round(rect.width * dpr);
  if (canvas.width !== size) { canvas.width = canvas.height = size; }
  ctx.setTransform(size / 400, 0, 0, size / 400, 0, 0); ctx.clearRect(0, 0, 400, 400);
  ctx.translate(200, 200);
  ctx.strokeStyle = '#26332f'; ctx.lineWidth = 1;
  for (const r of [141, 181]) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  for (let k = 0; k < 60; k++) {
    const a = k / 60 * Math.PI * 2;
    ctx.beginPath(); ctx.moveTo(Math.cos(a)*188,Math.sin(a)*188);
    ctx.lineTo(Math.cos(a)*(k%5 ? 191 : 196),Math.sin(a)*(k%5 ? 191 : 196)); ctx.stroke();
  }
  ctx.globalAlpha = opacity; ctx.strokeStyle = '#b9f5ac'; ctx.lineWidth = 24;
  // 12 sectors: one demodulated cycle = one sector pitch (30 degrees).
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6 + displayedPhase / 12;
    ctx.beginPath(); ctx.arc(0, 0, 161, a, a + .24); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (fresh && pitchGood && selected) {
    el('measured').textContent = smoothedHz.toFixed(2);
    const cents = 1200 * Math.log2(smoothedHz / target);
    el('cents').textContent = `${cents >= 0 ? '+' : ''}${cents.toFixed(1)}`;
  } else el('measured').textContent = el('cents').textContent = '—';
  el('quality').textContent = !running ? (session.context ? '音频暂停' : '等待开始') : valid ? '相位追踪中' :
    fresh && pitchGood && selected && !inBand ? '频差过大 · 请靠近目标' : '无可靠相位 / 稳定中';
  requestAnimationFrame(draw);
}
requestAnimationFrame(draw);
