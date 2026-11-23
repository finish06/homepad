// SPEC-admin-server-settings §7 (0.2.1) — a test sign-in's tab. The API's
// callback lands it on /#oidc-test=passed or /#oidc-test=failed. The admin
// started the test from the Admin Panel in another tab, which polls the result,
// so this tab only says what happened and that it can be closed. It is loaded
// on demand (main.tsx), so the entry chunk only carries the hash check.

export default function OidcTestResult({ result }: { result: 'passed' | 'failed' }) {
  const passed = result === 'passed';
  return (
    <main className="grid min-h-screen place-content-center gap-2 p-6 text-center" data-testid="oidc-test-result">
      <h1 className="text-xl font-semibold">{passed ? 'Test sign-in passed.' : 'Test sign-in failed.'}</h1>
      <p>
        {passed
          ? 'You can close this tab. Go back to Homepad to save the settings.'
          : 'You can close this tab. Homepad shows the reason in the Admin Panel.'}
      </p>
    </main>
  );
}
