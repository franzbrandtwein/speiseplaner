import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { X, Download, Smartphone } from 'lucide-react';

/**
 * PWA Install Prompt Banner
 * Shows a dismissible banner prompting users to install the app
 */
const InstallPrompt = () => {
  const { isInstallable, isInstalled, isIOS, promptInstall } = usePWAInstall();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('pwa-install-dismissed') === 'true';
    } catch {
      return false;
    }
  });

  if (isInstalled || dismissed || !isInstallable) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('pwa-install-dismissed', 'true');
    } catch {}
  };

  const handleInstall = async () => {
    if (isIOS) return; // iOS shows instructions instead
    const installed = await promptInstall();
    if (installed) setDismissed(true);
  };

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-4 flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 bg-emerald-500 rounded-xl flex-shrink-0 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-white" />
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-gray-900">
            App installieren
          </p>
          {isIOS ? (
            <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
              Tippe auf <strong>Teilen</strong> und dann auf
              <strong> "Zum Home-Bildschirm"</strong> um den Speisenplaner zu installieren.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-0.5">
              Speisenplaner auf dem Gerät installieren für schnelleren Zugriff.
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {!isIOS && (
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors"
            >
              <Download className="w-3 h-3" />
              Install
            </button>
          )}
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Schließen"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default InstallPrompt;
