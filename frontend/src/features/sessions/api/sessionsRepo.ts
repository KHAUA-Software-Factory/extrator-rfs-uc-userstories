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

import { demoAuthEnabled, getActiveDemoUser, type DemoUserProfile } from '../../../demoAuth';
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

const DEMO_SESSIONS_KEY = 'exu.demo.sessions.v1';

type DemoSessionsStore = Record<string, Record<string, SessionDoc>>;

function requireCurrentUser(): User {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user;
}

function getDemoUser() {
  return demoAuthEnabled ? getActiveDemoUser() : null;
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

function readDemoSessionsStore(): DemoSessionsStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_SESSIONS_KEY) || '{}') as DemoSessionsStore;
  } catch {
    return {};
  }
}

function writeDemoSessionsStore(store: DemoSessionsStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_SESSIONS_KEY, JSON.stringify(store));
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

function mapDemoSessions(profile: DemoUserProfile, sessions: Record<string, SessionDoc>) {
  return Object.entries(sessions)
    .map(([id, data]) => ({
      id,
      uid: profile.uid,
      title: data.title,
      statusText: data.statusText,
      updatedAtText: data.updatedAtText,
    }))
    .sort(sortByUpdatedAtDesc);
}

export async function createSession(): Promise<{ id: string; uid: string }> {
  const demoUser = getDemoUser();
  if (demoUser) {
    const store = readDemoSessionsStore();
    const id = crypto.randomUUID();
    store[demoUser.uid] = {
      ...(store[demoUser.uid] || {}),
      [id]: sessionDefaults(),
    };
    writeDemoSessionsStore(store);
    return { id, uid: demoUser.uid };
  }

  const user = requireCurrentUser();
  const ref = await addDoc(sessionsCollection(user.uid), sessionDefaults());
  return { id: ref.id, uid: user.uid };
}

export async function loadSession(uid: string, sessionId: string): Promise<SessionLoaded> {
  const demoUser = getDemoUser();
  if (demoUser) {
    const session = readDemoSessionsStore()[uid]?.[sessionId];
    if (!session) throw new Error('Sessao nao encontrada.');
    return { ...session, id: sessionId, uid };
  }

  const snapshot = await getDoc(sessionDocument(uid, sessionId));
  if (!snapshot.exists()) throw new Error('Sessao nao encontrada.');
  return mapLoadedSession(uid, snapshot.id, snapshot.data());
}

export async function loadMySession(sessionId: string): Promise<SessionLoaded> {
  const demoUser = getDemoUser();
  if (demoUser) return loadSession(demoUser.uid, sessionId);

  const user = requireCurrentUser();
  return loadSession(user.uid, sessionId);
}

export async function updateSession(
  uid: string,
  sessionId: string,
  patch: Partial<SessionDoc>,
): Promise<void> {
  const demoUser = getDemoUser();
  if (demoUser) {
    const store = readDemoSessionsStore();
    const current = store[uid]?.[sessionId];
    if (!current) throw new Error('Sessao nao encontrada.');
    store[uid][sessionId] = {
      ...current,
      ...sanitizeSessionPatch(patch),
      updatedAtText: nowText(),
    };
    writeDemoSessionsStore(store);
    return;
  }

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
  const demoUser = getDemoUser();
  if (demoUser) return updateSession(demoUser.uid, sessionId, patch);

  const user = requireCurrentUser();
  return updateSession(user.uid, sessionId, patch);
}

export async function listMySessions(): Promise<SessionListItem[]> {
  const demoUser = getDemoUser();
  if (demoUser) {
    return mapDemoSessions(demoUser, readDemoSessionsStore()[demoUser.uid] || {});
  }

  const user = requireCurrentUser();
  const snapshot = await getDocs(
    query(sessionsCollection(user.uid), orderBy('updatedAtText', 'desc')),
  );
  return snapshot.docs.map((item) => mapSessionListItem(item, user.uid));
}

export async function listAllSessionsAsAdmin(): Promise<SessionListItem[]> {
  const demoUser = getDemoUser();
  if (demoUser) {
    const store = readDemoSessionsStore();
    return Object.entries(store)
      .flatMap(([uid, sessions]) => mapDemoSessions({ ...demoUser, uid }, sessions))
      .sort(sortByUpdatedAtDesc);
  }

  const snapshot = await getDocs(
    query(collectionGroup(db, 'sessions'), orderBy('updatedAtText', 'desc')),
  );
  return snapshot.docs.map((item) => mapSessionListItem(item, '')).sort(sortByUpdatedAtDesc);
}
