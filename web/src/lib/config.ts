/** Runtime configuration. Read on the server from env vars at request time and injected into the page,
 *  so no environment values are baked into the build or committed to the repo. */
export type SaathiConfig = {
  apiUrl: string;
  firebase: {
    apiKey: string;
    authDomain: string;
    projectId: string;
    appId: string;
    messagingSenderId: string;
    storageBucket: string;
  };
};

declare global {
  interface Window {
    __SAATHI__?: SaathiConfig;
  }
}

export function serverConfig(): SaathiConfig {
  const e = process.env;
  return {
    apiUrl: e.SAATHI_API_URL ?? "http://localhost:8080",
    firebase: {
      apiKey: e.FIREBASE_API_KEY ?? "",
      authDomain: e.FIREBASE_AUTH_DOMAIN ?? "",
      projectId: e.FIREBASE_PROJECT_ID ?? "",
      appId: e.FIREBASE_APP_ID ?? "",
      messagingSenderId: e.FIREBASE_MESSAGING_SENDER_ID ?? "",
      storageBucket: e.FIREBASE_STORAGE_BUCKET ?? "",
    },
  };
}

export function clientConfig(): SaathiConfig {
  if (typeof window !== "undefined" && window.__SAATHI__) return window.__SAATHI__;
  return serverConfig();
}
