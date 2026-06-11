import React from 'react';
import ReactDOM from 'react-dom/client';
import 'leaflet/dist/leaflet.css';
import './styles/global.css';
import App from './App';
import { StoreProvider } from './lib/store';
import { AuthProvider } from './lib/auth';
import { SyncProvider } from './lib/useSync';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <StoreProvider>
        <SyncProvider>
          <App />
        </SyncProvider>
      </StoreProvider>
    </AuthProvider>
  </React.StrictMode>,
);

// app-shell offline caching (production only — the SW would fight Vite's dev server)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {/* offline-first is best-effort */});
  });
}
