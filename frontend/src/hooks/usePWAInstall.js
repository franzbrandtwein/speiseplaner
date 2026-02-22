import { useState, useEffect } from 'react';

/**
 * Hook to handle PWA install prompt (Add to Home Screen)
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);

  useEffect(() => {
    // Check if already installed (standalone mode)
    const checkInstalled = () => {
      if (
        window.matchMedia('(display-mode: standalone)').matches ||
        window.navigator.standalone === true
      ) {
        setIsInstalled(true);
        return true;
      }
      return false;
    };

    const alreadyInstalled = checkInstalled();
    if (alreadyInstalled) return;

    // Check for iOS
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setIsIOS(ios);
    if (ios) {
      setIsInstallable(true);
      return;
    }

    // For all other browsers: show button immediately as fallback
    // The button will trigger the native prompt if available,
    // or show manual instructions otherwise
    setIsInstallable(true);

    // Listen for beforeinstallprompt (Chrome/Android/Edge)
    const handleBeforeInstallPrompt = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
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
