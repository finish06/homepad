import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-backup-import AC-031 — docs/backup-import.md, linked from the README,
// explains backup, restore and Homepage import and lists what doesn't carry
// over from Homepage. The GitHub mirror is public, so the doc must use
// documentation-only hosts and addresses.

const doc = resolve(process.cwd(), 'docs/backup-import.md');
const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

describe('docs/backup-import.md (AC-031)', () => {
  it('exists and is linked from the README', () => {
    expect(existsSync(doc)).toBe(true);
    expect(read('README.md')).toMatch(/\]\(\.?\/?docs\/backup-import\.md\)/);
  });

  it('covers back up, restore (both modes) and Homepage import', () => {
    const md = read('docs/backup-import.md');
    for (const heading of [/^## Back up/m, /^## Restore/m, /^## Import from Homepage/m]) {
      expect(md).toMatch(heading);
    }
    expect(md).toMatch(/Merge/);
    expect(md).toMatch(/Replace/);
    expect(md).toMatch(/REPLACE/);
    expect(md).toMatch(/pg_dump/);
    expect(md).toMatch(/homepad-backup-v1\.json/);
  });

  it("lists what doesn't carry over from Homepage", () => {
    const md = read('docs/backup-import.md');
    const section = md.slice(md.search(/^### What doesn't carry over/m));
    expect(section.length).toBeGreaterThan(30);
    for (const thing of [/widget/i, /Docker/, /Kubernetes/, /tab/i, /background/i, /theme/i, /mdi-/, /local icon/i, /siteMonitor/]) {
      expect(section).toMatch(thing);
    }
  });

  it('uses only documentation hosts and addresses', () => {
    const md = read('docs/backup-import.md');
    const hosts = [...md.matchAll(/https?:\/\/([a-z0-9.-]+)/gi)].map((m) => m[1].toLowerCase());
    for (const h of hosts) {
      expect(h, `unexpected host ${h}`).toMatch(
        /(^|\.)example\.(com|org|net)$|\.home\.arpa$|^192\.0\.2\.\d+$|^cdn\.jsdelivr\.net$|^github\.com$|^gethomepage\.dev$/,
      );
    }
    const ips = [...md.matchAll(/\b(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\b/g)].map((m) => m[1]);
    for (const ip of ips) expect(ip, `unexpected address ${ip}`).toMatch(/^192\.0\.2\./);
  });
});
