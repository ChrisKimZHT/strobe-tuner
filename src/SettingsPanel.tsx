import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NumberInput, SegmentedControl, Select, Slider } from '@mantine/core';
import { IconLock, IconLockOpen, IconRestore } from '@tabler/icons-react';
import { clampMidi, MAX_MIDI, MIN_MIDI, NOTE_NAMES } from './audio/dsp';
import type { TunerEngine, TunerSnapshot } from './audio/TunerEngine';
import { clampA4, DEFAULT_SETTINGS, MAX_A4, MIN_A4, type Settings } from './settings';

type Props = {
  settings: Settings;
  snapshot: TunerSnapshot;
  update: (patch: Partial<Settings>) => void;
  engine: TunerEngine;
};

export function SettingsPanel({ settings, snapshot, update, engine }: Props) {
  const { t } = useTranslation();
  const [a4Draft, setA4Draft] = useState<string | number>(settings.a4);
  const octave = Math.floor(snapshot.midi / 12) - 1;
  const manual = settings.mode === 'manual';

  useEffect(() => setA4Draft(settings.a4), [settings.a4]);

  const commitA4 = () => {
    const value = typeof a4Draft === 'number' && Number.isFinite(a4Draft) ? clampA4(a4Draft) : settings.a4;
    setA4Draft(value);
    update({ a4: value });
  };

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <h2 id="settings-title">{t('settings.title')}</h2>
        <Button variant="subtle" size="compact-xs" color="gray" leftSection={<IconRestore size={13} />} onClick={() => {
          engine.setLocked(false);
          update({ ...DEFAULT_SETTINGS });
        }}>{t('settings.reset')}</Button>
      </div>

      <div className="settings-section target-settings">
        <div className="field-label" id="mode-label">{t('settings.mode')}</div>
        <SegmentedControl
          fullWidth
          size="sm"
          value={settings.mode}
          aria-labelledby="mode-label"
          data={[
            { value: 'auto', label: <span className="mode-option">{t('settings.auto')}<span className="mode-range">E2–E6</span></span> },
            { value: 'manual', label: t('settings.manual') },
          ]}
          onChange={(mode) => update({ mode: mode === 'manual' ? 'manual' : 'auto', midi: snapshot.midi })}
        />

        <div className="note-selectors">
          <Select
            label={t('settings.pitchClass')}
            value={String(snapshot.midi % 12)}
            disabled={!manual}
            allowDeselect={false}
            data={NOTE_NAMES.map((label, pitchClass) => {
              const midi = (octave + 1) * 12 + pitchClass;
              return { value: String(pitchClass), label, disabled: midi < MIN_MIDI || midi > MAX_MIDI };
            })}
            onChange={(value) => { if (value !== null) update({ midi: clampMidi((octave + 1) * 12 + Number(value)) }); }}
          />
          <Select
            label={t('settings.octave')}
            value={String(octave)}
            disabled={!manual}
            allowDeselect={false}
            data={['2', '3', '4', '5', '6']}
            onChange={(value) => { if (value !== null) update({ midi: clampMidi((Number(value) + 1) * 12 + snapshot.midi % 12) }); }}
          />
        </div>
        <Button
          className="lock-button"
          fullWidth
          variant={snapshot.locked ? 'light' : 'default'}
          leftSection={snapshot.locked ? <IconLockOpen size={16} /> : <IconLock size={16} />}
          disabled={manual || (!snapshot.locked && !snapshot.canLock)}
          aria-pressed={snapshot.locked}
          onClick={() => engine.setLocked(!snapshot.locked)}
        >{t(snapshot.locked ? 'settings.unlock' : 'settings.lock')}</Button>
      </div>

      <div className="settings-section calibration-settings">
        <div className="calibration-heading">
          <h3>{t('settings.calibration')}</h3>
          <NumberInput
            aria-label={t('settings.a4')}
            leftSection={<span className="a4-label">A4</span>}
            rightSection={<span className="hz-label">Hz</span>}
            value={a4Draft}
            onChange={(value) => {
              setA4Draft(value);
              if (typeof value === 'number' && value >= MIN_A4 && value <= MAX_A4) update({ a4: clampA4(value) });
            }}
            onBlur={commitA4}
            onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
            min={MIN_A4}
            max={MAX_A4}
            step={0.1}
            decimalScale={1}
            allowNegative={false}
            hideControls
            className="calibration-input"
          />
        </div>
        <div className="calibration-slider">
          <Slider thumbLabel={t('settings.calibrationSlider')} value={settings.a4} onChange={(a4) => update({ a4: clampA4(a4) })} min={MIN_A4} max={MAX_A4} step={0.1} label={(value) => `${value.toFixed(1)} Hz`} size={5} thumbSize={18} />
          <div className="range-labels"><span>{MIN_A4} Hz</span><span>{MAX_A4} Hz</span></div>
        </div>
        <div className="calibration-presets" role="group" aria-label={t('settings.presets')}>
          {[432, 440, 442].map((a4) => <Button key={a4} variant={settings.a4 === a4 ? 'filled' : 'default'} size="sm" aria-label={t('settings.setA4', { value: a4 })} aria-pressed={settings.a4 === a4} onClick={() => update({ a4 })}>{a4} Hz</Button>)}
        </div>
      </div>
    </section>
  );
}
