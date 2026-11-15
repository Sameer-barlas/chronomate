import React, { useEffect, useState } from 'react';
import { DownloadIcon } from './Icons';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    try {
      const isStandalone =
        (typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        (window.navigator as unknown as { standalone?: boolean }).standalone === true;
      setIsInstalled(Boolean(isStandalone));

      const ua = (window.navigator.userAgent || '').toLowerCase();
      setIsIOS(/iphone|ipad|ipod/.test(ua));
    } catch {
      // Ignore feature detection errors
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  if (isInstalled) return null;

  if (deferredPrompt) {
    return (
      <button
        type="button"
        onClick={async () => {
          try {
            await deferredPrompt.prompt();
            const choice = await deferredPrompt.userChoice;
            if (choice.outcome === 'accepted') {
              setIsInstalled(true);
              setDeferredPrompt(null);
            }
          } catch {
            // Ignore prompt dismissal
          }
        }}
        className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
      >
        <DownloadIcon className="w-4 h-4 text-amber-400" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="min-h-[48px] px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-200 text-xs sm:text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap shrink-0"
        >
          <DownloadIcon className="w-4 h-4 text-amber-400" />
          <span>Add to Home Screen</span>
        </button>
        {showIOSGuide && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
            className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4"
          >
            <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-sm w-full p-6 space-y-4">
              <h3 id="ios-install-title" className="text-base font-semibold text-white">
                Install on iPhone or iPad
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                1. Tap the <strong>Share</strong> button in Safari.<br />
                2. Select <strong>Add to Home Screen</strong> for full-screen offline chess clock access.
              </p>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full min-h-[48px] rounded-xl bg-amber-400 text-slate-950 font-semibold text-xs sm:text-sm"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
