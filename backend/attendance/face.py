"""Face verification using InsightFace (ArcFace / buffalo_sc).

Interface is unchanged from the previous version — views.py needs no edits.

    from .face import verify, extract_embedding, is_available, cosine_distance

buffalo_sc uses MobileFaceNet (16 MB pack, ~250 MB peak RAM) instead of
buffalo_l's ResNet50 (326 MB pack, ~1 GB peak RAM). The trade-off:

    buffalo_l   LFW 99.86%  →  will not fit on Render free tier
    buffalo_sc  LFW 99.5%   →  fits comfortably, works everywhere

Embeddings are still 512-d L2-normalised cosine-distance vectors. The
thresholds shift up slightly because MobileFaceNet's distance distribution
sits a touch higher than ResNet50's.

Thresholds (cosine distance, buffalo_sc):
    < 0.45       → confident match
    0.45 – 0.60  → borderline; flag for rep review
    > 0.60       → mismatch
"""

import os
import tempfile
import threading
from typing import Optional, Tuple

# ── Lazy imports — captured so a broken install doesn't kill Django ──
_np = None
_cv2 = None
_FaceAnalysis = None
_IMPORT_ERROR = None

try:
    import numpy as _np
except Exception as e:
    _IMPORT_ERROR = f'numpy: {type(e).__name__}: {e}'

try:
    import cv2 as _cv2
except Exception as e:
    if _IMPORT_ERROR is None:
        _IMPORT_ERROR = f'cv2: {type(e).__name__}: {e}'

try:
    from insightface.app import FaceAnalysis as _FaceAnalysis
except Exception as e:
    if _IMPORT_ERROR is None:
        _IMPORT_ERROR = f'insightface: {type(e).__name__}: {e}'


# ── Configuration ─────────────────────────────────────────────
MODEL_PACK = 'buffalo_sc'        # was 'buffalo_l'
PROVIDERS = ['CPUExecutionProvider']
MODEL_ROOT = os.environ.get('INSIGHTFACE_HOME', os.path.expanduser('~/.insightface'))

MATCH_THRESHOLD = 0.45           # was 0.40
REVIEW_THRESHOLD = 0.60          # was 0.55


# ── Model lazy loader (thread-safe; downloads weights on first use) ──
_app = None
_app_lock = threading.Lock()


def _get_app():
    global _app
    if _app is not None:
        return _app
    with _app_lock:
        if _app is not None:
            return _app
        app = _FaceAnalysis(
            name=MODEL_PACK,
            providers=PROVIDERS,
            root=MODEL_ROOT,
        )
        app.prepare(ctx_id=0, det_size=(640, 640))
        _app = app
        return _app


# ── Availability probe ────────────────────────────────────────
def is_available() -> Tuple[bool, Optional[str]]:
    """True if face verification can run. False + reason otherwise."""
    if _IMPORT_ERROR:
        return False, _IMPORT_ERROR
    if _np is None or _cv2 is None or _FaceAnalysis is None:
        return False, 'face libraries not loaded'
    return True, None


def warmup() -> Tuple[bool, Optional[str]]:
    """Force the model to download + load. Call from a startup hook or
    an admin endpoint after deploy to avoid a slow first check-in."""
    ok, reason = is_available()
    if not ok:
        return False, reason
    try:
        _get_app()
        return True, None
    except Exception as e:
        return False, f'{type(e).__name__}: {e}'


# ── Core: embedding extraction ───────────────────────────────
def extract_embedding(image_bytes: bytes) -> Tuple[Optional[list], Optional[str]]:
    """Return (embedding_list, error_code). error_code is None on success."""
    if not image_bytes:
        return None, 'empty'

    ok, reason = is_available()
    if not ok:
        return None, f'unavailable:{reason}'

    tmp = tempfile.NamedTemporaryFile(suffix='.jpg', delete=False)
    try:
        tmp.write(image_bytes)
        tmp.flush()
        tmp.close()

        img = _cv2.imread(tmp.name)
        if img is None:
            return None, 'bad_image'

        faces = _get_app().get(img)
        if not faces:
            return None, 'no_face'

        # Largest face wins (ignores photobombers / clutter)
        face = max(
            faces,
            key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1]),
        )

        emb = _np.asarray(face.normed_embedding, dtype=_np.float32)
        norm = _np.linalg.norm(emb)
        if norm == 0:
            return None, 'bad_embedding'
        return (emb / norm).tolist(), None

    except Exception as e:
        return None, f'error:{type(e).__name__}'
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass


def cosine_distance(a, b) -> float:
    a = _np.asarray(a, dtype=_np.float32)
    a /= (_np.linalg.norm(a) + 1e-9)
    b = _np.asarray(b, dtype=_np.float32)
    b /= (_np.linalg.norm(b) + 1e-9)
    return float(1.0 - _np.dot(a, b))


# ── Verification entry point (unchanged interface) ───────────
def verify(enrolled_embedding, candidate_bytes: bytes) -> dict:
    if not enrolled_embedding:
        return {'ok': False, 'match': False, 'needs_review': False,
                'distance': None, 'error': 'not_enrolled'}

    ok, reason = is_available()
    if not ok:
        return {'ok': False, 'match': False, 'needs_review': False,
                'distance': None, 'error': f'unavailable:{reason}'}

    candidate, err = extract_embedding(candidate_bytes)
    if err:
        return {'ok': False, 'match': False, 'needs_review': False,
                'distance': None, 'error': err}

    dist = cosine_distance(enrolled_embedding, candidate)
    match = dist < MATCH_THRESHOLD
    review = (not match) and dist < REVIEW_THRESHOLD
    return {'ok': True, 'match': match, 'needs_review': review,
            'distance': round(dist, 4), 'error': None} 