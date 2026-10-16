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
      for (const radius of [140, 180]) {
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
      context.strokeStyle = '#f1f3f5';
      context.lineWidth = 25;
      context.beginPath();
      context.arc(0, 0, 160, 0, TAU);
      context.stroke();
      context.globalAlpha = opacity;
      context.strokeStyle = '#228be6';
      for (let sector = 0; sector < 12; sector++) {
        const angle = sector * TAU / 12 + displayedPhase / 12;
        context.beginPath();
        context.arc(0, 0, 160, angle, angle + 0.24);
        context.stroke();
      }
      context.globalAlpha = 1;
      frameId = requestAnimationFrame(draw);
    };
    frameId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frameId);
  }, [engine]);

  return <canvas ref={canvasRef} className="strobe-canvas" role="img" aria-label={t('tuner.dial')} />;
}
