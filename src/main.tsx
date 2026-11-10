import './instrument';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/shell.css';
import './ui/styles/rows.css';
import './ui/styles/now.css';
import './ui/styles/schedule.css';
import './ui/styles/teams.css';
import './ui/styles/pools.css';
import './ui/styles/brackets.css';
import './ui/styles/game.css';
import './ui/styles/search.css';
import './ui/styles/info.css';
import './ui/styles/settings.css';
import './ui/styles/home.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!, {
  onUncaughtError: Sentry.reactErrorHandler(),
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
}).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
