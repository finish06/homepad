// SPEC-backup-import §8 / UX §6 — the words for every code homepad-api sends on
// a backup restore or a Homepage import. The API sends stable codes; the UI owns
// the copy, so it can change without an API change. One or two short sentences
// each, saying what to do when there is something to do.

export const IMPORT_COPY: Record<string, string> = {
  // Errors
  not_a_backup: "This isn't a Homepad backup file.",
  schema_newer: 'This backup is from a newer Homepad. Update Homepad, then try again.',
  invalid_json: "This file isn't valid JSON. Check that it's a Homepad backup.",
  not_homepage_services: "This doesn't look like a Homepage services.yaml. It should be a list of groups.",
  not_homepage_bookmarks: "This doesn't look like a Homepage bookmarks.yaml. It should be a list of groups.",
  not_homepage_settings: "This doesn't look like a Homepage settings.yaml. It should be a list of settings.",
  yaml_syntax: "There's a problem on line {line}: {detail}.",
  too_deep: 'Groups are nested more than 8 deep. Flatten some of them, then try again.',
  too_large: 'This file is too big. Backups can be up to 16 MB, and Homepage files up to 1 MB.',
  too_many: 'This file has {count} {things}. The limit is {limit}.',
  plan_changed: "Your dashboard changed since the preview. Here's the new one.",
  bad_mode: 'Pick Merge or Replace, then try again.',
  plan_missing: 'Preview the changes first, then try again.',
  network: "Couldn't reach Homepad. Check your connection and try again.",
  failed: 'Something went wrong. Try again.',

  // Skip reasons
  no_link: 'No link.',
  bad_scheme: "Link isn't http or https.",
  href_uses_variable: 'Link uses a Homepage variable. Add it by hand.',
  already_here: 'Already on your dashboard.',
  duplicate: 'This link is already in the file.',
  no_name: 'No name.',
  invalid_item: "Some of its settings aren't valid.",
  adult_no_account: 'Skipped: no account with this email.',
  icon_invalid: 'Icon skipped: not a valid PNG.',

  // Warnings
  widget_dropped: 'Widget not imported.',
  icon_local: "Local icon files can't be copied. Upload it on the app.",
  icon_glyph: 'Shows initials ({icon}).',
  icon_unsupported: "This icon can't be used. Shows initials.",
  description_variable: 'The description uses a Homepage variable. It was kept as text.',
  section_missing: 'Its section is not in the file. It goes to Uncategorized.',
  kid_needs_device: 'Sign their device in again from Accounts.',
  status_on: 'Status turned on.',
  ref_missing: '{n} favorites or order entries pointed at apps not in the file.',
  unknown_fields: "{n} fields this version doesn't use were ignored.",
};

const FALLBACK = IMPORT_COPY.failed;

// codeCopy — the words for `code`, with {name} placeholders filled from vars.
// An unknown code reads as a plain failure line, never as a raw code.
export function codeCopy(code: string, vars: Record<string, string | number | undefined> = {}): string {
  const text = IMPORT_COPY[code];
  if (!text) return FALLBACK;
  return text.replace(/\{(\w+)\}/g, (_m, k: string) => (vars[k] === undefined ? '' : String(vars[k])));
}

export type CodedError = {
  code: string;
  message?: string;
  detail?: string;
  line?: number;
  count?: number;
  limit?: number;
  things?: string;
};

// errorCopy — the words for a failed preview or apply. A YAML syntax error names
// the line and the parser's own detail (the API's `detail`; failing that, the
// message minus a "yaml: line N:" prefix); a shape error adds the line in
// brackets, as spec §4.5 shows it.
export function errorCopy(err: CodedError): string {
  if (err.code === 'yaml_syntax') {
    const detail = (err.detail ?? err.message ?? '')
      .replace(/^yaml:\s*/i, '')
      .replace(/^line \d+:\s*/i, '')
      .replace(/\.$/, '');
    return codeCopy('yaml_syntax', { line: err.line ?? '?', detail: detail || 'the YAML is not valid' });
  }
  const text = codeCopy(err.code, { count: err.count, limit: err.limit, things: err.things });
  return err.line && err.code.startsWith('not_homepage_') ? `${text} (line ${err.line})` : text;
}

// The API's field names, in plain words, for an update row's note.
const FIELD_WORDS: Record<string, string> = {
  name: 'name',
  description: 'description',
  url: 'link',
  icon: 'icon',
  section: 'section',
  clickAction: 'click action',
  gatusKey: 'status key',
  gridWidth: 'width',
  order: 'order',
  favorites: 'favorites',
  collapsedSections: 'folded sections',
  prefs: 'appearance',
  displayName: 'name',
  avatarColor: 'color',
  allowedApps: 'allowed apps',
  suggestedCategory: 'suggested section',
  showUptimeDisplay: 'uptime default',
  statusDegradedMs: 'slow threshold',
};

export function fieldWords(fields: string[]): string {
  return fields.map((f) => FIELD_WORDS[f] ?? f).join(', ');
}
