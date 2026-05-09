import { apiFetch, readApiJson } from '../../../shared/api/apiFetch';
import type { SessionDoc, SessionListItem, SessionLoaded } from '../model/types';

async function readJson<T>(res: Response): Promise<T> {
  return readApiJson(res);
}

export async function createSession(): Promise<{ id: string; uid: string }> {
  const res = await apiFetch('/api/sessions', { method: 'POST', body: '{}' });
  return readJson(res);
}

export async function loadMySession(sessionId: string): Promise<SessionLoaded> {
  const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`);
  return readJson(res);
}

export async function updateMySession(
  sessionId: string,
  patch: Partial<SessionDoc>,
): Promise<void> {
  const res = await apiFetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  await readJson<{ ok: boolean }>(res);
}

export async function listMySessions(): Promise<SessionListItem[]> {
  const res = await apiFetch('/api/sessions');
  const data = await readJson<{ sessions: SessionListItem[] }>(res);
  return data.sessions;
}

export async function listAllSessionsAsAdmin(): Promise<SessionListItem[]> {
  const res = await apiFetch('/api/admin/sessions');
  const data = await readJson<{ sessions: SessionListItem[] }>(res);
  return data.sessions;
}
