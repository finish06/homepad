// Thin client over the homepad-api endpoints. Same-domain deploy means the
// session cookie is sent automatically; credentials:'include' keeps that
// working through the Vite dev proxy too.

export type User = { id: string; email: string; role: string };

export type ServiceStatus = 'UP' | 'DOWN' | 'DEGRADED' | 'UNKNOWN';

export type Service = {
  id: string;
  slug: string;
  name: string;
  description: string;
  url: string;
  icon: string;
  status: ServiceStatus;
};

export type Result = { ok: boolean; status: number; error?: string };

const jsonHeaders = { 'Content-Type': 'application/json' };

async function errorText(res: Response): Promise<string> {
  const text = (await res.text()).trim();
  return text || `request failed (${res.status})`;
}

export async function me(): Promise<User | null> {
  const res = await fetch('/api/me', { credentials: 'include' });
  return res.status === 200 ? ((await res.json()) as User) : null;
}

export async function login(email: string, password: string): Promise<Result & { user?: User }> {
  const res = await fetch('/api/login', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 200) return { ok: true, status: 200, user: (await res.json()) as User };
  return { ok: false, status: res.status, error: await errorText(res) };
}

export async function register(email: string, password: string): Promise<Result> {
  const res = await fetch('/api/register', {
    method: 'POST',
    headers: jsonHeaders,
    credentials: 'include',
    body: JSON.stringify({ email, password }),
  });
  if (res.status === 201) return { ok: true, status: 201 };
  return { ok: false, status: res.status, error: await errorText(res) };
}

export async function logout(): Promise<void> {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
}

export async function services(): Promise<Service[]> {
  const res = await fetch('/api/services', { credentials: 'include' });
  if (res.status !== 200) return [];
  const data = (await res.json()) as { services: Service[] };
  return data.services ?? [];
}
