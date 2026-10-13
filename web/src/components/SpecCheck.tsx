"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, FileText, FileUp, Info, Loader2, Octagon, RefreshCw, ScanText, ShieldCheck, Trash2, X } from "@/lib/icons";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, openFile } from "@/lib/api";
import { getFbAuth, apiUrl } from "@/lib/firebase";
import type { Message, SpecCheck, SpecLimit, SpecRow, SpecSummary, SpecVerdict, StandardDoc } from "@/lib/types";
import { useWs } from "./ctx";
import { ReportDialog, type RecordDraftResult } from "./Quality";

const VERDICT: Record<SpecVerdict, { label: string; cls: string; icon: typeof Octagon }> = {
  pass: { label: "Spec check passed", cls: "border-moss/30 bg-moss-soft text-moss", icon: CheckCircle2 },
  fail: { label: "Spec check failed", cls: "border-rust/30 bg-rust-soft text-rust", icon: Octagon },
  incomplete: { label: "Spec check incomplete", cls: "border-saffron/40 bg-saffron-soft text-saffron-ink", icon: AlertTriangle },
  no_limits: { label: "No approved limits", cls: "border-border bg-canvas text-muted", icon: Info },
};

function summaryText(s: SpecSummary) {
  if (s.verdict === "fail") return `${s.fails} limit${s.fails === 1 ? "" : "s"} exceeded${s.missing ? ` · ${s.missing} required test${s.missing === 1 ? "" : "s"} missing` : ""}`;
  if (s.verdict === "incomplete") return `${s.missing} required test${s.missing === 1 ? "" : "s"} not reported`;
  if (s.verdict === "no_limits") return `add ${s.grade || "the grade"} to the Standards Library`;
  return `${s.grade} · every reported value within limits`;
}

/** Verdict strip shown under a certificate's file card in chat (a separate button: the card itself opens the PDF). */
export function SpecBadge({ file, chatId }: { file: NonNullable<Message["file"]>; chatId: string }) {
  const [open, setOpen] = useState(false);
  if (!file.spec) return null;
  const v = VERDICT[file.spec.verdict];
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={clsx("mt-1 flex w-full max-w-md items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition hover:brightness-[0.98]", v.cls)}
      >
        <v.icon size={14} className="shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">
          <b>{v.label}</b>
          <span className="opacity-80">
            {" "}
            · heat {file.spec.heat_no || "?"} · {summaryText(file.spec)}
          </span>
          {file.spec.grade_mismatch && <span className="ml-1 font-semibold">· grade differs from the drawing</span>}
        </span>
        <span className="shrink-0 font-semibold underline">Details</span>
      </button>
      {open && <SpecCheckPanel fileId={file.id} chatId={chatId} onClose={() => setOpen(false)} />}
    </>
  );
}

const fmt = (v: number | null | undefined, unit: string) => (v === null || v === undefined ? "—" : `${v}${unit === "%" ? "%" : ` ${unit}`}`);

function limitText(r: SpecRow) {
  const t = r.test_temp_c !== null && r.test_temp_c !== undefined ? ` at ${r.test_temp_c} °C` : "";
  if (r.min !== null && r.max !== null) return `${r.min}–${r.max}${r.unit === "%" ? "%" : ` ${r.unit}`}${t}`;
  if (r.max !== null) return `≤ ${fmt(r.max, r.unit)}${t}`;
  if (r.min !== null) return `≥ ${fmt(r.min, r.unit)}${t}`;
  return "—";
}

const ROW_ICON = {
  pass: <CheckCircle2 size={15} className="text-moss" aria-label="Pass" />,
  fail: <Octagon size={15} className="text-rust" aria-label="Fail" />,
  missing: <AlertTriangle size={15} className="text-saffron-ink" aria-label="Missing" />,
  info: <Info size={15} className="text-muted" aria-label="Note" />,
};

