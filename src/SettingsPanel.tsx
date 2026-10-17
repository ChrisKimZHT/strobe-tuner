import { useTranslation } from 'react-i18next';
import { ActionIcon, Button, NativeSelect, SegmentedControl, Slider } from '@mantine/core';
import { IconLock, IconLockOpen, IconMinus, IconPlus } from '@tabler/icons-react';
import { normalizeMidi, pitchClass, NOTE_NAMES } from './audio/dsp';
import type { TunerEngine, TunerSnapshot } from './audio/TunerEngine';
import { clampA4, DEFAULT_SETTINGS, MAX_A4, MIN_A4, type Settings } from './settings';
import { getInstrument, getTuning, INSTRUMENTS, noteLabel } from './tunings';

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];

type Props = {
  settings: Settings;
  snapshot: TunerSnapshot;
  update: (patch: Partial<Settings>) => void;
  engine: TunerEngine;
};

export function SettingsPanel({ settings, snapshot, update, engine }: Props) {
  const { t } = useTranslation();
  const octave = Math.floor(snapshot.midi / 12) - 1;
  const noteName = NOTE_NAMES[pitchClass(snapshot.midi)];
  // A practical manual viewport, expanded to include any automatically acquired note.
  const minOctave = Math.min(0, octave);
  const maxOctave = Math.max(8, octave);
  const octaveMarks = Array.from({ length: maxOctave - minOctave + 1 }, (_, index) => {
    const value = minOctave + index;
    return { value, label: <>{noteName}<sub>{value}</sub></> };
  });
  const manual = settings.mode === 'manual';
  const instrument = getInstrument(settings.instrument);
  const tuning = getTuning(settings.instrument, settings.tuning);
  const strings = tuning?.notes.map((midi, index) => ({ midi, number: tuning.notes.length - index }))
    .sort((a, b) => a.midi - b.midi);

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <h2 id="settings-title">{t('settings.title')}</h2>
        <Button variant="subtle" size="compact-xs" color="gray" onClick={() => {
          engine.setLocked(false);
          update({ ...DEFAULT_SETTINGS });
        }}>{t('settings.reset')}</Button>
      </div>

      <div className="instrument-settings">
        <NativeSelect
          label={t('settings.instrument')}
          value={settings.instrument}
          data={['chromatic', ...INSTRUMENTS.map(({ id }) => id)].map((id) => ({ value: id, label: t(`instruments.${id}`, { defaultValue: id }) }))}
          onChange={(event) => {
            const id = event.currentTarget.value;
            const preset = getInstrument(id)?.tunings[0];
            update({ instrument: id, tuning: preset?.id ?? '', midi: preset?.notes[0] ?? normalizeMidi(snapshot.midi) });
          }}
        />
        <NativeSelect
          label={t('settings.tuning')}
          value={tuning?.id ?? ''}
          disabled={!instrument}
          data={instrument ? instrument.tunings.map((preset, index) => ({
            value: preset.id,
            label: `${t(`tunings.${preset.id}`, { defaultValue: preset.id })}${index === 0 ? ` · ${t('settings.default')}` : ''}`,
          })) : [{ value: '', label: t('settings.notApplicable') }]}
          onChange={(event) => {
            const preset = getTuning(settings.instrument, event.currentTarget.value)!;
            update({ tuning: preset.id, midi: preset.notes[0] });
          }}
        />
      </div>

      <div className="settings-section target-settings">
        <h3 className="pitch-selection-title">{t(tuning ? 'settings.stringSelection' : 'settings.pitchSelection')}</h3>
        <div className="target-actions">
          <SegmentedControl
            className="mode-switch"
            classNames={{ label: 'mode-switch-label', indicator: 'mode-switch-indicator' }}
            fullWidth
            size="xs"
            value={settings.mode}
            aria-label={t('settings.mode')}
            data={[
              { value: 'auto', label: <span className="mode-option">{t('settings.autoShort')}{tuning && <span className="mode-range">{t('settings.stringCount', { count: tuning.notes.length })}</span>}</span> },
              { value: 'manual', label: t('settings.manualShort') },
            ]}
            onChange={(mode) => update({ mode: mode === 'manual' ? 'manual' : 'auto', midi: tuning && !tuning.notes.includes(snapshot.midi) ? tuning.notes[0] : snapshot.midi })}
          />
          <ActionIcon
            size={38}
            radius="md"
            variant={snapshot.locked ? 'light' : 'default'}
            disabled={manual || (!snapshot.locked && !snapshot.canLock)}
            aria-label={t(snapshot.locked ? 'settings.unlock' : 'settings.lock')}
            title={t(snapshot.locked ? 'settings.unlock' : 'settings.lock')}
            aria-pressed={snapshot.locked}
            onClick={() => engine.setLocked(!snapshot.locked)}
          >{snapshot.locked ? <IconLockOpen size={18} /> : <IconLock size={18} />}</ActionIcon>
        </div>

        <div className="note-controls">
          {strings ? (
            <div className="string-controls" role="group" aria-label={t('settings.stringSelection')}>
              {strings.map(({ midi, number }, index) => (
                <button
                  type="button"
                  className="string-choice"
                  key={number}
                  disabled={!manual}
                  aria-label={t('settings.stringNote', { number, note: noteLabel(midi) })}
                  aria-pressed={snapshot.midi === midi}
                  data-active={snapshot.midi === midi || undefined}
                  onClick={() => update({ midi })}
                >
                  <span className="string-number">{t('settings.stringNumber', { number })}</span>
                  <span className="string-line" aria-hidden="true" style={{ height: `${1 + (strings.length - index - 1) * 0.6}px` }} />
                  <span className="string-note">{noteLabel(midi)}</span>
                </button>
              ))}
            </div>
          ) : <>
          <div className="piano-keyboard" role="group" aria-label={t('settings.pitchClass')} aria-disabled={!manual}>
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
                  disabled={!manual}
                  onClick={() => update({ midi })}
                >{name}</button>
              );
            })}
          </div>
          <div className="octave-control">
            <div className="octave-slider">
              <Slider
                thumbLabel={t('settings.octave')}
                disabled={!manual}
                attributes={{ thumb: { 'aria-disabled': !manual, 'aria-valuetext': `${noteName}${octave}`, tabIndex: manual ? 0 : -1 } }}
                classNames={{
                  root: 'pill-slider-root',
                  track: 'pill-slider-track',
                  bar: 'pill-slider-bar',
                  thumb: 'pill-slider-thumb',
                  markWrapper: 'octave-slider-mark-wrapper',
                  mark: 'octave-slider-mark',
                  markLabel: 'octave-slider-mark-label',
                }}
                styles={{ thumb: { display: 'flex', cursor: manual ? 'pointer' : 'default' } }}
                value={octave}
                min={minOctave}
                max={maxOctave}
                step={1}
                marks={octaveMarks}
                restrictToMarks
                label={null}
                size={28}
                radius="xl"
                thumbSize={24}
                onChange={(value) => update({ midi: (value + 1) * 12 + pitchClass(snapshot.midi) })}
              />
            </div>
          </div>
          </>}
        </div>
      </div>

      <div className="settings-section calibration-settings">
        <div className="calibration-heading">
          <h3>{t('settings.calibration')}</h3>
          <output className="calibration-value">A4 <span>{settings.a4} Hz</span></output>
        </div>
        <div className="calibration-control">
          <ActionIcon variant="default" size={36} radius="md" aria-label={t('settings.decreaseA4')} disabled={settings.a4 <= MIN_A4} onClick={() => update({ a4: clampA4(Math.round(settings.a4) - 1) })}>
            <IconMinus size={16} />
          </ActionIcon>
          <Slider
            classNames={{
              root: 'pill-slider-root calibration-slider',
              trackContainer: 'calibration-slider-container',
              track: 'pill-slider-track',
              bar: 'pill-slider-bar',
              thumb: 'pill-slider-thumb',
            }}
            thumbLabel={t('settings.a4')}
            value={settings.a4}
            onChange={(value) => update({ a4: clampA4(value) })}
            min={MIN_A4}
            max={MAX_A4}
            step={1}
            precision={0}
            label={(value) => `${value} Hz`}
            size={28}
            radius="xl"
            thumbSize={24}
            attributes={{ thumb: { 'aria-valuetext': `${settings.a4} Hz` } }}
          />
          <ActionIcon variant="default" size={36} radius="md" aria-label={t('settings.increaseA4')} disabled={settings.a4 >= MAX_A4} onClick={() => update({ a4: clampA4(Math.round(settings.a4) + 1) })}>
            <IconPlus size={16} />
          </ActionIcon>
        </div>
      </div>

    </section>
  );
}
