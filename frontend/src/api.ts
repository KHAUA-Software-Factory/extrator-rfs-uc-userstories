import { apiFetch } from './shared/api/apiFetch';
import type { FunctionalRequirement, UseCase, UserStory } from './features/analysis/model/types';

export async function ensureClaims(): Promise<{ ok: boolean; admin: boolean; updated?: boolean }> {
  const res = await apiFetch('/api/auth/ensure-claims', { method: 'POST', body: '{}' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export type { FunctionalRequirement, UseCase, UserStory };

export async function extractRequirements(input: {
  text: string;
}): Promise<{ requisitos_funcionais: FunctionalRequirement[] }> {
  const res = await apiFetch('/api/extract-requirements', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function generateUseCases(input: {
  requisitos_funcionais: FunctionalRequirement[];
}): Promise<{ casos_de_uso: UseCase[] }> {
  const res = await apiFetch('/api/generate-use-cases', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function generateUml(input: {
  systemName?: string;
  requisitos_funcionais?: FunctionalRequirement[];
  casos_de_uso?: UseCase[];
}): Promise<{ plantuml: string }> {
  const res = await apiFetch('/api/generate-uml', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function generateUserStories(input: { plantuml: string }): Promise<{ user_stories: UserStory[] }> {
  const res = await apiFetch('/api/generate-user-stories', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