export function SpecCheckPanel({ fileId, chatId, onClose }: { fileId: string; chatId?: string; onClose: () => void }) {
  const { toast } = useWs();
  const [check, setCheck] = useState<SpecCheck | null>(null);
  const [busy, setBusy] = useState<"ncr" | "rerun" | null>(null);
  const [draft, setDraft] = useState<RecordDraftResult | null>(null);

  const load = useCallback(() => {
    api<SpecCheck>(`/api/files/${fileId}/spec-check`)
      .then(setCheck)
      .catch((e) => toast((e as Error).message));
  }, [fileId, toast]);
  useEffect(load, [load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function draftNcr() {
    if (!check) return;
    setBusy("ncr");
    const problems = check.rows
      .filter((r) => r.status === "fail" || r.status === "missing")
      .map((r) => (r.status === "fail" ? `${r.label} ${fmt(r.value, r.unit)} outside ${limitText(r)} (${r.source.standard ?? "spec"} ${r.source.clause ?? ""})` : `${r.label}: ${r.note}`));
    const text = [
      `Incoming material non-conformance. Mill test certificate ${check.certificate_no || ""} for heat ${check.heat_no || "?"} from ${check.vendor || "the vendor"}`,
      check.po_no ? `(PO ${check.po_no})` : "",
      `does not meet ${check.grade} limits:`,
      problems.join("; ") + ".",
      check.drawing ? `Drawing ${check.drawing.drawing_no} Rev ${check.drawing.rev} requires ${check.drawing.grade ?? check.grade}.` : "",
      "Suggested containment: quarantine the lot with a HOLD tag and inform the vendor and Purchase (SRC-QP-07 clause 4).",
    ]
      .filter(Boolean)
      .join(" ");
    try {
      const form = new FormData();
      form.append("type", "ncr");
      form.append("text", text);
      const token = await getFbAuth().currentUser?.getIdToken();
      const res = await fetch(`${apiUrl()}/api/records/draft`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      const body = await res.json();
      if (!res.ok) throw new Error(body.detail ?? "Couldn't draft the NCR");
      setDraft(body);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function rerun() {
    setBusy("rerun");
    try {
      await api(`/api/files/${fileId}/spec-check`, { method: "POST" });
      toast("Re-checking against the latest approved limits…");
      setTimeout(load, 8000);
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (draft) return <ReportDialog onClose={onClose} initialDraft={draft} chatId={chatId} />;

  const v = check?.status === "done" ? VERDICT[check.verdict] : null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-ink/45 px-4 py-[6vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label="Spec check" onMouseDown={(e) => e.stopPropagation()} className="ws-pop w-full max-w-2xl overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border px-5 py-4">
          <ShieldCheck size={20} className="mt-0.5 text-brand" aria-hidden />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold">Spec Check</h2>
            <p className="text-xs text-muted">Values read by Gemini; pass/fail computed by rules from your approved Standards Library limits.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:bg-hover">
            <X size={18} />
          </button>
        </div>
        {!check ? (
          <div className="flex items-center gap-2 p-6 text-sm text-muted" role="status">
            <Loader2 size={15} className="animate-spin" /> Loading…
          </div>
        ) : check.status !== "done" ? (
          <div className="p-6 text-sm text-muted">This certificate hasn&rsquo;t been checked yet.</div>
        ) : (
          <div className="max-h-[70vh] overflow-y-auto p-5">
            <div className={clsx("flex items-start gap-2.5 rounded-xl border p-3.5", v?.cls)}>
              {v && <v.icon size={18} className="mt-0.5 shrink-0" aria-hidden />}
              <div className="text-sm">
                <p className="font-bold">{v?.label}</p>
                <p className="mt-0.5 opacity-90">
                  Heat <b>{check.heat_no || "?"}</b> · {check.vendor || "vendor unknown"} · certificate {check.certificate_no || "—"} · grade <b>{check.grade || "?"}</b>
                  {check.thickness_mm ? ` · ${check.thickness_mm} mm` : ""}
                </p>
              </div>
            </div>
            {check.drawing && (
              <p className={clsx("mt-2 flex items-center gap-1.5 text-xs", check.grade_mismatch ? "font-semibold text-rust" : "text-muted")}>
                <FileText size={13} aria-hidden /> Drawing {check.drawing.drawing_no} current Rev {check.drawing.rev} requires {check.drawing.grade ?? "an unstated grade"}
                {check.grade_mismatch ? ` — the certificate says ${check.grade}` : " — matches the certificate"}
              </p>
            )}
            {check.notes?.map((n) => (
              <p key={n} className="mt-1.5 flex items-start gap-1.5 text-xs text-muted">
                <Info size={13} className="mt-px shrink-0" aria-hidden /> {n}
              </p>
            ))}
            {check.rows.length > 0 && (
              <table className="mt-3 w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-2 pr-2 font-medium">Property</th>
                    <th className="py-2 pr-2 font-medium">Certificate</th>
                    <th className="py-2 pr-2 font-medium">Limit</th>
                    <th className="py-2 font-medium">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {check.rows.map((r) => (
                    <tr key={r.property} className={clsx("border-b border-border align-top", r.status === "fail" && "bg-rust-soft/40")}>
                      <td className="py-2 pr-2">
                        <span className="flex items-center gap-1.5">
                          {ROW_ICON[r.status]} <span className="font-medium">{r.label}</span>
                        </span>
                        {r.note && <span className="mt-0.5 block pl-5 text-xs text-muted">{r.note}</span>}
                      </td>
                      <td className={clsx("py-2 pr-2 font-mono text-[13px]", r.status === "fail" && "font-bold text-rust")}>{fmt(r.value, r.unit)}</td>
                      <td className="py-2 pr-2 font-mono text-[13px]">{limitText(r)}</td>
                      <td className="py-2 text-xs text-muted">
                        {r.source.standard} {r.source.clause}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <div className="flex flex-wrap justify-end gap-2 border-t border-border bg-canvas/60 px-5 py-3">
          <button onClick={() => openFile(fileId)} className="mr-auto flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-medium text-muted hover:bg-hover">
            <ScanText size={14} /> Open certificate
          </button>
          <button onClick={rerun} disabled={busy !== null} className="flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-hover disabled:opacity-50">
            {busy === "rerun" ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Re-check
          </button>
          {check?.status === "done" && (check.verdict === "fail" || check.verdict === "incomplete") && (
            <button onClick={draftNcr} disabled={busy !== null} className="flex h-9 items-center gap-1.5 rounded-lg bg-rust px-4 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50">
              {busy === "ncr" ? <Loader2 size={14} className="animate-spin" /> : <Octagon size={14} />} Draft NCR
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

type Library = { documents: StandardDoc[]; limits: SpecLimit[]; can_manage: boolean };
type CheckRow = { file_id: string; file_name: string; verdict: SpecVerdict; grade: string; heat_no: string; vendor: string; fails: number; missing: number; ts: string | null };

/** Quality → Standards & certificates: the Standards Library (upload, approve limits) and recent certificate checks. */
export function StandardsTab() {
  const { toast } = useWs();
  const [lib, setLib] = useState<Library | null>(null);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [openCheck, setOpenCheck] = useState<string | null>(null);
  const [showDoc, setShowDoc] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    api<Library>("/api/standards").then(setLib).catch((e) => toast((e as Error).message));
    api<CheckRow[]>("/api/spec-checks").then(setChecks).catch(() => {});
  }, [toast]);
  useEffect(load, [load]);
  const processing = lib?.documents.some((d) => d.status === "processing");
  useEffect(() => {
    if (!processing) return;
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [processing, load]);

  async function upload(f: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", f);
      const token = await getFbAuth().currentUser?.getIdToken();
      const res = await fetch(`${apiUrl()}/api/standards`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
      if (!res.ok) throw new Error((await res.json()).detail ?? "Upload failed");
      toast("Uploaded. Saathi is indexing it and reading its limits…");
      load();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  }

  async function approveAll(sid: string) {
    try {
      const r = await api<{ approved: number }>(`/api/standards/${sid}/approve`, { json: { ids: [] } });
      toast(`${r.approved} limits approved. New certificates are checked against them.`);
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  async function remove(sid: string) {
    if (!confirm("Remove this standard and its limits?")) return;
    try {
      await api(`/api/standards/${sid}`, { method: "DELETE" });
      load();
    } catch (e) {
      toast((e as Error).message);
    }
  }

  const byDoc = useMemo(() => {
    const m: Record<string, SpecLimit[]> = {};
    for (const l of lib?.limits ?? []) (m[l.standard_id] ??= []).push(l);
    return m;
  }, [lib]);

  return (
    <div className="scrollbar-thin flex-1 overflow-y-auto px-4 py-5 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <section aria-label="Recent certificate checks">
          <h2 className="mb-2 text-sm font-bold">Incoming material · certificate checks</h2>
          {checks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">Mill test certificates shared in your chats are checked automatically and appear here.</p>
          ) : (
            <ul className="divide-y divide-border rounded-xl border border-border">
              {checks.map((c) => {
                const v = VERDICT[c.verdict];
                return (
                  <li key={c.file_id}>
                    <button onClick={() => setOpenCheck(c.file_id)} className="flex w-full items-center gap-3 px-3.5 py-2.5 text-left hover:bg-hover">
                      <v.icon size={16} className={clsx("shrink-0", c.verdict === "pass" ? "text-moss" : c.verdict === "fail" ? "text-rust" : c.verdict === "incomplete" ? "text-saffron-ink" : "text-muted")} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">
                          Heat {c.heat_no || "?"} · {c.grade} · {c.vendor}
                        </span>
                        <span className="block truncate text-xs text-muted">{c.file_name}</span>
                      </span>
                      <span className={clsx("shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold", v.cls)}>
                        {c.verdict === "fail" ? `${c.fails} fail` : c.verdict === "incomplete" ? `${c.missing} missing` : c.verdict === "pass" ? "pass" : "no limits"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Standards Library">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="flex-1 text-sm font-bold">
              Standards Library <span className="font-normal text-muted">· searchable by Saathi (Agent Search); limits feed Spec Check</span>
            </h2>
            {lib?.can_manage && (
              <>
                <input ref={input} type="file" accept="application/pdf" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                <button onClick={() => input.current?.click()} disabled={uploading} className="flex h-8 items-center gap-1.5 rounded-lg bg-brand px-3 text-xs font-semibold text-white hover:bg-brand-strong disabled:opacity-50">
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />} Add standard
                </button>
              </>
            )}
          </div>
          {!lib ? (
            <p className="flex items-center gap-2 text-sm text-muted">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </p>
          ) : lib.documents.length === 0 ? (
            <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted">No standards yet. Add your material specifications, procedures and checklists (PDF).</p>
          ) : (
            <ul className="space-y-2">
              {lib.documents.map((d) => {
                const limits = byDoc[d.id] ?? [];
                const proposed = limits.filter((l) => l.status === "proposed").length;
                const approved = limits.filter((l) => l.status === "approved").length;
                return (
                  <li key={d.id} className="rounded-xl border border-border">
                    <div className="flex flex-wrap items-center gap-2 px-3.5 py-2.5">
                      <FileText size={16} className="text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{d.title || d.name}</span>
                        <span className="block text-xs text-muted">
                          {d.doc_no ? `${d.doc_no} · ` : ""}
                          {d.status === "processing" ? "Reading…" : d.status === "failed" ? d.error ?? "Failed" : limits.length ? `${approved} approved · ${proposed} awaiting approval` : "Reference document (no limits)"}
                          {d.indexed ? " · searchable" : d.status === "ready" ? " · indexing" : ""}
                        </span>
                      </span>
                      {limits.length > 0 && (
                        <button onClick={() => setShowDoc(showDoc === d.id ? null : d.id)} className="h-8 rounded-lg border border-border px-2.5 text-xs font-medium hover:bg-hover">
                          {showDoc === d.id ? "Hide limits" : "View limits"}
                        </button>
                      )}
                      {lib.can_manage && proposed > 0 && (
                        <button onClick={() => approveAll(d.id)} className="h-8 rounded-lg bg-moss px-2.5 text-xs font-semibold text-white hover:brightness-110">
                          Approve {proposed}
                        </button>
                      )}
                      {lib.can_manage && (
                        <button onClick={() => remove(d.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-rust-soft hover:text-rust" aria-label={`Remove ${d.name}`}>
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    {showDoc === d.id && <LimitsTable limits={limits} />}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
      {openCheck && <SpecCheckPanel fileId={openCheck} onClose={() => setOpenCheck(null)} />}
    </div>
  );
}

function LimitsTable({ limits }: { limits: SpecLimit[] }) {
  const sorted = [...limits].sort((a, b) => a.grade.localeCompare(b.grade) || a.property.localeCompare(b.property) || (a.thickness_max_mm ?? 0) - (b.thickness_max_mm ?? 0));
  const band = (l: SpecLimit) =>
    l.thickness_min_mm === null && l.thickness_max_mm === null ? "all" : `${l.thickness_min_mm ?? 0} < t ≤ ${l.thickness_max_mm ?? "∞"} mm`;
  return (
    <div className="overflow-x-auto border-t border-border">
      <table className="w-full min-w-[560px] text-xs">
        <thead>
          <tr className="text-left text-muted">
            {["Grade", "Property", "Min", "Max", "Thickness", "Clause", "Status"].map((h) => (
              <th key={h} className="px-3 py-1.5 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((l) => (
            <tr key={l.id} className="border-t border-border">
              <td className="px-3 py-1.5 font-mono">{l.grade}</td>
              <td className="px-3 py-1.5">
                {l.property}
                {l.test_temp_c !== null ? ` @ ${l.test_temp_c} °C` : ""}
              </td>
              <td className="px-3 py-1.5 font-mono">{l.min ?? "—"}</td>
              <td className="px-3 py-1.5 font-mono">{l.max ?? "—"}</td>
              <td className="px-3 py-1.5">{band(l)}</td>
              <td className="px-3 py-1.5 text-muted">{l.clause}</td>
              <td className="px-3 py-1.5">
                <span className={clsx("rounded-full px-1.5 py-px font-semibold", l.status === "approved" ? "bg-moss-soft text-moss" : l.status === "rejected" ? "bg-rust-soft text-rust" : "bg-saffron-soft text-saffron-ink")}>{l.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
