"use client";

import { useRef, useState } from "react";
import { getFbAuth, apiUrl } from "./firebase";

/** Tap-to-record voice notes with the browser's MediaRecorder (webm/opus on Chrome, mp4/aac on Safari). */
export function useRecorder(maxSeconds = 120) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const rec = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const done = useRef<((b: Blob | null) => void) | null>(null);

  async function start(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const r = new MediaRecorder(stream);
    chunks.current = [];
    r.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timer.current) clearInterval(timer.current);
      setRecording(false);
      done.current?.(chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || "audio/webm" }) : null);
    };
    rec.current = r;
    r.start();
    setSeconds(0);
    setRecording(true);
    timer.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= maxSeconds && r.state === "recording") r.stop();
        return s + 1;
      });
    }, 1000);
  }

  function stop(): Promise<Blob | null> {
    return new Promise((resolve) => {
      done.current = resolve;
      if (rec.current?.state === "recording") rec.current.stop();
      else resolve(null);
    });
  }

  return { recording, seconds, start, stop };
}

export function audioExt(mime: string) {
  return mime.includes("mp4") ? "m4a" : mime.includes("ogg") ? "ogg" : "webm";
}

/** Speech → text via the API (Hindi/Hinglish/English). The audio is not stored. */
export async function transcribe(blob: Blob): Promise<string> {
  const token = await getFbAuth().currentUser?.getIdToken();
  const form = new FormData();
  form.append("audio", blob, `voice.${audioExt(blob.type)}`);
  const res = await fetch(`${apiUrl()}/api/transcribe`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Couldn't transcribe that");
  return (await res.json()).text as string;
}
