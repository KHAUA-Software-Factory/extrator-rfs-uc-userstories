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

import { auth, db } from '../../../firebase';
import type { AccessRole, AccessUser } from '../model/types';

const ACCESS_COLLECTION = 'userAccess';
const BOOTSTRAP_ADMIN_EMAILS = new Set(
  String(import.meta.env.VITE_BOOTSTRAP_ADMIN_EMAILS || 'khauatech@gmail.com')
    .split(',')
    .map((email) => normalizeAccessEmail(email))
    .filter(Boolean),
);

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

function accessDoc(email: string) {
  return doc(db, ACCESS_COLLECTION, normalizeAccessEmail(email));
}

function normalizeAccessRole(role: unknown): AccessRole {
  if (role === 'master' || role === 'admin') return 'admin';
  return 'user';
}

function isBootstrapAdminEmail(email: string) {
  return BOOTSTRAP_ADMIN_EMAILS.has(normalizeAccessEmail(email));
}

function mapAccessUser(data: DocumentData): AccessUser {
  return {
    email: normalizeAccessEmail(String(data.email || '')),
    role: normalizeAccessRole(data.role),
    createdAtText: String(data.createdAtText || ''),
    updatedAtText: String(data.updatedAtText || ''),
    createdByUid: String(data.createdByUid || ''),
  };
}

export async function getMyAccessUser(): Promise<AccessUser | null> {
  const user = requireCurrentUser();
  const email = normalizeAccessEmail(user.email || '');
  if (!email) return null;

  const tokenResult = await user.getIdTokenResult();
  if (tokenResult.claims.admin === true || isBootstrapAdminEmail(email)) {
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
  const snapshot = await getDocs(query(collection(db, ACCESS_COLLECTION), orderBy('email')));
  return snapshot.docs.map((item) => mapAccessUser(item.data()));
}

export async function saveAccessUser(email: string, role: AccessRole): Promise<void> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) throw new Error('Informe um Gmail valido.');

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

  await deleteDoc(accessDoc(normalizedEmail));
}
