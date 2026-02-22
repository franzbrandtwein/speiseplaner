import { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { X, Download, Smartphone, Share, MoreVertical, PlusSquare } from 'lucide-react';

/**
 * Modal with manual install instructions
 */
const InstallInstructionsModal = ({ isIOS, onClose }) => {
  const isChrome = /chrome|chromium/i.test(navigator.userAgent) && !/edg/i.test(navigator.userAgent);
  const isEdge = /edg/i.test(navigator.userAgent);
  const isFirefox = /firefox/i.test(navigator.userAgent);
  const isSafari = /safari/i.test(navigator.userAgent) && !/chrome/i.test(navigator.userAgent);

  return (
    <div className="fixed inset-0 bg-black/50 z-[200] flex items-end md:items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center">
              <Smartphone className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">App installieren</p>
              <p className="text-xs text-gray-500">Speisenplaner</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Instructions */}
        <div className="p-5 space-y-4">
          {isIOS || isSafari ? (
            <>
              <p className="text-sm text-gray-600">So installierst du die App auf deinem iPhone/iPad:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">Tippe auf das <strong>Teilen-Symbol</strong></p>
                    <div className="mt-1 inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                      <Share className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-gray-600">Teilen</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">Scrolle und tippe auf</p>
                    <div className="mt-1 inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                      <PlusSquare className="w-4 h-4 text-gray-600" />
                      <span className="text-xs text-gray-600">"Zum Home-Bildschirm"</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">3</span>
                  <p className="text-sm text-gray-700">Tippe oben rechts auf <strong>"Hinzufügen"</strong></p>
                </div>
              </div>
            </>
          ) : isFirefox ? (
            <>
              <p className="text-sm text-gray-600">So installierst du die App in Firefox:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                  <p className="text-sm text-gray-700">Tippe auf das <strong>Menü-Symbol</strong> (⋮) oben rechts</p>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                  <p className="text-sm text-gray-700">Wähle <strong>"Zum Startbildschirm hinzufügen"</strong></p>
                </div>
              </div>
            </>
          ) : (
            // Chrome / Edge / other Chromium
            <>
              <p className="text-sm text-gray-600">So installierst du die App in Chrome/Edge:</p>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">1</span>
                  <div className="flex-1">
                    <p className="text-sm text-gray-700">Klicke auf das <strong>Menü-Symbol</strong> oben rechts</p>
                    <div className="mt-1 inline-flex items-center gap-1 bg-gray-100 rounded-lg px-2 py-1">
                      <MoreVertical className="w-4 h-4 text-gray-600" />
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0">2</span>
                  <p className="text-sm text-gray-700">Wähle <strong>"App installieren"</strong> oder <strong>"Zum Startbildschirm hinzufügen"</strong></p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="px-5 pb-5">
          <button
            onClick={onClose}
            className="w-full bg-emerald-500 text-white py-2.5 rounded-xl font-semibold text-sm hover:bg-emerald-600 transition-colors"
          >
            Verstanden
          </button>
        </div>
      </div>
    </div>
  );
};

/**
 * Install Button – can be embedded in nav or shown as floating banner
 * variant: 'nav' | 'banner'
 */
export const InstallButton = ({ variant = 'banner' }) => {
  const { isInstallable, isInstalled, isIOS, promptInstall, hasNativePrompt } = usePWAInstall();
  const [showModal, setShowModal] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    if (variant !== 'banner') return false;
    try {
      return localStorage.getItem('pwa-install-dismissed') === 'true';
    } catch {
      return false;
    }
  });

  if (isInstalled) return null;
  if (variant === 'banner' && dismissed) return null;
  if (!isInstallable) return null;

  const handleClick = async () => {
    const result = await promptInstall();
    if (result === 'manual' || result === undefined) {
      setShowModal(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try { localStorage.setItem('pwa-install-dismissed', 'true'); } catch {}
  };

  if (variant === 'nav') {
    return (
      <>
        <button
          onClick={handleClick}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 transition-colors text-emerald-700 border border-emerald-200"
        >
          <Download className="w-5 h-5 flex-shrink-0" />
          <span className="text-sm font-medium">App installieren</span>
        </button>
        {showModal && (
          <InstallInstructionsModal
            isIOS={isIOS}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    );
  }

  // Banner variant
  return (
    <>
      <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
        <div className="bg-white rounded-2xl shadow-lg border border-emerald-100 p-4 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex-shrink-0 flex items-center justify-center">
            <Smartphone className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-gray-900">App installieren</p>
            <p className="text-xs text-gray-500">
              {isIOS ? 'Tippe auf Teilen → "Zum Home-Bildschirm"' : 'Für schnelleren Zugriff installieren'}
            </p>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={handleClick}
              className="bg-emerald-500 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-emerald-600 transition-colors flex items-center gap-1"
            >
              <Download className="w-3 h-3" />
              Install
            </button>
            <button
              onClick={handleDismiss}
              className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
              aria-label="Schließen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
      {showModal && (
        <InstallInstructionsModal
          isIOS={isIOS}
          onClose={() => { setShowModal(false); setDismissed(true); }}
        />
      )}
    </>
  );
};

// Default export for backwards compat
const InstallPrompt = () => <InstallButton variant="banner" />;
export default InstallPrompt;
