import { getToken } from "./auth";
import { apiUrl } from "./firebase";

type Opts = { method?: string; json?: unknown; form?: FormData };

export async function api<T = unknown>(path: string, opts: Opts = {}): Promise<T> {
  const token = await getToken();
  const res = await fetch(apiUrl() + path, {
    method: opts.method ?? (opts.json !== undefined || opts.form ? "POST" : "GET"),
    headers: {
      Authorization: `Bearer ${token}`,
      ...(opts.json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.form,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      detail = (await res.json()).detail ?? detail;
    } catch {}
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}

/** Opens a shared file in a new tab. The tab is opened synchronously so popup blockers allow it. */
export async function openFile(fileId: string) {
  const win = window.open("", "_blank");
  try {
    const token = await getToken();
    const res = await fetch(`${apiUrl()}/api/files/${fileId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error("File not available");
    const url = URL.createObjectURL(await res.blob());
    if (win) win.location.href = url;
    else window.open(url, "_blank");
  } catch (e) {
    win?.close();
    alert((e as Error).message);
  }
}
