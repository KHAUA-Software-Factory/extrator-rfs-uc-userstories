import { type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  type DocumentData,
  type Unsubscribe,
} from 'firebase/firestore';

import { auth, db } from '../../../firebase';
import { logError, logEvent } from '../../../lib/logger';
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

  logEvent({ event: 'access.resolve.started', details: { email } });
  const tokenResult = await user.getIdTokenResult();
  if (tokenResult.claims.admin === true || isBootstrapAdminEmail(email)) {
    const now = nowText();
    const accessUser: AccessUser = {
      email,
      role: 'admin',
      createdAtText: now,
      updatedAtText: now,
      createdByUid: user.uid,
    };
    logEvent({ event: 'access.resolve.admin', persist: true, details: { email } });
    return accessUser;
  }

  const snapshot = await getDoc(accessDoc(email));
  const accessUser = snapshot.exists() ? mapAccessUser(snapshot.data()) : null;
  logEvent({
    event: 'access.resolve.succeeded',
    persist: true,
    details: { email, found: Boolean(accessUser), role: accessUser?.role || '' },
  });
  return accessUser;
}

export function watchMyAccessUser(
  onChange: (accessUser: AccessUser | null) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const user = requireCurrentUser();
  const email = normalizeAccessEmail(user.email || '');
  if (!email) {
    onChange(null);
    return () => {};
  }

  let active = true;
  let unsubscribeSnapshot: Unsubscribe = () => {};
  logEvent({ event: 'access.watch.started', details: { email } });

  void (async () => {
    try {
      const tokenResult = await user.getIdTokenResult();
      if (!active) return;

      if (tokenResult.claims.admin === true || isBootstrapAdminEmail(email)) {
        const now = nowText();
        const accessUser: AccessUser = {
          email,
          role: 'admin',
          createdAtText: now,
          updatedAtText: now,
          createdByUid: user.uid,
        };
        logEvent({ event: 'access.watch.admin', persist: true, details: { email } });
        onChange(accessUser);
        return;
      }

      unsubscribeSnapshot = onSnapshot(
        accessDoc(email),
        (snapshot) => {
          if (!active) return;
          const accessUser = snapshot.exists() ? mapAccessUser(snapshot.data()) : null;
          logEvent({
            event: 'access.watch.changed',
            persist: true,
            details: { email, exists: Boolean(accessUser), role: accessUser?.role || '' },
          });
          onChange(accessUser);
        },
        (error) => {
          if (!active) return;
          logError('access.watch.failed', error, { email });
          onError?.(error as Error);
        },
      );
    } catch (error) {
      if (active) {
        logError('access.watch.failed', error, { email });
        onError?.(error as Error);
      }
    }
  })();

  return () => {
    active = false;
    unsubscribeSnapshot();
    logEvent({ event: 'access.watch.stopped', details: { email } });
  };
}

export async function listAccessUsers(): Promise<AccessUser[]> {
  logEvent({ event: 'access.list.started' });
  try {
    const snapshot = await getDocs(query(collection(db, ACCESS_COLLECTION), orderBy('email')));
    const items = snapshot.docs.map((item) => mapAccessUser(item.data()));
    logEvent({ event: 'access.list.succeeded', persist: true, details: { count: items.length } });
    return items;
  } catch (error) {
    logError('access.list.failed', error);
    throw error;
  }
}

export async function saveAccessUser(email: string, role: AccessRole): Promise<void> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) throw new Error('Informe um Gmail valido.');

  requireCurrentUser();
  logEvent({
    event: 'access.save.started',
    persist: true,
    details: { email: normalizedEmail, role },
  });
  try {
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
    logEvent({
      event: 'access.save.succeeded',
      persist: true,
      details: { email: normalizedEmail, role },
    });
  } catch (error) {
    logError('access.save.failed', error, { email: normalizedEmail, role });
    throw error;
  }
}

export async function removeAccessUser(email: string): Promise<void> {
  const normalizedEmail = normalizeAccessEmail(email);
  if (!normalizedEmail) return;

  requireCurrentUser();
  logEvent({
    event: 'access.remove.started',
    persist: true,
    details: { email: normalizedEmail },
  });
  try {
    await deleteDoc(accessDoc(normalizedEmail));
    logEvent({
      event: 'access.remove.succeeded',
      persist: true,
      details: { email: normalizedEmail },
    });
  } catch (error) {
    logError('access.remove.failed', error, { email: normalizedEmail });
    throw error;
  }
}
