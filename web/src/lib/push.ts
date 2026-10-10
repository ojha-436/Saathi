import { deleteToken, getMessaging, getToken, isSupported } from "firebase/messaging";
import { getApps } from "firebase/app";
import { api } from "./api";
import { getFbAuth } from "./firebase";

export type PushState = "unsupported" | "denied" | "off" | "on";

async function registration() {
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}

export async function pushState(): Promise<PushState> {
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
  if ((await pushState()) === "unsupported") return "unsupported";
  const perm = await Notification.requestPermission();
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
