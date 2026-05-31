import { type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  updateDoc,
  type DocumentData,
  type DocumentReference,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';
import { logError, logEvent } from '../../../lib/logger';
import type { SessionDoc, SessionListItem, SessionLoaded } from '../model/types';

const SESSION_FIELDS = [
  'title',
  'descriptionText',
  'requirementsText',
  'useCasesText',
  'plantumlText',
  'diagramModelText',
  'userStoriesText',
  'statusText',
  'requirementsLanguage',
] as const satisfies readonly (keyof SessionDoc)[];

const GENERIC_TITLES = new Set([
  'nova analise',
  'nova sessao',
  'sem titulo',
  'analise de requisitos',
]);

function requireCurrentUser(): User {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user;
}

function nowText() {
  return new Date().toISOString();
}

function sessionDefaults(): SessionDoc {
  const now = nowText();
  return {
    title: 'Nova analise',
    descriptionText: '',
    requirementsText: '',
    useCasesText: '',
    plantumlText: '',
    diagramModelText: '',
    userStoriesText: '',
    statusText: 'draft',
    requirementsLanguage: 'pt-BR',
    createdAtText: now,
    updatedAtText: now,
  };
}

function normalizeTitleText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function isGenericTitle(title: string) {
  return !title.trim() || GENERIC_TITLES.has(normalizeTitleText(title));
}

export function buildSessionTitleFromDescription(descriptionText: string) {
  const clean = descriptionText.replace(/\s+/g, ' ').trim();
  if (!clean) return 'Nova analise';

  const firstIdea = clean.split(/[.!?\n]/)[0]?.trim() || clean;
  const withoutPrefix = firstIdea.replace(
    /^(sistema|projeto|aplicacao|aplicação)\s*[:\-–]\s*/i,
    '',
  );
  const title = (withoutPrefix || firstIdea).trim();
  return title.length > 72 ? `${title.slice(0, 69).trim()}...` : title;
}

function resolveSessionTitle(data: DocumentData) {
  const title = readString(data, 'title');
  const descriptionText = readString(data, 'descriptionText');
  if (isGenericTitle(title) && descriptionText.trim()) {
    return buildSessionTitleFromDescription(descriptionText);
  }
  return title || buildSessionTitleFromDescription(descriptionText);
}

function sessionsCollection(uid: string) {
  return collection(db, 'users', uid, 'sessions');
}

function sessionDocument(uid: string, sessionId: string) {
  return doc(db, 'users', uid, 'sessions', sessionId);
}

function readString(data: DocumentData, field: keyof SessionDoc) {
  return String(data[field] || '');
}

function getSessionUid(ref: DocumentReference<DocumentData>) {
  return ref.parent.parent?.id || '';
}

function mapSessionListItem(
  snapshot: QueryDocumentSnapshot<DocumentData>,
  fallbackUid: string,
): SessionListItem {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    uid: getSessionUid(snapshot.ref) || fallbackUid,
    title: resolveSessionTitle(data),
    statusText: readString(data, 'statusText'),
    updatedAtText: readString(data, 'updatedAtText'),
    hasUserStories: Boolean(readString(data, 'userStoriesText').trim()),
  };
}

function mapLoadedSession(uid: string, id: string, data: DocumentData): SessionLoaded {
  return {
    id,
    uid,
    title: resolveSessionTitle(data),
    descriptionText: readString(data, 'descriptionText'),
    requirementsText: readString(data, 'requirementsText'),
    useCasesText: readString(data, 'useCasesText'),
    plantumlText: readString(data, 'plantumlText'),
    diagramModelText: readString(data, 'diagramModelText'),
    userStoriesText: readString(data, 'userStoriesText'),
    statusText: readString(data, 'statusText'),
    requirementsLanguage: readString(data, 'requirementsLanguage') || 'pt-BR',
    createdAtText: readString(data, 'createdAtText'),
    updatedAtText: readString(data, 'updatedAtText'),
  };
}

function sanitizeSessionPatch(patch: Partial<SessionDoc>) {
  const next: Partial<SessionDoc> = {};
  for (const field of SESSION_FIELDS) {
    if (field in patch) {
      next[field] = String(patch[field] || '');
    }
  }
  return next;
}

