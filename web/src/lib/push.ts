import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { getApps } from "firebase/app";
import { api } from "./api";
import { getFbAuth } from "./firebase";

export type PushState = "unsupported" | "install" | "denied" | "off" | "on";

/** iPhone/iPad Safari only allows web push for sites added to the Home Screen and opened from there. */
export function iosNeedsInstall(): boolean {
  if (typeof window === "undefined") return false;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return ios && !standalone;
}

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushState(): Promise<PushState> {
  if (iosNeedsInstall()) return "install";
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator) || !(await isSupported())) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  try {
    return localStorage.getItem("saathi.push") === "on" ? "on" : "off";
  } catch {
    return "off";
  }
}

/** Asks for permission, registers the service worker and this browser's FCM token with the API. */
export async function enablePush(): Promise<PushState> {
  if (iosNeedsInstall()) return "install";
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return "unsupported";
  // Ask first, while the tap still counts as a user gesture (iOS rejects prompts that come after other async work)
  const perm = await Notification.requestPermission();
  if (!(await isSupported())) return "unsupported";
  if (perm !== "granted") return perm === "denied" ? "denied" : "off";
  getFbAuth(); // make sure the Firebase app is initialised
  const reg = await registration();
  const token = await getToken(getMessaging(getApps()[0]), { serviceWorkerRegistration: reg });
  await api("/api/me/push", { json: { token, enabled: true } });
  try {
    localStorage.setItem("saathi.push", "on");
  } catch {}
  return "on";
}

export async function disablePush(): Promise<PushState> {
  try {
    const reg = await registration();
    const messaging = getMessaging(getApps()[0]);
    const token = await getToken(messaging, { serviceWorkerRegistration: reg });
    await api("/api/me/push", { json: { token, enabled: false } });
    await deleteToken(messaging);
  } catch {}
  try {
    localStorage.setItem("saathi.push", "off");
  } catch {}
  return "off";
}
