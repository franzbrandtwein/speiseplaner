import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";
import * as serviceWorkerRegistration from "./serviceWorkerRegistration";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// Register Service Worker for PWA functionality
serviceWorkerRegistration.register({
  onSuccess: () => {
    console.log('[PWA] Speisenplaner bereit für Offline-Nutzung.');
  },
  onUpdate: (registration) => {
    console.log('[PWA] Neue Version verfügbar!');
    // Notify user about update
    const event = new CustomEvent('pwa-update-available', { detail: registration });
    window.dispatchEvent(event);
  },
});
