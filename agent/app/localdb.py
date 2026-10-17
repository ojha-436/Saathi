"""Local stand-in for Firestore + Cloud Storage (SAATHI_LOCAL=1). Implements only the API surface Saathi uses and
persists to JSON files under .local/, so the whole app runs offline with no Google Cloud project."""
import copy
import json
import math
import os
import threading
import uuid
from datetime import datetime
from pathlib import Path
from types import SimpleNamespace
from zoneinfo import ZoneInfo

DATA_DIR = Path(os.getenv("LOCAL_DATA_DIR", Path(__file__).resolve().parents[1] / ".local"))
_lock = threading.RLock()


# ---------------- firestore-compatible helpers ----------------

class FieldFilter:
    def __init__(self, field_path: str, op_string: str, value):
        self.field, self.op, self.value = field_path, op_string, value


class ArrayUnion:
    def __init__(self, values):
        self.values = list(values)


class ArrayRemove:
    def __init__(self, values):
        self.values = list(values)


class Increment:
    def __init__(self, value):
        self.value = value


class _ServerTimestamp:
    """Stand-in for firestore.SERVER_TIMESTAMP: replaced by the current time when written."""


SERVER_TIMESTAMP = _ServerTimestamp()


class _DeleteField:
    """Stand-in for firestore.DELETE_FIELD: removes the field when written."""


DELETE_FIELD = _DeleteField()


def _resolve(v):
    """Replace SERVER_TIMESTAMP markers (recursively) with the current time."""
    if isinstance(v, _ServerTimestamp):
        return datetime.now(ZoneInfo("Asia/Kolkata"))
    if isinstance(v, dict):
        return {k: _resolve(x) for k, x in v.items()}
    if isinstance(v, list):
        return [_resolve(x) for x in v]
    return v


class Vector(list):
    """Embedding vector (a plain list here)."""


class DistanceMeasure:
    COSINE = "COSINE"


firestore = SimpleNamespace(
    Query=SimpleNamespace(ASCENDING="ASCENDING", DESCENDING="DESCENDING"),
    ArrayUnion=ArrayUnion,
    ArrayRemove=ArrayRemove,
    Increment=Increment,
    SERVER_TIMESTAMP=SERVER_TIMESTAMP,
    DELETE_FIELD=DELETE_FIELD,
    transactional=lambda fn: (lambda tx: _run_tx(fn, tx)),
)


def _run_tx(fn, tx):
    with _lock:  # one writer at a time: good enough for a single-process local database
        return fn(tx)


class _Tx:
    """Stand-in for a Firestore transaction: reads and writes apply directly under the global lock."""

    def set(self, ref, data, merge=False):
        ref.set(data, merge=merge)

    def update(self, ref, changes):
        ref.update(changes)

    def delete(self, ref):
        ref.delete()


def _enc(o):
    if isinstance(o, datetime):
        return {"__dt__": o.isoformat()}
    raise TypeError(type(o))


def _dec(d):
    if "__dt__" in d:
        return datetime.fromisoformat(d["__dt__"])
    return d


def _get_path(data: dict, dotted: str):
    cur = data
    for part in dotted.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def _set_path(data: dict, dotted: str, value) -> None:
    parts = dotted.split(".")
    cur = data
    for p in parts[:-1]:
        if not isinstance(cur.get(p), dict):
            cur[p] = {}
        cur = cur[p]
    last = parts[-1]
    if isinstance(value, ArrayUnion):
        existing = list(cur.get(last) or [])
        cur[last] = existing + [v for v in value.values if v not in existing]
    elif isinstance(value, ArrayRemove):
        cur[last] = [v for v in (cur.get(last) or []) if v not in value.values]
    elif isinstance(value, Increment):
        cur[last] = (cur.get(last) or 0) + value.value
    elif isinstance(value, _DeleteField):
        cur.pop(last, None)
    else:
        cur[last] = copy.deepcopy(_resolve(value))


def _match(data: dict, f: FieldFilter) -> bool:
    v = _get_path(data, f.field)
    op, t = f.op, f.value
    if op == "==":
        return v == t
    if op == "array_contains":
        return isinstance(v, list) and t in v
    if op == "array_contains_any":
        return isinstance(v, list) and any(x in v for x in t)
    if op == "in":
        return v in t
    if v is None:
        return False
    try:
        return {"<": v < t, "<=": v <= t, ">": v > t, ">=": v >= t}[op]
    except TypeError:
        return False


class DocSnap:
    def __init__(self, ref: "DocRef", data: dict | None):
        self.reference, self.id, self._data = ref, ref.id, data
        self.exists = data is not None

    def to_dict(self):
        return copy.deepcopy(self._data) if self._data is not None else None

    def get(self, field: str):
        return copy.deepcopy(_get_path(self._data or {}, field))


