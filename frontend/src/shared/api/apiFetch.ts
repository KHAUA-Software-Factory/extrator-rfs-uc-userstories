import { auth } from '../../firebase';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string) || '';

function getApiTarget(path: string) {
  return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
}

function getApiHostLabel(path: string) {
  if (API_BASE_URL) return API_BASE_URL;
  if (typeof window !== 'undefined') return window.location.origin;
  return path;
}

function getNetworkErrorMessage(path: string, error: unknown) {
  const detail = error instanceof Error ? error.message : String(error);
  return [
    `Não foi possível conectar à API em ${getApiHostLabel(path)}.`,
    'Verifique se o certificado SSL do subdomínio da API está válido e se o backend está ativo.',
    `Detalhe técnico: ${detail}`,
  ].join(' ');
}

export async function assertApiOk(res: Response): Promise<void> {
  if (res.ok) return;

  const text = await res.text();
  let apiError: { error?: string; detail?: string } | null = null;
  try {
    apiError = JSON.parse(text) as { error?: string; detail?: string };
  } catch {
    apiError = null;
  }

  const apiMessage = apiError ? [apiError.error, apiError.detail].filter(Boolean).join(': ') : '';
  if (apiMessage) {
    throw new Error(apiMessage);
  }

  if (text.trim().startsWith('<')) {
    throw new Error(
      `API respondeu com status ${res.status}. Verifique a configuração do Node/Passenger no servidor.`,
    );
  }
  throw new Error(text || `API respondeu com status ${res.status}.`);
}

export async function readApiJson<T>(res: Response): Promise<T> {
  await assertApiOk(res);
  return res.json() as Promise<T>;
}

export async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  const token = user ? await user.getIdToken() : '';

  const headers = new Headers(init?.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  try {
    return await fetch(getApiTarget(path), { ...init, headers });
  } catch (error) {
    throw new Error(getNetworkErrorMessage(path, error));
  }
}
