import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, NumberInput, SegmentedControl, Slider } from '@mantine/core';
import { IconLock, IconLockOpen, IconRestore } from '@tabler/icons-react';
import { clampMidi, MAX_MIDI, MIN_MIDI, NOTE_NAMES } from './audio/dsp';
import type { TunerEngine, TunerSnapshot } from './audio/TunerEngine';
import { clampA4, DEFAULT_SETTINGS, MAX_A4, MIN_A4, type Settings } from './settings';

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const MIN_OCTAVE = Math.floor(MIN_MIDI / 12) - 1;
const MAX_OCTAVE = Math.floor(MAX_MIDI / 12) - 1;
const NOTE_RANGE = `${NOTE_NAMES[MIN_MIDI % 12]}${MIN_OCTAVE}–${NOTE_NAMES[MAX_MIDI % 12]}${MAX_OCTAVE}`;
const OCTAVE_MARKS = Array.from({ length: MAX_OCTAVE - MIN_OCTAVE + 1 }, (_, index) => ({
  value: MIN_OCTAVE + index, label: String(MIN_OCTAVE + index),
}));

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
            { value: 'auto', label: <span className="mode-option">{t('settings.auto')}<span className="mode-range">{NOTE_RANGE}</span></span> },
            { value: 'manual', label: t('settings.manual') },
          ]}
          onChange={(mode) => update({ mode: mode === 'manual' ? 'manual' : 'auto', midi: snapshot.midi })}
        />

        <div className="note-controls">
          <div className="field-label" id="pitch-class-label">{t('settings.pitchClass')}</div>
          <div className="piano-keyboard" role="group" aria-labelledby="pitch-class-label" aria-disabled={!manual}>
            {NOTE_NAMES.map((name, pitchClass) => {
              const midi = (octave + 1) * 12 + pitchClass;
              const black = !WHITE_KEYS.includes(pitchClass);
              const whiteBefore = WHITE_KEYS.filter((key) => key < pitchClass).length;
              return (
                <button
                  key={pitchClass}
                  type="button"
                  className={`piano-key ${black ? 'piano-key--black' : 'piano-key--white'}`}
                  style={black ? { left: `${whiteBefore / 7 * 100}%` } : { gridColumn: whiteBefore + 1 }}
                  aria-label={`${name}${octave}`}
                  aria-pressed={snapshot.midi === midi}
                  data-active={snapshot.midi === midi || undefined}
                  disabled={!manual || midi < MIN_MIDI || midi > MAX_MIDI}
                  onClick={() => update({ midi })}
                >{name}</button>
              );
            })}
          </div>
          <div className="octave-control">
            <div className="field-label">{t('settings.octave')}</div>
            <div className="octave-slider">
              <Slider
                thumbLabel={t('settings.octave')}
                disabled={!manual}
                attributes={{ thumb: { 'aria-disabled': !manual, tabIndex: manual ? 0 : -1 } }}
                styles={{ thumb: { display: 'flex', cursor: manual ? 'pointer' : 'default' } }}
                value={octave}
                min={MIN_OCTAVE}
                max={MAX_OCTAVE}
                step={1}
                marks={OCTAVE_MARKS}
                restrictToMarks
                label={null}
                size={5}
                thumbSize={18}
                onChange={(value) => update({ midi: clampMidi((value + 1) * 12 + snapshot.midi % 12) })}
              />
            </div>
          </div>
        </div>
        {!manual && (
          <Button
            className="lock-button"
            fullWidth
            variant={snapshot.locked ? 'light' : 'default'}
            leftSection={snapshot.locked ? <IconLockOpen size={16} /> : <IconLock size={16} />}
            disabled={!snapshot.locked && !snapshot.canLock}
            aria-pressed={snapshot.locked}
            onClick={() => engine.setLocked(!snapshot.locked)}
          >{t(snapshot.locked ? 'settings.unlock' : 'settings.lock')}</Button>
        )}
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
            clampBehavior="blur"
            step={0.1}
            decimalScale={1}
            allowNegative={false}
            hideControls
            className="calibration-input"
          />
        </div>
        <div className="calibration-presets" role="group" aria-label={t('settings.presets')}>
          {[432, 440, 442].map((a4) => <Button key={a4} variant={settings.a4 === a4 ? 'filled' : 'default'} size="sm" aria-label={t('settings.setA4', { value: a4 })} aria-pressed={settings.a4 === a4} onClick={() => update({ a4 })}>{a4} Hz</Button>)}
        </div>
      </div>
    </section>
  );
}
