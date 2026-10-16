import { useEffect, useState } from 'react';
import { TunerEngine } from './audio/TunerEngine';
import type { Settings } from './settings';

export function useTuner(settings: Settings) {
  const [engine] = useState(() => new TunerEngine());
  const [snapshot, setSnapshot] = useState(() => engine.snapshot());

  useEffect(() => {
    engine.onChange = () => setSnapshot(engine.snapshot());
    const debugTone = (hz?: number) => engine.setDebugTone(hz);
    window.debugTone = debugTone;
    // Numeric readings need much less frequent updates than the phase animation.
    const timer = window.setInterval(() => {
      const frame = engine.snapshot();
      if (frame.status === 'running') setSnapshot(frame);
    }, 100);
    const onVisibility = () => engine.handleVisibility();
    const onPageHide = () => { void engine.stop(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      if (window.debugTone === debugTone) delete window.debugTone;
      engine.onChange = undefined;
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      void engine.stop();
    };
  }, [engine]);

  useEffect(() => engine.configure(settings), [engine, settings]);

  useEffect(() => { void engine.start(); }, [engine]);

  return { engine, snapshot };
}
