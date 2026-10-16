import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zhCN from './locales/zh-CN.json';
import en from './locales/en.json';

export const DEFAULT_LANGUAGE = 'zh-CN';
export const LANGUAGES = [
  { code: 'zh-CN', label: '简体中文', translation: zhCN },
  { code: 'en', label: 'English', translation: en },
];
const LANGUAGE_STORAGE_KEY = 'strobe-tuner-language';

function savedLanguage() {
  try {
    const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return LANGUAGES.find((language) => language.code === saved)?.code ?? DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
}

function syncLanguage(language: string) {
  document.documentElement.lang = language;
  document.title = i18n.t('app.name');
  document.querySelector('meta[name="description"]')?.setAttribute('content', i18n.t('app.description'));
  document.querySelector('meta[name="apple-mobile-web-app-title"]')?.setAttribute('content', i18n.t('app.name'));
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Switching languages remains available when storage is disabled.
  }
}

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: { translation: typeof zhCN };
  }
}

void i18n.use(initReactI18next).init({
  lng: savedLanguage(),
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: LANGUAGES.map((language) => language.code),
  resources: Object.fromEntries(LANGUAGES.map(({ code, translation }) => [code, { translation }])),
  interpolation: { escapeValue: false },
});

syncLanguage(i18n.language);
i18n.on('languageChanged', syncLanguage);

export default i18n;
