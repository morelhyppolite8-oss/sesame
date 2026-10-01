import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-600.css';
import './index.css';
import { MotionGlobalConfig } from 'framer-motion';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { ensurePlanModel, ensureSubscriptionsModel, seedDefaults } from './db/actions';

// Navigateur piloté par des tests automatisés : animations instantanées, pour des tests déterministes.
if (navigator.webdriver) MotionGlobalConfig.instantAnimations = true;

async function start() {
  await seedDefaults();
  await ensureSubscriptionsModel();
  await ensurePlanModel();
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => undefined);
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

start();
