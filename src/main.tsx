import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/styles/tokens.css';
import './ui/styles/base.css';
import './ui/styles/screens.css';
import './ui/styles/shell.css';
import './ui/styles/rows.css';
import './ui/styles/now.css';
import './ui/styles/schedule.css';
import './ui/styles/teams.css';
import './ui/styles/pools.css';
import './ui/styles/brackets.css';
import { App } from './ui/App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
