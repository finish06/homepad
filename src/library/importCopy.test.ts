import { describe, expect, it } from 'vitest';
import { codeCopy, errorCopy, fieldWords, IMPORT_COPY } from './importCopy';

// SPEC-backup-import §8 / UX §6 (TASK-302) — the API sends stable codes; the
// words live in one map here so copy can change without an API change.

// Every code the plan fixes (docs/plans/backup-import-plan.md).
const CODES = [
  // errors
  'not_a_backup', 'schema_newer', 'invalid_json', 'not_homepage_services', 'not_homepage_bookmarks',
  'not_homepage_settings', 'yaml_syntax', 'too_deep', 'too_large', 'too_many', 'plan_changed', 'bad_mode',
  'plan_missing', 'network', 'failed',
  // skip reasons
  'no_link', 'bad_scheme', 'href_uses_variable', 'already_here', 'duplicate', 'no_name', 'invalid_item',
  'adult_no_account', 'icon_invalid',
  // warnings
  'widget_dropped', 'icon_local', 'icon_glyph', 'icon_unsupported', 'description_variable', 'section_missing',
  'kid_needs_device', 'status_on', 'ref_missing', 'unknown_fields',
];

describe('importCopy — every code has words (UX §6)', () => {
  it.each(CODES)('%s has copy', (code) => {
    expect(IMPORT_COPY[code]).toBeTruthy();
  });

  it('uses the UX §6 wording for the codes it lists', () => {
    expect(IMPORT_COPY.schema_newer).toBe('This backup is from a newer Homepad. Update Homepad, then try again.');
    expect(IMPORT_COPY.not_a_backup).toBe("This isn't a Homepad backup file.");
    expect(IMPORT_COPY.plan_changed).toBe("Your dashboard changed since the preview. Here's the new one.");
    expect(IMPORT_COPY.already_here).toBe('Already on your dashboard.');
    expect(IMPORT_COPY.href_uses_variable).toBe('Link uses a Homepage variable. Add it by hand.');
    expect(IMPORT_COPY.network).toBe("Couldn't reach Homepad. Check your connection and try again.");
  });

  it('keeps every message plain: at most two short sentences, no contrast framing', () => {
    for (const [code, text] of Object.entries(IMPORT_COPY)) {
      const sentences = text.split(/(?<=[.?!])\s+/).filter(Boolean);
      expect(sentences.length, code).toBeLessThanOrEqual(2);
      expect(text, code).not.toMatch(/\bnot\b[^.]*\bbut\b/i);
      expect(text, code).not.toMatch(/\binstead of\b/i);
    }
  });
});

describe('codeCopy fills its placeholders', () => {
  it('fills {icon}, {n} and friends', () => {
    expect(codeCopy('icon_glyph', { icon: 'mdi-plex' })).toBe('Shows initials (mdi-plex).');
    expect(codeCopy('unknown_fields', { n: 3 })).toBe("3 fields this version doesn't use were ignored.");
    expect(codeCopy('ref_missing', { n: 2 })).toBe('2 favorites or order entries pointed at apps not in the file.');
  });

  it('an unknown code falls back to a plain line, never a raw code', () => {
    expect(codeCopy('brand_new_code')).toBe('Something went wrong. Try again.');
  });
});

describe('errorCopy (AC-016, AC-026, AC-028)', () => {
  it('yaml_syntax names the line and the parser detail', () => {
    expect(errorCopy({ code: 'yaml_syntax', line: 3, message: 'yaml: line 3: did not find expected key' })).toBe(
      "There's a problem on line 3: did not find expected key.",
    );
  });

  it("yaml_syntax uses the API's detail, so its sentence isn't repeated", () => {
    expect(
      errorCopy({
        code: 'yaml_syntax',
        line: 2,
        message: "There's a problem on line 2: mapping values are not allowed in this context.",
        detail: 'mapping values are not allowed in this context',
      }),
    ).toBe("There's a problem on line 2: mapping values are not allowed in this context.");
  });

  it('a shape error adds the line in brackets (spec §4.5)', () => {
    expect(errorCopy({ code: 'not_homepage_services', line: 1 })).toBe(
      "This doesn't look like a Homepage services.yaml. It should be a list of groups. (line 1)",
    );
  });

  it('too_many names the count, the things and the limit', () => {
    expect(errorCopy({ code: 'too_many', count: 1200, things: 'apps', limit: 1000 })).toBe(
      'This file has 1200 apps. The limit is 1000.',
    );
  });

  it('schema_newer and too_large use their fixed copy', () => {
    expect(errorCopy({ code: 'schema_newer' })).toBe(IMPORT_COPY.schema_newer);
    expect(errorCopy({ code: 'too_large' })).toBe(IMPORT_COPY.too_large);
  });
});

describe('fieldWords', () => {
  it('turns API field names into plain words', () => {
    expect(fieldWords(['name', 'icon', 'gatusKey', 'collapsedSections', 'url'])).toBe(
      'name, icon, status key, folded sections, link',
    );
    expect(fieldWords(['somethingNew'])).toBe('somethingNew');
  });
});
