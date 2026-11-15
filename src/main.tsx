import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import './index.css';

if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  const registerSW = async () => {
    try {
      await navigator.serviceWorker.register('/sw.js');
      if ('caches' in window) {
        const cache = await caches.open('chronomate-shell-v3');
        const assetElements = document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>(
          'script[src], link[rel="stylesheet"][href]'
        );
        for (const el of assetElements) {
          const url = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href;
          if (url && !(await cache.match(url))) {
            try {
              const res = await fetch(url);
              if (res.ok) await cache.put(url, res);
            } catch {
              // Ignore offline fetch failure
            }
          }
        }
      }
    } catch {
      // Fail silently if service workers are restricted
    }
  };

  window.addEventListener('load', () => {
    if ('requestIdleCallback' in window) {
      (window as Window & { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(registerSW);
    } else {
      setTimeout(registerSW, 1200);
    }
  });
}

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
