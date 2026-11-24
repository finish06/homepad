import { execFileSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import type { GlobalSetupContext } from 'vitest/node';

// SPEC-test-infra-18.3.0 AC-001..003 — bundle-budget.test.ts and
// pwa-icons.test.ts check the BUILT app. They used to read ./dist, so a plain
// `vitest run` on a clean checkout failed them with ENOENT (#640 and five
// duplicates), and on a stale checkout they quietly checked an old build.
//
// Now every vitest run builds the app once, here, into its own folder, and the
// two suites read that. They always check the current source, never skip, and
// never pass without having looked at a build. A failed build fails the run.
// `npm run build` (and its ./dist) is untouched. A build is about 3 s.
export const TEST_DIST_DIR = resolve(process.cwd(), 'node_modules/.cache/homepad-test-dist');

export default function setup({ provide }: GlobalSetupContext) {
  // vite's package.json does not export bin/, so find it from the package root.
  const vite = resolve(dirname(createRequire(import.meta.url).resolve('vite/package.json')), 'bin/vite.js');
  rmSync(TEST_DIST_DIR, { recursive: true, force: true });
  console.log(`[built-dist] vite build -> ${TEST_DIST_DIR} (for bundle-budget and pwa-icons)`);
  try {
    execFileSync(
      process.execPath,
      [vite, 'build', '--outDir', TEST_DIST_DIR, '--emptyOutDir', '--logLevel', 'warn'],
      // vitest sets NODE_ENV=test. Vite would keep it and bundle React's
      // development build, so the budget would measure a different artifact.
      { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'production' } },
    );
  } catch (err) {
    throw new Error(
      `[built-dist] vite build failed, so bundle-budget and pwa-icons cannot run. ` +
        `Fix the build first (npm run build shows the same error).`,
      { cause: err },
    );
  }
  provide('builtDistDir', TEST_DIST_DIR);
}

declare module 'vitest' {
  export interface ProvidedContext {
    builtDistDir: string;
  }
}
