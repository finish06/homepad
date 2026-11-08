import { jsonHeaders, request, type IconVariant, type RequestOpts } from '../../api';

// SPEC-backup-import §8 (TASK-301) — the transfer client: backup, restore and
// Homepage import. Five admin-only routes. Preview and apply share one Plan shape
// (docs/plans/backup-import-plan.md): apply re-plans server-side and answers 409
// with the fresh plan when the catalog moved since the preview. Failures carry a
// stable `code`; the words live in src/library/importCopy.ts.
//
// It lives here, beside the components that use it, so it ships in their lazy
// chunks: in src/api.ts it would sit in the entry chunk for every visitor
// (bundle-budget.test.ts). It goes through api.ts's one fetch wrapper, request().


export type PlanMode = 'merge' | 'replace' | 'import';
export type RestoreMode = 'merge' | 'replace';
export type PlanAction = 'create' | 'update' | 'unchanged' | 'delete' | 'skip';
export type PlanKind = 'section' | 'app' | 'icon' | 'offer' | 'settings' | 'adult' | 'kid';

export type PlanItem = {
  kind: PlanKind;
  name: string;
  action: PlanAction;
  section?: string | null;
  variant?: IconVariant;
  fields?: string[];
  reason?: string;
  warnings?: string[];
  detail?: string;
  icon?: string;
};

export type PlanSummary = {
  create: { sections: number; apps: number; icons: number; offers: number; kids: number };
  update: { sections: number; apps: number; icons: number; offers: number; people: number; settings: number };
  delete: { sections: number; apps: number; offers: number };
  unchanged: number;
  skipped: number;
};

export type Plan = {
  planHash?: string;
  mode: PlanMode;
  summary: PlanSummary;
  items: PlanItem[];
  warnings: { code: string; count: number }[];
  ignored: { fields: number; settings: string[]; dropped: string[] };
  gatusSnippet?: string;
  otherAccounts: number;
  applied?: boolean;
};

export type HomepageFile = 'services' | 'bookmarks' | 'settings';
export type HomepageTexts = { services: string; bookmarks?: string; settings?: string };

type TransferErrorExtra = {
  file?: HomepageFile;
  line?: number;
  count?: number;
  limit?: number;
  things?: string;
  plan?: Plan;
};

// TransferError — every failure of the five routes. `code` is the API's stable
// code, or one of three the client derives: `network` (no response), `too_large`
// (a plain-text 413 from a proxy in front of the API), `plan_changed` (a plain
// 409), and `failed` for anything else.
export class TransferError extends Error {
  code: string;
  status: number;
  file?: HomepageFile;
  line?: number;
  count?: number;
  limit?: number;
  things?: string;
  plan?: Plan;

  constructor(code: string, status: number, message: string, extra: TransferErrorExtra = {}) {
    super(message);
    this.name = 'TransferError';
    this.code = code;
    this.status = status;
    Object.assign(this, extra);
  }
}

function isPlan(v: unknown): v is Plan {
  return !!v && typeof v === 'object' && Array.isArray((v as Plan).items) && typeof (v as Plan).summary === 'object';
}

async function transferFailure(status: number, res: Response | null): Promise<TransferError> {
  if (!res) return new TransferError('network', 0, 'network error');
  const text = await res.text();
  try {
    const body = JSON.parse(text) as { code?: unknown; message?: unknown } & TransferErrorExtra;
    if (body && typeof body.code === 'string') {
      const { file, line, count, limit, things, plan } = body;
      return new TransferError(body.code, status, typeof body.message === 'string' ? body.message : body.code, {
        file,
        line,
        count,
        limit,
        things,
        plan: isPlan(plan) ? plan : undefined,
      });
    }
  } catch {
    // A plain-text body (a proxy page, the shared 401/403 handlers) — fall through.
  }
  const code = status === 413 ? 'too_large' : status === 409 ? 'plan_changed' : 'failed';
  return new TransferError(code, status, text.trim() || `request failed (${status})`);
}

async function planRequest(path: string, opts: RequestOpts): Promise<Plan> {
  const { status, res } = await request(path, { method: 'POST', ...opts });
  if (!res || status !== 200) throw await transferFailure(status, res);
  let data: unknown;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!isPlan(data)) throw new TransferError('failed', status, 'unexpected response');
  return data;
}

// exportUrl — GET /api/admin/export. people=false leaves the `people` key, and
// every email address, out of the file (AC-003).
export function exportUrl(people: boolean): string {
  return `/api/admin/export?people=${people}`;
}

const pad = (n: number) => String(n).padStart(2, '0');
function backupFilename(d = new Date()): string {
  return `homepad-backup-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}

// downloadBackup — fetches the export as a Blob, so the UI can say "Preparing…"
// and show an error (UX §2), which a bare <a download> can't. The name comes
// from the server's Content-Disposition (AC-001), with the same pattern locally
// as a fallback.
export async function downloadBackup(people: boolean): Promise<{ blob: Blob; filename: string }> {
  const { status, res } = await request(exportUrl(people));
  if (!res || status !== 200) throw await transferFailure(status, res);
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const m = disposition.match(/filename="?([^";]+)"?/i);
  return { blob: await res.blob(), filename: m ? m[1] : backupFilename() };
}

// previewRestore — the plan for restoring `file` in `mode`. Changes nothing (AC-007).
export async function previewRestore(file: Blob, mode: RestoreMode): Promise<Plan> {
  return planRequest(`/api/admin/restore/preview?mode=${mode}`, { headers: jsonHeaders, body: file });
}

// applyRestore — sends the same file with the preview's hash (AC-008).
export async function applyRestore(file: Blob, mode: RestoreMode, planHash: string): Promise<Plan> {
  return planRequest(`/api/admin/restore?mode=${mode}&plan=${encodeURIComponent(planHash)}`, {
    headers: jsonHeaders,
    body: file,
  });
}

// Only services.yaml is required; an empty optional file is left out.
function homepageBody(texts: HomepageTexts): HomepageTexts {
  const body: HomepageTexts = { services: texts.services };
  if (texts.bookmarks?.trim()) body.bookmarks = texts.bookmarks;
  if (texts.settings?.trim()) body.settings = texts.settings;
  return body;
}

// previewHomepageImport — the plan for importing Homepage's YAML (AC-019).
export async function previewHomepageImport(texts: HomepageTexts): Promise<Plan> {
  return planRequest('/api/admin/import/homepage/preview', { json: homepageBody(texts) });
}

// applyHomepageImport — the same texts with the preview's hash.
export async function applyHomepageImport(texts: HomepageTexts, planHash: string): Promise<Plan> {
  return planRequest(`/api/admin/import/homepage?plan=${encodeURIComponent(planHash)}`, { json: homepageBody(texts) });
}
