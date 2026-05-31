import { addDoc, collection } from 'firebase/firestore';

import { auth, db } from '../firebase';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogEventInput = {
  event: string;
  level?: LogLevel;
  message?: string;
  details?: unknown;
  persist?: boolean;
};

type LogEntry = {
  event: string;
  level: LogLevel;
  message: string;
  source: 'client';
  actorUid: string;
  actorEmail: string;
  sessionId: string;
  createdAtText: string;
  details: unknown;
};

const AUDIT_COLLECTION = 'auditLogs';
const ENABLE_PERSISTENCE = String(import.meta.env.VITE_ENABLE_AUDIT_LOGS || 'true') !== 'false';

function nowText() {
  return new Date().toISOString();
}

function getActorUid() {
  return auth.currentUser?.uid || '';
}

function getActorEmail() {
  return auth.currentUser?.email || '';
}

function getSessionId() {
  const user = auth.currentUser;
  if (!user) return '';
  return `${user.uid}:${user.email || ''}`;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (typeof value === 'string') {
    return value.length > 500 ? `${value.slice(0, 497)}...` : value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    if (depth >= 2) return `[Array(${value.length})]`;
    return value.slice(0, 20).map((item) => redactValue(item, depth + 1));
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack || '',
    };
  }
  if (typeof value === 'object') {
    if (depth >= 2) return '[Object]';
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (/key|token|secret|password|authorization/i.test(key)) {
        result[key] = '[REDACTED]';
        continue;
      }
      result[key] = redactValue(item, depth + 1);
    }
    return result;
  }
  return String(value);
}

function buildEntry(input: LogEventInput): LogEntry {
  return {
    event: input.event,
    level: input.level || 'info',
    message: input.message || input.event,
    source: 'client',
    actorUid: getActorUid(),
    actorEmail: getActorEmail(),
    sessionId: getSessionId(),
    createdAtText: nowText(),
    details: redactValue(input.details ?? null),
  };
}

function writeConsole(entry: LogEntry) {
  const payload = {
    event: entry.event,
    message: entry.message,
    actorUid: entry.actorUid,
    actorEmail: entry.actorEmail,
    sessionId: entry.sessionId,
    details: entry.details,
    createdAtText: entry.createdAtText,
  };

  if (entry.level === 'error') {
    console.error(`[${entry.event}]`, payload);
    return;
  }

  if (entry.level === 'warn') {
    console.warn(`[${entry.event}]`, payload);
    return;
  }

  if (entry.level === 'debug') {
    console.debug(`[${entry.event}]`, payload);
    return;
  }

  console.info(`[${entry.event}]`, payload);
}

async function persistEntry(entry: LogEntry) {
  if (!ENABLE_PERSISTENCE) return;
  if (!auth.currentUser) return;

  try {
    await addDoc(collection(db, AUDIT_COLLECTION), entry);
  } catch (error) {
    console.warn('[audit.log.persistence_failed]', {
      event: entry.event,
      message: (error as Error).message,
    });
  }
}

export function logEvent(input: LogEventInput) {
  const entry = buildEntry(input);
  writeConsole(entry);
  if (input.persist || entry.level === 'warn' || entry.level === 'error') {
    void persistEntry(entry);
  }
}

export function logError(event: string, error: unknown, details?: unknown) {
  logEvent({
    event,
    level: 'error',
    persist: true,
    message: error instanceof Error ? error.message : event,
    details: {
      error,
      ...(details && typeof details === 'object' ? (details as Record<string, unknown>) : {}),
    },
  });
}
