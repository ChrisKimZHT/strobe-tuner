import { useTranslation } from 'react-i18next';
import { ActionIcon, Button, SegmentedControl, Slider } from '@mantine/core';
import { IconLock, IconLockOpen, IconMinus, IconPlus } from '@tabler/icons-react';
import { clampMidi, MAX_MIDI, MIN_MIDI, NOTE_NAMES } from './audio/dsp';
import type { TunerEngine, TunerSnapshot } from './audio/TunerEngine';
import { clampA4, DEFAULT_SETTINGS, MAX_A4, MIN_A4, type Settings } from './settings';

const WHITE_KEYS = [0, 2, 4, 5, 7, 9, 11];
const INPUT_CHANNELS = ['left', 'mix', 'right'] as const;
const MIN_OCTAVE = Math.floor(MIN_MIDI / 12) - 1;
const MAX_OCTAVE = Math.floor(MAX_MIDI / 12) - 1;
const NOTE_RANGE = `${NOTE_NAMES[MIN_MIDI % 12]}${MIN_OCTAVE}–${NOTE_NAMES[MAX_MIDI % 12]}${MAX_OCTAVE}`;

type Props = {
  settings: Settings;
  snapshot: TunerSnapshot;
  update: (patch: Partial<Settings>) => void;
  engine: TunerEngine;
};

export function SettingsPanel({ settings, snapshot, update, engine }: Props) {
  const { t } = useTranslation();
  const octave = Math.floor(snapshot.midi / 12) - 1;
  const noteName = NOTE_NAMES[snapshot.midi % 12];
  const octaveMarks = Array.from({ length: MAX_OCTAVE - MIN_OCTAVE + 1 }, (_, index) => ({
    value: MIN_OCTAVE + index, label: `${noteName}${MIN_OCTAVE + index}`,
  }));
  const manual = settings.mode === 'manual';

  return (
    <section className="settings-panel" aria-labelledby="settings-title">
      <div className="panel-heading">
        <h2 id="settings-title">{t('settings.title')}</h2>
        <Button variant="subtle" size="compact-xs" color="gray" onClick={() => {
          engine.setLocked(false);
          update({ ...DEFAULT_SETTINGS });
        }}>{t('settings.reset')}</Button>
      </div>

      <div className="settings-section target-settings">
        <h3 className="pitch-selection-title">{t('settings.pitchSelection')}</h3>
        <div className="target-actions">
          <SegmentedControl
            className="mode-switch"
            classNames={{ label: 'mode-switch-label', indicator: 'mode-switch-indicator' }}
            fullWidth
            size="xs"
            value={settings.mode}
            aria-label={t('settings.mode')}
            data={[
              { value: 'auto', label: <span className="mode-option">{t('settings.autoShort')}<span className="mode-range">{NOTE_RANGE}</span></span> },
              { value: 'manual', label: t('settings.manualShort') },
            ]}
            onChange={(mode) => update({ mode: mode === 'manual' ? 'manual' : 'auto', midi: snapshot.midi })}
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
                  disabled={!manual || midi < MIN_MIDI || midi > MAX_MIDI}
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
                min={MIN_OCTAVE}
                max={MAX_OCTAVE}
                step={1}
                marks={octaveMarks}
                restrictToMarks
                label={null}
                size={28}
                radius="xl"
                thumbSize={24}
                onChange={(value) => update({ midi: clampMidi((value + 1) * 12 + snapshot.midi % 12) })}
              />
            </div>
          </div>
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

      <div className="settings-section channel-settings">
        <h3 className="pitch-selection-title">{t('settings.channel')}</h3>
        <div className="channel-slider">
          <Slider
            thumbLabel={t('settings.channel')}
            value={INPUT_CHANNELS.indexOf(settings.channel)}
            min={0}
            max={2}
            step={1}
            marks={INPUT_CHANNELS.map((channel, value) => ({ value, label: t(`settings.channel_${channel}`) }))}
            restrictToMarks
            label={null}
            size={28}
            radius="xl"
            thumbSize={24}
            classNames={{
              root: 'pill-slider-root', track: 'pill-slider-track', bar: 'pill-slider-bar', thumb: 'pill-slider-thumb',
              markWrapper: 'octave-slider-mark-wrapper', mark: 'octave-slider-mark', markLabel: 'octave-slider-mark-label',
            }}
            attributes={{ thumb: { 'aria-valuetext': t(`settings.channel_${settings.channel}`) } }}
            onChange={(value) => update({ channel: INPUT_CHANNELS[value] })}
          />
        </div>
      </div>
    </section>
  );
}
