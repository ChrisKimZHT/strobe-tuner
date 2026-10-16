import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActionIcon, Button, Menu } from '@mantine/core';
import {
  IconCheck, IconChevronDown, IconLanguage, IconLock,
  IconRotateClockwise, IconRotate, IconX,
} from '@tabler/icons-react';
import { LANGUAGES } from './i18n';
import { NOTE_NAMES } from './audio/dsp';
import { loadSettings, saveSettings, type Settings } from './settings';
import { useTuner } from './useTuner';
import { StrobeDial } from './StrobeDial';
import { SettingsPanel } from './SettingsPanel';
import { PwaStatus } from './PwaStatus';
import { version } from '../package.json';

export default function App() {
  const { t, i18n } = useTranslation();
  const [settings, setSettings] = useState(loadSettings);
  const { engine, snapshot } = useTuner(settings);
  const octave = Math.floor(snapshot.midi / 12) - 1;
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  }, []);

  useEffect(() => saveSettings(settings), [settings]);

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="brand">
          <img src="./favicon.svg" width="42" height="42" alt="" />
          <div className="brand-text">
            <h1>{t('app.name')}</h1>
            <p className="app-version">
              <a href="https://github.com/ChrisKimZHT/strobe-tuner" target="_blank" rel="noopener noreferrer">strobe-tuner</a>{' '}
              {t('app.version', { version })}
            </p>
          </div>
        </div>
        <Menu position="bottom-end" withinPortal>
          <Menu.Target>
            <Button
              variant="subtle"
              size="compact-sm"
              styles={{ root: { paddingInline: 8 }, section: { marginInline: 0 }, inner: { gap: 4 } }}
              leftSection={<IconLanguage size={16} />}
              rightSection={<IconChevronDown size={12} />}
              aria-label={t('app.switchLanguage')}
            >
              {LANGUAGES.find((language) => language.code === i18n.resolvedLanguage)?.label}
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            {LANGUAGES.map((language) => (
              <Menu.Item
                key={language.code}
                lang={language.code}
                styles={{ itemSection: { marginInlineStart: 8 } }}
                rightSection={language.code === i18n.resolvedLanguage ? <IconCheck size={14} /> : null}
                onClick={() => void i18n.changeLanguage(language.code)}
              >
                {language.label}
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </header>

      <main>
        <div className="workspace">
          <section className="tuner-panel" aria-labelledby="tuner-title">
            <div className="panel-heading">
              <h2 id="tuner-title">{t('tuner.title')}</h2>
              {snapshot.status === 'suspended' ? (
                <Button variant="subtle" size="compact-xs" onClick={() => void engine.resume()}>{t('transport.resume')}</Button>
              ) : <span className={`status ${snapshot.status === 'running' ? 'is-running' : ''}`} role="status">
                <i />{t(`status.${snapshot.status}`)}
              </span>}
            </div>

            <div className="tuner-visual">
              <div className="dial">
                <StrobeDial engine={engine} />
                <div className="note-display">
                  <span className="target-label">{snapshot.locked && <IconLock size={12} />}{t(snapshot.locked ? 'settings.locked' : 'tuner.targetNote')}</span>
                  <div className="note-value">{NOTE_NAMES[snapshot.midi % 12]}<span>{octave}</span></div>
                  <span className={`signal-quality ${snapshot.valid ? 'is-tracking' : ''}`}>
                    {snapshot.status === 'running' ? t(`tuner.${snapshot.signal}`) : t('tuner.ready')}
                  </span>
                </div>
              </div>

              <div className="direction" aria-hidden="true">
                <span><IconRotate size={14} />{t('tuner.flat')}</span>
                <span>{t('tuner.sharp')}<IconRotateClockwise size={14} /></span>
              </div>
            </div>
            <div className="readings">
              <div><span>{t('tuner.measured')}</span><output>{snapshot.measured?.toFixed(2) ?? '—'}</output></div>
              <div><span>{t('tuner.cents')}</span><output className="cents-value">{snapshot.cents === null ? '—' : `${snapshot.cents >= 0 ? '+' : ''}${snapshot.cents.toFixed(1)}`}</output></div>
              <div><span>{t('tuner.target')}</span><output>{snapshot.target.toFixed(2)}</output></div>
            </div>

          </section>

          <SettingsPanel settings={settings} snapshot={snapshot} update={update} engine={engine} />
        </div>

        {snapshot.error && (
          <div className="error-message" role="alert">
            <span>{t(`errors.${snapshot.error}`)}</span>
            {snapshot.status === 'stopped' && <Button variant="subtle" color="red" size="compact-xs" onClick={() => void engine.start()}>{t('common.retry')}</Button>}
            <ActionIcon aria-label={t('common.dismiss')} color="red" variant="subtle" onClick={() => engine.clearError()}>
              <IconX size={16} />
            </ActionIcon>
          </div>
        )}
        <PwaStatus />
      </main>
    </div>
  );
}
