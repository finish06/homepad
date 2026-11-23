import React, { lazy, Suspense } from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App';
import { initAccent } from './theme/accent';
import './index.css';

// Glass v2 — apply the cached accent before first render so the backdrop blobs
// don't flash the default hue (the accent analog of the index.html theme boot).
initAccent();

// SPEC-admin-server-settings — a test sign-in's tab lands on /#oidc-test=…
// and shows only its result, not the app.
const testResult = /^#oidc-test=(passed|failed)$/.exec(window.location.hash)?.[1] as 'passed' | 'failed' | undefined;
const OidcTestResult = lazy(() => import('./app/OidcTestResult'));

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {testResult ? (
      <Suspense fallback={null}>
        <OidcTestResult result={testResult} />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>,
);
