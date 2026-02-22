import { useState, useEffect } from 'react';

// Synchronously check if app is in standalone mode (already installed)
function checkIsStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

/**
 * Hook to handle PWA install prompt (Add to Home Screen)
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  // Initialize synchronously on first render - no useEffect delay
  const [isInstalled, setIsInstalled] = useState(() => checkIsStandalone());
  const [isInstallable, setIsInstallable] = useState(() => !checkIsStandalone());
  const [isIOS, setIsIOS] = useState(() => {
    if (typeof window === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent);
  });

  useEffect(() => {
    // Re-check standalone on mount (in case matchMedia wasn't ready at init)
    if (checkIsStandalone()) {
      setIsInstalled(true);
      setIsInstallable(false);
      return;
    }

    // Listen for native beforeinstallprompt (Chrome/Android/Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      // isInstallable is already true, just update prompt reference
    };

    // Listen for appinstalled
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('[PWA] App installed successfully');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const promptInstall = async () => {
    if (deferredPrompt) {
      // Native browser prompt available
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      setDeferredPrompt(null);
      if (outcome === 'accepted') {
        setIsInstallable(false);
        return 'installed';
      }
      return 'dismissed';
    }
    // No native prompt → show manual instructions
    return 'manual';
  };

  return { isInstallable, isInstalled, isIOS, promptInstall, hasNativePrompt: !!deferredPrompt };
}
