import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { TAU, wrap } from './audio/dsp';
import type { TunerEngine } from './audio/TunerEngine';

export function StrobeDial({ engine }: { engine: TunerEngine }) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const context = canvas.getContext('2d');
    if (!context) return;
    let frameId = 0;
    let displayedPhase = 0;
    let opacity = 0;
    let revision = -1;
    let previousTime = 0;

    const draw = (now: number) => {
      const frame = engine.snapshot(now);
      const elapsed = Math.min(50, previousTime ? now - previousTime : 16.67);
      previousTime = now;
      if (revision !== frame.revision) {
        revision = frame.revision;
        displayedPhase = frame.phase;
        opacity = 0;
      }
      // Interpolate measured phase only. Never integrate pitch or cents into motion.
      displayedPhase += (1 - Math.pow(0.35, elapsed / 16.67)) * wrap(frame.phase - displayedPhase);
      opacity += ((frame.valid ? 1 : 0) - opacity) * (1 - Math.pow(0.78, elapsed / 16.67));

      const size = Math.round(canvas.getBoundingClientRect().width * Math.min(window.devicePixelRatio || 1, 2));
      if (canvas.width !== size) canvas.width = canvas.height = size;
      context.setTransform(size / 400, 0, 0, size / 400, 0, 0);
      context.clearRect(0, 0, 400, 400);
      context.translate(200, 200);
      context.strokeStyle = '#e9ecef';
      context.lineWidth = 1;
      for (const radius of [136, 182]) {
        context.beginPath();
        context.arc(0, 0, radius, 0, TAU);
        context.stroke();
      }
      for (let tick = 0; tick < 60; tick++) {
        const angle = tick / 60 * TAU;
        const outer = tick % 5 ? 190 : 195;
        context.strokeStyle = tick % 5 ? '#dee2e6' : '#adb5bd';
        context.beginPath();
        context.moveTo(Math.cos(angle) * 186, Math.sin(angle) * 186);
        context.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        context.stroke();
      }
      const rotation = displayedPhase / 12;
      context.strokeStyle = '#f1f3f5';
      context.lineWidth = 44;
      context.beginPath();
      context.arc(0, 0, 159, 0, TAU);
      context.stroke();

      context.globalAlpha = opacity;
      context.fillStyle = '#228be6';
      context.beginPath();
      // Trace connected inner/outer blocks as one silhouette, so there is no
      // shared antialiased edge at radius 159. All blocks are filled together.
      const quarter = TAU / 24;
      for (let sector = 0; sector < 6; sector++) {
        const start = sector * TAU / 6 + rotation;
        const step = start + quarter;
        const middle = start + 2 * quarter;
        const end = start + 3 * quarter;

        context.moveTo(Math.cos(start) * 181, Math.sin(start) * 181);
        context.arc(0, 0, 181, start, step);
        context.lineTo(Math.cos(step) * 159, Math.sin(step) * 159);
        context.arc(0, 0, 159, step, middle);
        context.lineTo(Math.cos(middle) * 137, Math.sin(middle) * 137);
        context.arc(0, 0, 137, middle, start, true);
        context.closePath();

        context.moveTo(Math.cos(middle) * 181, Math.sin(middle) * 181);
        context.arc(0, 0, 181, middle, end);
        context.lineTo(Math.cos(end) * 159, Math.sin(end) * 159);
        context.arc(0, 0, 159, end, middle, true);
        context.closePath();
      }
      context.fill();
      context.globalAlpha = 1;
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [engine]);

  return <canvas ref={canvasRef} className="strobe-canvas" role="img" aria-label={t('tuner.dial')} />;
}
