import type { IdTokenResult, User as FirebaseUser } from 'firebase/auth';

export type AppUser = Pick<
  FirebaseUser,
  'uid' | 'email' | 'displayName' | 'getIdToken' | 'getIdTokenResult'
> & {
  isDemoUser?: boolean;
};

export type DemoUserProfile = {
  uid: string;
  displayName: string;
  email: string;
  admin: boolean;
};

const STORAGE_KEY = 'exu.demo.user';

export const demoAuthEnabled = String(import.meta.env.VITE_DEMO_AUTH || '') === '1';

export const DEMO_USERS: DemoUserProfile[] = [
  {
    uid: 'alexandre',
    displayName: 'Alexandre',
    email: 'alexandre@demo.local',
    admin: true,
  },
  {
    uid: 'eduarda',
    displayName: 'Eduarda',
    email: 'eduarda@demo.local',
    admin: true,
  },
];

let activeDemoUser: DemoUserProfile | null = null;

function findDemoUser(uid: string | null | undefined) {
  return DEMO_USERS.find((user) => user.uid === uid) || null;
}

function readStoredDemoUserId() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function getActiveDemoUser() {
  if (activeDemoUser) return activeDemoUser;
  const stored = findDemoUser(readStoredDemoUserId());
  activeDemoUser = stored;
  return stored;
}

export function setActiveDemoUser(profile: DemoUserProfile) {
  activeDemoUser = profile;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, profile.uid);
  } catch {
    // Keep the in-memory selection even when localStorage is unavailable.
  }
}

export function clearActiveDemoUser() {
  activeDemoUser = null;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing else to clear.
  }
}

export function isDemoAuthUser(user: AppUser | null): user is AppUser & { isDemoUser: true } {
  return Boolean(user?.isDemoUser);
}

export function createDemoAuthUser(profile: DemoUserProfile): AppUser {
  const token = `demo:${profile.uid}`;

  return {
    uid: profile.uid,
    email: profile.email,
    displayName: profile.displayName,
    isDemoUser: true,
    getIdToken: async () => token,
    getIdTokenResult: async () =>
      ({
        authTime: new Date(0).toISOString(),
        expirationTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        issuedAtTime: new Date().toISOString(),
        signInProvider: 'custom',
        signInSecondFactor: null,
        token,
        claims: {
          admin: profile.admin,
        },
      }) satisfies IdTokenResult,
  };
}