function sortByUpdatedAtDesc(left: SessionListItem, right: SessionListItem) {
  return right.updatedAtText.localeCompare(left.updatedAtText);
}

export async function createSession(): Promise<{ id: string; uid: string }> {
  const user = requireCurrentUser();
  logEvent({ event: 'session.create.started', persist: true, details: { uid: user.uid } });

  try {
    const ref = await addDoc(sessionsCollection(user.uid), sessionDefaults());
    logEvent({
      event: 'session.create.succeeded',
      persist: true,
      details: { uid: user.uid, id: ref.id },
    });
    return { id: ref.id, uid: user.uid };
  } catch (error) {
    logError('session.create.failed', error, { uid: user.uid });
    throw error;
  }
}

export async function loadSession(uid: string, sessionId: string): Promise<SessionLoaded> {
  logEvent({ event: 'session.load.started', details: { uid, sessionId } });

  try {
    const snapshot = await getDoc(sessionDocument(uid, sessionId));
    if (!snapshot.exists()) {
      const error = new Error('Sessao nao encontrada.');
      logError('session.load.not_found', error, { uid, sessionId });
      throw error;
    }

    const loaded = mapLoadedSession(uid, snapshot.id, snapshot.data());
    logEvent({ event: 'session.load.succeeded', details: { uid, sessionId } });
    return loaded;
  } catch (error) {
    if (!(error instanceof Error && error.message === 'Sessao nao encontrada.')) {
      logError('session.load.failed', error, { uid, sessionId });
    }
    throw error;
  }
}

export async function loadMySession(sessionId: string): Promise<SessionLoaded> {
  const user = requireCurrentUser();
  logEvent({ event: 'session.load_my.started', details: { uid: user.uid, sessionId } });
  return loadSession(user.uid, sessionId);
}

export async function updateSession(
  uid: string,
  sessionId: string,
  patch: Partial<SessionDoc>,
): Promise<void> {
  const payload = {
    ...sanitizeSessionPatch(patch),
    updatedAtText: nowText(),
  };
  logEvent({
    event: 'session.update.started',
    persist: true,
    details: { uid, sessionId, fields: Object.keys(payload) },
  });
  try {
    await updateDoc(sessionDocument(uid, sessionId), payload);
    logEvent({ event: 'session.update.succeeded', persist: true, details: { uid, sessionId } });
  } catch (error) {
    logError('session.update.failed', error, { uid, sessionId });
    throw error;
  }
}

export async function deleteSession(uid: string, sessionId: string): Promise<void> {
  logEvent({ event: 'session.delete.started', persist: true, details: { uid, sessionId } });
  try {
    await deleteDoc(sessionDocument(uid, sessionId));
    logEvent({
      event: 'session.delete.succeeded',
      persist: true,
      details: { uid, sessionId },
    });
  } catch (error) {
    logError('session.delete.failed', error, { uid, sessionId });
    throw error;
  }
}

export async function updateMySession(
  sessionId: string,
  patch: Partial<SessionDoc>,
): Promise<void> {
  const user = requireCurrentUser();
  return updateSession(user.uid, sessionId, patch);
}

export async function listMySessions(): Promise<SessionListItem[]> {
  const user = requireCurrentUser();
  logEvent({ event: 'session.list_my.started', details: { uid: user.uid } });
  try {
    const snapshot = await getDocs(
      query(sessionsCollection(user.uid), orderBy('updatedAtText', 'desc')),
    );
    const items = snapshot.docs.map((item) => mapSessionListItem(item, user.uid));
    logEvent({
      event: 'session.list_my.succeeded',
      persist: true,
      details: { uid: user.uid, count: items.length },
    });
    return items;
  } catch (error) {
    logError('session.list_my.failed', error, { uid: user.uid });
    throw error;
  }
}

export async function listAllSessionsAsAdmin(): Promise<SessionListItem[]> {
  logEvent({ event: 'session.list_all.started' });
  try {
    const snapshot = await getDocs(collectionGroup(db, 'sessions'));
    const items = snapshot.docs.map((item) => mapSessionListItem(item, '')).sort(sortByUpdatedAtDesc);
    logEvent({ event: 'session.list_all.succeeded', persist: true, details: { count: items.length } });
    return items;
  } catch (error) {
    logError('session.list_all.failed', error);
    throw error;
  }
}
