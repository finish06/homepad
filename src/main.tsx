import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { initAccent } from './accent';
import './index.css';

// Glass v2 — apply the cached accent before first render so the backdrop blobs
// don't flash the default hue (the accent analog of the index.html theme boot).
initAccent();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
