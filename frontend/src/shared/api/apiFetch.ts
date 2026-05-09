import { auth } from '../../firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '';

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';

  const headers = new Headers(init?.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const url = API_BASE_URL ? `${API_BASE_URL}${path}` : path;
  return fetch(url, { ...init, headers });
}

