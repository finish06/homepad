// Release awareness — the deployed UI learns a new build has shipped.
//
// CI bakes the commit sha into the bundle (__GIT_SHA__) AND emits a tiny
// /version.json into dist/ at build time (vite.config.ts emit-version-json
// plugin). nginx serves version.json with Cache-Control: no-store, so a fetch
// always reflects the build currently deployed behind the ingress. When the
// fetched sha differs from the baked one, a newer release is live and the
// running tab is stale — the UpdateBanner offers a one-tap refresh.
//
// Pure logic lives here (unit-testable, no React); the polling loop is in
// useReleaseCheck.ts.

export interface VersionInfo {
  version: string;
  sha: string;
  builtAt?: string;
}

// Narrow an untrusted JSON payload to VersionInfo. version.json is same-origin
// and CI-authored, but a proxy error page or partial deploy can hand back
// arbitrary JSON/HTML — never let that crash the app or fake an update.
export function parseVersionInfo(raw: unknown): VersionInfo | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.version !== 'string' || typeof o.sha !== 'string') return null;
  return {
    version: o.version,
    sha: o.sha,
    builtAt: typeof o.builtAt === 'string' ? o.builtAt : undefined,
  };
}

// A release is "new" only when both shas are real build shas and they differ.
// 'dev' on either side means a local/dirty build where the comparison is
// meaningless — never nag a developer's vite dev server or a hand-run build.
export function isNewRelease(currentSha: string, info: VersionInfo | null): boolean {
  if (!info) return false;
  if (currentSha === 'dev' || info.sha === 'dev') return false;
  return info.sha !== currentSha;
}

export async function fetchVersionInfo(): Promise<VersionInfo | null> {
  try {
    const res = await fetch('/version.json', { cache: 'no-store' });
    if (!res.ok) return null;
    return parseVersionInfo(await res.json());
  } catch {
    // Network blip / SPA-fallback HTML (JSON parse throw) — treat as "no news".
    return null;
  }
}
