import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// SPEC-household-catalog-owner AC-016 (§10) — the 18.0.0 CHANGELOG entry
// says the migration is one way, tells admins to take a database dump first,
// says there is no way back to 17.x but the dump, and gives a psql line for
// the archive that works when pasted into a shell. Q5: it also says backups
// are now schema version 2, which 17.x refuses.

const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const md = read('CHANGELOG.md');
const start = md.search(/^## \[18\.0\.0\]/m);
const entry = start < 0 ? '' : md.slice(start, start + md.slice(start + 3).search(/^## /m) + 3);
// Prose wraps at any space; compare it on one line.
const flat = entry.replace(/\s+/g, ' ');

describe('AC-016 — the 18.0.0 CHANGELOG entry', () => {
  it('exists, above every released version', () => {
    expect(start).toBeGreaterThan(-1);
    expect(start).toBeLessThan(md.search(/^## \[17\.0\.0\]/m));
  });

  it('carries the release-note lines from the spec', () => {
    for (const line of [
      'The app list now belongs to the household. Every admin edits the same list, and it stays when an account is removed. This is why the version is 18.0.0.',
      "The upgrade changes the database in a way that can't be undone. Take a backup of the database before you upgrade.",
      'Some old, hidden copies of apps are moved out of the way. Nobody could see them.',
      "You can't go back to 17.x after this upgrade. To go back, restore the database backup.",
    ]) {
      expect(flat).toContain(line);
    }
  });

  it('shows how to take the backup', () => {
    expect(entry).toMatch(/pg_dump -U homepad homepad > /);
  });

  it('gives a psql line for catalog_archive that survives the shell', () => {
    // The spec's 'select … row->>''name'' …' loses its quotes in a shell
    // ('' just ends and reopens the string), so the SQL is double-quoted.
    expect(entry).toContain(
      `docker compose exec postgres psql -U homepad -c "select kind, former_owner_email, row->>'name' from catalog_archive"`,
    );
    expect(entry).not.toContain("''name''");
  });

  it('says what stops the boot, and how to fix it', () => {
    expect(flat).toContain(
      'migration 0021: the catalog has apps but no admin account exists. Make one account an admin, then restart.',
    );
    expect(entry).toMatch(/update users set role = 'admin' where email = /);
  });

  it('says backups are schema version 2, and what 17.x does with one', () => {
    expect(flat).toMatch(/`schemaVersion` 2/);
    expect(flat).toMatch(/newer Homepad/);
  });
});

describe('Q5 — docs/backup-import.md describes schema version 2', () => {
  const doc = read('docs/backup-import.md');

  it('shows version 2 in the file header and links both schemas', () => {
    expect(doc).toContain('"schemaVersion": 2');
    expect(doc).toMatch(/homepad-backup-v2\.json/);
    expect(doc).toMatch(/homepad-backup-v1\.json/);
  });

  it('says a version 1 file still restores', () => {
    expect(doc).toMatch(/version 1 file/);
  });
});
