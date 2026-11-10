import * as Sentry from '@sentry/react';

// Error reporting (v3 stage 0). The DSN is public by design: it only lets clients send events.
const DSN = 'https://880088fd45e9964e16409b29d4ae3cd4@o4512409837371392.ingest.de.sentry.io/4512409887506512';

/** The tournament on screen, from the `#/t/<sourceKey>` route, so errors can be grouped by sheet. */
function currentTournament(): string | undefined {
  const m = /^#\/t\/([^/?]+)/.exec(location.hash);
  return m ? decodeURIComponent(m[1]) : undefined;
}

Sentry.init({
  dsn: DSN,
  environment: import.meta.env.MODE,
  release: __APP_RELEASE__,
  integrations: [Sentry.browserTracingIntegration()],
  // Trace a sample of page loads in production; everything locally.
  tracesSampleRate: import.meta.env.PROD ? 0.1 : 1.0,
  // Never add trace headers to outgoing requests: Google Sheets and OpenRouter would reject the CORS preflight.
  tracePropagationTargets: [],
  beforeSend(event) {
    const t = currentTournament();
    if (t) event.tags = { ...event.tags, tournament: t };
    return event;
  },
});
