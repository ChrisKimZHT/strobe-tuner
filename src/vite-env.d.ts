/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

interface Window {
  /** Inject a sine wave in Hz; omit the frequency to restore microphone input. */
  debugTone?: (hz?: number) => Promise<void>;
}
