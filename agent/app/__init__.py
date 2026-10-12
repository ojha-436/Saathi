
import os as _os

if _os.getenv("SAATHI_LOCAL") == "1":
    # Offline mode: several modules import the real google-cloud-firestore classes directly. Point those names at the
    # local database's equivalents before any of them is imported, so queries, increments and transactions work.
    from . import localdb as _l
    import google.cloud.firestore as _gf
    import google.cloud.firestore_v1.base_query as _bq
    import google.cloud.firestore_v1.base_vector_query as _bv
    import google.cloud.firestore_v1.vector as _vec

    for _n in ("ArrayUnion", "ArrayRemove", "Increment", "SERVER_TIMESTAMP", "transactional", "Query"):
        setattr(_gf, _n, getattr(_l.firestore, _n))
    _bq.FieldFilter = _l.FieldFilter
    _bv.DistanceMeasure = _l.DistanceMeasure
    _vec.Vector = _l.Vector
