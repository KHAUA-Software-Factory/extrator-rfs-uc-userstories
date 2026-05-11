import { type User } from 'firebase/auth';
import {
  addDoc,
  collection,
  collectionGroup,
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
] as const satisfies readonly (keyof SessionDoc)[];

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
    title: 'Nova sessao',
    descriptionText: '',
    requirementsText: '',
    useCasesText: '',
    plantumlText: '',
    diagramModelText: '',
    userStoriesText: '',
    statusText: 'draft',
    createdAtText: now,
    updatedAtText: now,
  };
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
    title: readString(data, 'title'),
    statusText: readString(data, 'statusText'),
    updatedAtText: readString(data, 'updatedAtText'),
  };
}

function mapLoadedSession(uid: string, id: string, data: DocumentData): SessionLoaded {
  return {
    id,
    uid,
    title: readString(data, 'title'),
    descriptionText: readString(data, 'descriptionText'),
    requirementsText: readString(data, 'requirementsText'),
    useCasesText: readString(data, 'useCasesText'),
    plantumlText: readString(data, 'plantumlText'),
    diagramModelText: readString(data, 'diagramModelText'),
    userStoriesText: readString(data, 'userStoriesText'),
    statusText: readString(data, 'statusText'),
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
  const ref = await addDoc(sessionsCollection(user.uid), sessionDefaults());
  return { id: ref.id, uid: user.uid };
}

export async function loadSession(uid: string, sessionId: string): Promise<SessionLoaded> {
  const snapshot = await getDoc(sessionDocument(uid, sessionId));
  if (!snapshot.exists()) throw new Error('Sessao nao encontrada.');
  return mapLoadedSession(uid, snapshot.id, snapshot.data());
}

export async function loadMySession(sessionId: string): Promise<SessionLoaded> {
  const user = requireCurrentUser();
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
  await updateDoc(sessionDocument(uid, sessionId), payload);
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
  const snapshot = await getDocs(
    query(sessionsCollection(user.uid), orderBy('updatedAtText', 'desc')),
  );
  return snapshot.docs.map((item) => mapSessionListItem(item, user.uid));
}

export async function listAllSessionsAsAdmin(): Promise<SessionListItem[]> {
  const snapshot = await getDocs(
    query(collectionGroup(db, 'sessions'), orderBy('updatedAtText', 'desc')),
  );
  return snapshot.docs.map((item) => mapSessionListItem(item, '')).sort(sortByUpdatedAtDesc);
}
