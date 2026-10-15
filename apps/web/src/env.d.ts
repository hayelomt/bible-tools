interface ImportMetaEnv {
  /** Sentry's address for this app, set only in the deployed build (`lib/sentry.ts`). */
  readonly VITE_SENTRY_DSN?: string;
}
