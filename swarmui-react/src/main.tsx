import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { logger } from './utils/logger';

// Global error handlers
window.onerror = (message, source, lineno, colno, error) => {
  logger.error('Global Error Detected:', { message, source, lineno, colno, error });
  return false;
};

window.onunhandledrejection = (event) => {
  logger.error('Unhandled Promise Rejection:', event.reason);
};

// Fade out and remove the native loading spinner
let loaderDismissed = false;
const fadeOutLoader = () => {
  if (loaderDismissed) return;
  loaderDismissed = true;
  const loader = document.getElementById('app-loading');
  if (loader) {
    loader.classList.add('fade-out');
    setTimeout(() => loader.remove(), 200);
  }
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Remove loader after first paint.
// rAF is paused for hidden/background tabs, so always add a setTimeout fallback.
requestAnimationFrame(() => requestAnimationFrame(fadeOutLoader));
setTimeout(fadeOutLoader, 500);
