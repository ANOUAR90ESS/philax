import '@philax/ui/styles.css';
import './app/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import { initI18n } from './lib/i18n';

initI18n();

const root = document.getElementById('root');
if (!root) throw new Error('Root element missing');
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
