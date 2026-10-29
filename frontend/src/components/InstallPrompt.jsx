import { useEffect, useState } from 'react';

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('compeng-install-dismissed') === '1';
    } catch {
      return false;
    }
  });
  const [installed, setInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  });

  useEffect(() => {
    function handleBeforeInstall(e) {
      e.preventDefault();
      setDeferredPrompt(e);
    }

    function handleInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  }

  function handleDismiss() {
    setDismissed(true);
    try {
      localStorage.setItem('compeng-install-dismissed', '1');
    } catch {}
  }

  if (installed || dismissed || !deferredPrompt) return null;

  return (
    <div className="install-banner animate-slide-in" role="region" aria-label="Install app">
      <div className="install-banner-icon">
        <img src="/icon-192.png" alt="" width={36} height={36} />
      </div>
      <div className="install-banner-text">
        <strong>Install CompEng Portal</strong>
        <span>Faster access, offline support, no address bar.</span>
      </div>
      <button className="install-banner-cta" onClick={handleInstall}>
        Install
      </button>
      <button
        className="install-banner-dismiss"
        onClick={handleDismiss}
        aria-label="Dismiss"
      >
        ×
      </button>
    </div>
  );
}