import { type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  type DocumentData,
} from 'firebase/firestore';

import { demoAuthEnabled, getActiveDemoUser } from '../../../demoAuth';
import { auth, db } from '../../../firebase';
import type { AccessRole, AccessUser } from '../model/types';

const ACCESS_COLLECTION = 'userAccess';
const DEMO_ACCESS_KEY = 'exu.demo.access.v1';

type DemoAccessStore = Record<string, AccessUser>;

function nowText() {
  return new Date().toISOString();
}

export function normalizeAccessEmail(email: string) {
  return email.trim().toLowerCase();
}

function requireCurrentUser(): User {
  const user = auth.currentUser;
  if (!user) throw new Error('Usuario nao autenticado.');
  return user;
}

function readDemoAccessStore(): DemoAccessStore {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(DEMO_ACCESS_KEY) || '{}') as DemoAccessStore;
  } catch {
    return {};
  }
}

function writeDemoAccessStore(store: DemoAccessStore) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(DEMO_ACCESS_KEY, JSON.stringify(store));
}

function seedDemoAccessStore(): DemoAccessStore {
  const store = readDemoAccessStore();
  const now = nowText();
  const defaults: AccessUser[] = [
    {
      email: 'alexandre@demo.local',
      role: 'admin',
      createdAtText: now,
      updatedAtText: now,
      createdByUid: 'system',
    },
    {
      email: 'eduarda@demo.local',
      role: 'admin',
      createdAtText: now,
      updatedAtText: now,
      createdByUid: 'system',
    },
  ];

  let changed = false;
  for (const item of defaults) {
    if (!store[item.email] || store[item.email].role !== item.role) {
      store[item.email] = {
        ...item,
        createdAtText: store[item.email]?.createdAtText || item.createdAtText,
      };
      changed = true;
    }
  }
  if (changed) writeDemoAccessStore(store);
  return store;
}

function accessDoc(email: string) {
  return doc(db, ACCESS_COLLECTION, normalizeAccessEmail(email));
}

function mapAccessUser(data: DocumentData): AccessUser {
  return {
    email: normalizeAccessEmail(String(data.email || '')),
    role: data.role === 'admin' ? 'admin' : 'user',
    createdAtText: String(data.createdAtText || ''),
    updatedAtText: String(data.updatedAtText || ''),
    createdByUid: String(data.createdByUid || ''),
  };
}

export async function getMyAccessUser(): Promise<AccessUser | null> {
  const demoUser = demoAuthEnabled ? getActiveDemoUser() : null;
  if (demoUser) {
    return seedDemoAccessStore()[normalizeAccessEmail(demoUser.email)] || null;
  }

  const user = requireCurrentUser();
  const email = normalizeAccessEmail(user.email || '');
  if (!email) return null;

  const tokenResult = await user.getIdTokenResult();
  if (tokenResult.claims.admin === true) {
    const now = nowText();
    return {
      email,
      role: 'admin',
      createdAtText: now,
      updatedAtText: now,
      createdByUid: user.uid,
    };
  }

  const snapshot = await getDoc(accessDoc(email));
  return snapshot.exists() ? mapAccessUser(snapshot.data()) : null;
}

export async function listAccessUsers(): Promise<AccessUser[]> {
  const demoUser = demoAuthEnabled ? getActiveDemoUser() : null;
  if (demoUser) {
    return Object.values(seedDemoAccessStore()).sort((left, right) =>
      left.email.localeCompare(right.email),
    );
  }

  const snapshot = await getDocs(query(collection(db, ACCESS_COLLECTION), orderBy('email')));
  return snapshot.docs.map((item) => mapAccessUser(item.data()));
}

export async function saveAccessUser(email: string, role: AccessRole): Promise<void> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) throw new Error('Informe um Gmail valido.');

  const demoUser = demoAuthEnabled ? getActiveDemoUser() : null;
  if (demoUser) {
    const store = seedDemoAccessStore();
    const current = store[normalizedEmail];
    const now = nowText();
    store[normalizedEmail] = {
      email: normalizedEmail,
      role,
      createdAtText: current?.createdAtText || now,
      updatedAtText: now,
      createdByUid: current?.createdByUid || demoUser.uid,
    };
    writeDemoAccessStore(store);
    return;
  }

  const user = requireCurrentUser();
  const now = nowText();
  const snapshot = await getDoc(accessDoc(normalizedEmail));
  await setDoc(
    accessDoc(normalizedEmail),
    {
      email: normalizedEmail,
      role,
      createdAtText: snapshot.exists() ? snapshot.data().createdAtText || now : now,
      updatedAtText: now,
      createdByUid: snapshot.exists() ? snapshot.data().createdByUid || user.uid : user.uid,
    },
    { merge: true },
  );
}

export async function removeAccessUser(email: string): Promise<void> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return;

  const demoUser = demoAuthEnabled ? getActiveDemoUser() : null;
  if (demoUser) {
    const store = seedDemoAccessStore();
    delete store[normalizedEmail];
    writeDemoAccessStore(store);
    return;
  }

  await deleteDoc(accessDoc(normalizedEmail));
}
