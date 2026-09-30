import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';

function report(payload) {
  try {
    fetch('/api/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch {}
}

window.addEventListener('error', (e) => {
  report({ tipo: 'erro', msg: String(e.message || '') + ' @ ' + (e.filename || '') + ':' + (e.lineno || '') + ':' + (e.colno || '') });
});
window.addEventListener('unhandledrejection', (e) => {
  report({ tipo: 'rejeicao', msg: String((e.reason && e.reason.message) || e.reason || '') + ' | stack: ' + String((e.reason && e.reason.stack) || '') });
});

window.tapMesa = (m) => report({ tipo: 'tap', msg: 'mesa ' + m });

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);