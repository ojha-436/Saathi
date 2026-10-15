"use client";

import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut as fbSignOut,
  updateProfile,
} from "firebase/auth";
import { clientConfig } from "./config";
import { apiUrl, getFbAuth } from "./firebase";

/**
 * Auth facade. In the cloud it forwards to Firebase Auth; with SAATHI_LOCAL=1 it signs in against the local
 * Saathi API instead ("local:<uid>" tokens), so the app runs with no Firebase project.
 */
export type AuthUser = { uid: string; email: string | null; emailVerified?: boolean };

export const isLocal = () => clientConfig().localMode;

const KEY = "saathi_local_user";
type Stored = { uid: string; token: string; email: string };
const listeners = new Set<(u: AuthUser | null) => void>();

function readStored(): Stored | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}
const toUser = (s: Stored | null): AuthUser | null => (s ? { uid: s.uid, email: s.email, emailVerified: true } : null);
const emit = () => listeners.forEach((fn) => fn(toUser(readStored())));

const authError = (code: string, message: string) => Object.assign(new Error(message), { code });

async function localPost(path: string, body: unknown): Promise<Stored> {
  const res = await fetch(`${apiUrl()}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    if (res.status === 401) throw authError("auth/invalid-credential", detail);
    if (res.status === 409) throw authError("auth/email-already-in-use", detail);
    throw authError("auth/invalid-email", detail);
  }
  return res.json();
}

export function onAuth(cb: (u: AuthUser | null) => void): () => void {
  if (!isLocal()) return onAuthStateChanged(getFbAuth(), (u) => cb(u ? { uid: u.uid, email: u.email, emailVerified: u.emailVerified } : null));
  listeners.add(cb);
  cb(toUser(readStored()));
  return () => void listeners.delete(cb);
}

export async function signInWithPassword(email: string, password: string): Promise<void> {
  if (!isLocal()) {
    const cred = await signInWithEmailAndPassword(getFbAuth(), email, password);
    const isDemo = email.endsWith("@saathi.demo");
    if (!isDemo && !cred.user.emailVerified) {
      await fbSignOut(getFbAuth());
      const err = new Error("Please verify your email address before signing in. Check your inbox (and spam folder) for the verification link.");
      (err as unknown as { code: string }).code = "auth/unverified-email";
      throw err;
    }
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(await localPost("/api/local/login", { email, password })));
  emit();
}

export async function resendVerificationFor(email: string, password: string): Promise<void> {
  if (!isLocal()) {
    const cred = await signInWithEmailAndPassword(getFbAuth(), email, password);
    try {
      await sendEmailVerification(cred.user);
    } finally {
      await fbSignOut(getFbAuth());
    }
  }
}

export async function signUpWithPassword(email: string, password: string, name: string): Promise<void> {
  if (!isLocal()) {
    const cred = await createUserWithEmailAndPassword(getFbAuth(), email, password);
    await updateProfile(cred.user, { displayName: name });
    await sendEmailVerification(cred.user);
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(await localPost("/api/local/signup", { email, password, name })));
  emit();
}

/**
 * Invite links: the link reached the invited mailbox, so the server marks the email verified when the invite is accepted.
 * These skip Firebase's own verification email and the "verify first" check that /login applies.
 */
export async function createAccountForInvite(email: string, password: string, name: string): Promise<void> {
  if (!isLocal()) {
    const cred = await createUserWithEmailAndPassword(getFbAuth(), email, password);
    await updateProfile(cred.user, { displayName: name });
    await cred.user.getIdToken(true); // the name claim rides on the token the invite is accepted with
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(await localPost("/api/local/signup", { email, password, name })));
  emit();
}

export async function signInForInvite(email: string, password: string): Promise<void> {
  if (!isLocal()) {
    await signInWithEmailAndPassword(getFbAuth(), email, password);
    return;
  }
  localStorage.setItem(KEY, JSON.stringify(await localPost("/api/local/login", { email, password })));
  emit();
}

export async function signOut(): Promise<void> {
  if (!isLocal()) return fbSignOut(getFbAuth());
  localStorage.removeItem(KEY);
  emit();
}

export async function getToken(): Promise<string | undefined> {
  if (!isLocal()) return getFbAuth().currentUser?.getIdToken();
  return readStored()?.token;
}

/** Re-reads the ID token so new workspace claims apply (nothing to do locally). */
export async function refreshToken(): Promise<void> {
  if (!isLocal()) await getFbAuth().currentUser?.getIdToken(true);
}

export async function resendVerification(): Promise<void> {
  if (!isLocal()) {
    const u = getFbAuth().currentUser;
    if (u) await sendEmailVerification(u);
  }
}

export async function reloadUser(): Promise<void> {
  if (!isLocal()) await getFbAuth().currentUser?.reload();
}

export async function sendReset(email: string): Promise<void> {
  if (!isLocal()) await sendPasswordResetEmail(getFbAuth(), email);
}

/** Removes the account that was just created (used when the workspace refuses the email domain). */
export async function deleteCurrentUser(): Promise<void> {
  if (!isLocal()) await getFbAuth().currentUser?.delete();
  else await signOut();
}

export function googleUnavailableLocally() {
  return authError("auth/operation-not-allowed", "Google sign-in isn't available in offline mode.");
}
