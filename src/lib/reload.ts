// A full page reload, in its own module so tests can replace it (jsdom does not
// implement location.reload). Used after "Sign in this device as …": the server
// has swapped this device's session cookie, and the reload is what makes the
// app boot as the kid (SPEC-kid-accounts UX §4).
export function reloadPage(): void {
  window.location.reload();
}