class DocRef:
    def __init__(self, db: "LocalDB", path: str):
        self.db, self.path, self.id = db, path, path.rsplit("/", 1)[-1]

    def get(self, transaction=None) -> DocSnap:
        with _lock:
            return DocSnap(self, copy.deepcopy(self.db.docs.get(self.path)))

    def set(self, data: dict, merge: bool = False):
        with _lock:
            data = _resolve(copy.deepcopy(dict(data)))
            if merge and self.path in self.db.docs:
                self.db.docs[self.path].update(data)
            else:
                self.db.docs[self.path] = data
            self.db.save()

    def update(self, changes: dict):
        with _lock:
            if self.path not in self.db.docs:
                raise KeyError(f"No document to update: {self.path}")
            for k, v in changes.items():
                _set_path(self.db.docs[self.path], k, v)
            self.db.save()

    def delete(self):
        with _lock:
            self.db.docs.pop(self.path, None)
            self.db.save()

    def collection(self, name: str) -> "Query":
        return Query(self.db, f"{self.path}/{name}")


class Query:
    def __init__(self, db: "LocalDB", path: str, filters=(), order=None, limit_=None, nearest=None):
        self.db, self.path = db, path
        self._filters, self._order, self._limit, self._nearest = list(filters), order, limit_, nearest

    def _clone(self, **kw):
        args = dict(filters=self._filters, order=self._order, limit_=self._limit, nearest=self._nearest)
        args.update(kw)
        return Query(self.db, self.path, **args)

    # collection-ish API
    def document(self, doc_id: str | None = None) -> DocRef:
        return DocRef(self.db, f"{self.path}/{doc_id or uuid.uuid4().hex[:20]}")

    def add(self, data: dict):
        ref = self.document()
        ref.set(data)
        return datetime.now(), ref

    def list_documents(self):
        depth = self.path.count("/") + 2
        with _lock:
            ids = {p.split("/")[depth - 1] for p in self.db.docs if p.startswith(self.path + "/") and p.count("/") + 1 >= depth}
        return [DocRef(self.db, f"{self.path}/{i}") for i in sorted(ids)]

    # query API
    def where(self, field_path=None, op_string=None, value=None, *, filter: FieldFilter | None = None):  # noqa: A002
        f = filter if filter is not None else FieldFilter(field_path, op_string, value)
        return self._clone(filters=[*self._filters, f])

    def get(self):
        return list(self.stream())

    def order_by(self, field: str, direction: str = "ASCENDING"):
        return self._clone(order=(field, direction == "DESCENDING"))

    def limit(self, n: int):
        return self._clone(limit_=n)

    def find_nearest(self, vector_field, query_vector, distance_measure, limit, distance_result_field=None):
        return self._clone(nearest=(vector_field, list(query_vector), limit, distance_result_field))

    def stream(self):
        prefix, depth = self.path + "/", self.path.count("/") + 2
        with _lock:
            rows = [(p, copy.deepcopy(d)) for p, d in self.db.docs.items() if p.startswith(prefix) and p.count("/") + 1 == depth]
        rows = [(p, d) for p, d in rows if all(_match(d, f) for f in self._filters)]
        if self._nearest:
            field, qv, k, dist_field = self._nearest
            scored = []
            for p, d in rows:
                vec = _get_path(d, field)
                if not vec:
                    continue
                dot = sum(a * b for a, b in zip(qv, vec))
                den = (math.sqrt(sum(a * a for a in qv)) * math.sqrt(sum(b * b for b in vec))) or 1.0
                dist = 1.0 - dot / den
                if dist_field:
                    d[dist_field] = dist
                scored.append((dist, p, d))
            scored.sort(key=lambda x: x[0])
            rows = [(p, d) for _, p, d in scored[:k]]
        if self._order:
            field, desc = self._order
            rows = [(p, d) for p, d in rows if _get_path(d, field) is not None]
            rows.sort(key=lambda r: _get_path(r[1], field), reverse=desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return iter([DocSnap(DocRef(self.db, p), d) for p, d in rows])


class _Batch:
    def __init__(self, db: "LocalDB"):
        self.db, self.ops = db, []

    def set(self, ref, data, merge=False):
        self.ops.append(lambda: ref.set(data, merge=merge))

    def update(self, ref, changes):
        self.ops.append(lambda: ref.update(changes))

    def delete(self, ref):
        self.ops.append(lambda: ref.delete())

    def commit(self):
        for op in self.ops:
            op()
        self.ops = []


class LocalDB:
    def __init__(self):
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        self.file = DATA_DIR / "db.json"
        self.docs: dict[str, dict] = {}
        if self.file.exists():
            self.docs = json.loads(self.file.read_text(encoding="utf-8"), object_hook=_dec)

    def save(self):
        tmp = self.file.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.docs, default=_enc), encoding="utf-8")
        tmp.replace(self.file)

    def collection(self, name: str) -> Query:
        return Query(self, name)

    def batch(self) -> _Batch:
        return _Batch(self)

    def transaction(self) -> "_Tx":
        return _Tx()


# ---------------- storage ----------------

class _Blob:
    def __init__(self, path: str):
        self.file = DATA_DIR / "files" / path

    def upload_from_string(self, data: bytes, content_type: str | None = None):
        self.file.parent.mkdir(parents=True, exist_ok=True)
        self.file.write_bytes(data)

    def download_as_bytes(self) -> bytes:
        return self.file.read_bytes()

    def delete(self):
        self.file.unlink(missing_ok=True)


class LocalBucket:
    def blob(self, path: str) -> _Blob:
        return _Blob(path)
