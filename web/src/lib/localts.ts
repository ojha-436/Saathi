/** Timestamp stand-in for local mode: the API sends {__ts__: epochMillis} and the UI only needs toDate()/toMillis(). */
export class LocalTs {
  constructor(private ms: number) {}
  toDate = () => new Date(this.ms);
  toMillis = () => this.ms;
  get seconds() {
    return Math.floor(this.ms / 1000);
  }
}

export function reviveTs<T>(v: T): T {
  if (Array.isArray(v)) return v.map(reviveTs) as T;
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.__ts__ === "number") return new LocalTs(o.__ts__) as T;
    return Object.fromEntries(Object.entries(o).map(([k, x]) => [k, reviveTs(x)])) as T;
  }
  return v;
}
