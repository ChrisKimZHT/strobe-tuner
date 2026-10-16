import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@mantine/core';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function PwaStatus() {
  const { t } = useTranslation();
  const [updating, setUpdating] = useState(false);
  const [updateError, setUpdateError] = useState(false);
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisterError(error) {
      console.error(t('pwa.registrationError'), error);
    },
  });

  if (!offlineReady && !needRefresh) return null;

  const dismiss = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
    setUpdateError(false);
  };
  const refresh = async () => {
    setUpdating(true);
    setUpdateError(false);
    try {
      await updateServiceWorker(true);
    } catch {
      setUpdateError(true);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <aside className="pwa-status" aria-label={t('pwa.label')}>
      <p role="status">{updateError ? t('pwa.updateError')
        : needRefresh ? t('pwa.updateReady')
          : t('pwa.offlineReady')}</p>
      <div className="pwa-actions">
        {needRefresh && <Button size="xs" loading={updating} onClick={() => void refresh()}>{t('pwa.update')}</Button>}
        <Button size="xs" variant="subtle" onClick={dismiss}>{needRefresh ? t('pwa.later') : t('pwa.acknowledge')}</Button>
      </div>
    </aside>
  );
}
