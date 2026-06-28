"""Detect a face and print normalized focus coordinates as JSON.

Image bytes are read from stdin so uploaded files never need to be written to disk.
MediaPipe is used when available; OpenCV's built-in face detector is the fallback.
"""
import json
import os
import sys
from pathlib import Path


def debug(message):
    print(f"[detect_subject] {message}", file=sys.stderr)


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MODEL_DIR = PROJECT_ROOT / "models"
DEFAULT_MODEL_CANDIDATES = (
    "blaze_face_short_range.tflite",
    "blaze_face_full_range.tflite",
    "blaze_face_full_range_sparse.tflite",
)


def model_candidates():
    configured = os.environ.get("FACE_DETECTION_MODEL_PATH", "").strip()
    seen = set()
    candidates = []
    for value in ([configured] if configured else []):
        path = Path(value)
        normalized = str(path.resolve()) if path.exists() else str(path)
        if normalized not in seen:
            seen.add(normalized)
            candidates.append(path)
    for name in DEFAULT_MODEL_CANDIDATES:
        path = MODEL_DIR / name
        normalized = str(path.resolve())
        if normalized not in seen:
            seen.add(normalized)
            candidates.append(path)
    return candidates


def clamp_box(box):
    x, y, w, h = box
    x = min(1.0, max(0.0, x))
    y = min(1.0, max(0.0, y))
    w = min(1.0 - x, max(0.0, w))
    h = min(1.0 - y, max(0.0, h))
    return (x, y, w, h)


def face_box_quality(box, confidence=0.0):
    x, y, w, h = clamp_box(box)
    if w <= 0 or h <= 0:
        return None

    aspect = w / max(h, 1e-6)
    area = w * h
    center_x = x + w * 0.5
    center_y = y + h * 0.5

    if confidence < 0.12:
        return None
    if aspect < 0.4 or aspect > 1.95:
        return None
    if area < 0.0015 or area > 0.22:
        return None
    if center_y > 0.72:
        return None
    if y > 0.8:
        return None

    top_bias = 1.22 - center_y
    center_bias = 1.0 - abs(center_x - 0.5) * 0.28
    size_bias = 0.7 + min(1.0, area / 0.045) * 0.3
    score_bias = 0.65 + min(1.0, confidence) * 0.35
    aspect_bias = 1.0 - min(0.45, abs(aspect - 0.92) * 0.18)

    # Strong, upper-half detections should survive even if the crop is a little wide.
    if confidence >= 0.72 and center_y <= 0.58:
        score_bias += 0.12

    # Penalize lower-half detections instead of hard-rejecting them immediately.
    if center_y > 0.56:
        top_bias *= 0.72

    return top_bias * center_bias * size_bias * score_bias * aspect_bias


def pick_best_face_candidate(candidates, label):
    ranked = []
    for candidate in candidates:
        quality = face_box_quality(candidate["box"], candidate.get("score", 0.0))
        if quality is None:
            debug(
                f"{label} rejected candidate: "
                f"box={candidate['box'][0]:.3f},{candidate['box'][1]:.3f},{candidate['box'][2]:.3f},{candidate['box'][3]:.3f}, "
                f"score={float(candidate.get('score', 0.0)):.3f}"
            )
            continue
        ranked.append((quality, candidate))

    if not ranked:
        return None

    ranked.sort(key=lambda item: item[0], reverse=True)
    best_quality, best = ranked[0]
    debug(
        f"{label} accepted candidate: "
        f"box={best['box'][0]:.3f},{best['box'][1]:.3f},{best['box'][2]:.3f},{best['box'][3]:.3f}, "
        f"score={float(best.get('score', 0.0)):.3f}, quality={best_quality:.3f}"
    )
    return best


def mediapipe_detection_inputs(cv2, rgb):
    height, width = rgb.shape[:2]
    yield ("original", rgb)
    for requested_scale in (1.35, 1.7):
        capped_scale = min(requested_scale, 1920.0 / max(width, height))
        if capped_scale <= 1.02:
            continue
        resized = cv2.resize(rgb, None, fx=capped_scale, fy=capped_scale, interpolation=cv2.INTER_CUBIC)
        yield (f"upscaled-{capped_scale:.2f}x", resized)


def result(kind="center", confidence=0.0, box=None, detector="unavailable"):
    if box is None:
        box = (0.25, 0.15, 0.5, 0.7)
    x, y, w, h = box
    # For a person/upper-body box the face is normally near the upper sixth.
    focus_y = y + h * (0.48 if kind == "face" else 0.16 if kind == "person" else 0.5)
    return {
        "kind": kind,
        "confidence": round(float(confidence), 4),
        "detector": detector,
        "box": {"x": x, "y": y, "width": w, "height": h},
        "focus": {"x": min(1.0, max(0.0, x + w / 2)), "y": min(1.0, max(0.0, focus_y))},
    }


def detect_with_mediapipe(cv2, image):
    import mediapipe as mp

    debug(f"mediapipe imported: version={getattr(mp, '__version__', 'unknown')}")
    rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)

    if hasattr(mp, "solutions"):
        debug("mediapipe legacy solutions API available")
        with mp.solutions.face_detection.FaceDetection(
            model_selection=1,
            min_detection_confidence=0.42,
        ) as detector:
            detections = detector.process(rgb).detections or []
        if detections:
            solution_candidates = []
            for detection in detections:
                box = detection.location_data.relative_bounding_box
                solution_candidates.append({
                    "box": clamp_box((box.xmin, box.ymin, box.width, box.height)),
                    "score": float(detection.score[0]),
                })
            selected = pick_best_face_candidate(solution_candidates, "mediapipe solutions")
            if selected:
                return result("face", selected["score"], selected["box"], "mediapipe")
        debug("mediapipe solutions returned no detections")
        return None

    debug("mediapipe solutions API unavailable; trying tasks vision face detector")
    tasks = getattr(mp, "tasks", None)
    if tasks is None:
        debug("mediapipe tasks API unavailable")
        return None

    if hasattr(tasks, "BaseOptions") and hasattr(tasks, "vision"):
        debug("mediapipe tasks API available via mp.tasks")
        base_options_cls = tasks.BaseOptions
        vision = tasks.vision
    elif hasattr(tasks, "python") and hasattr(tasks.python, "BaseOptions") and hasattr(tasks.python, "vision"):
        debug("mediapipe tasks API available via mp.tasks.python")
        base_options_cls = tasks.python.BaseOptions
        vision = tasks.python.vision
    else:
        debug("mediapipe tasks API unavailable")
        return None

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

    for model_path in model_candidates():
        if not model_path.exists():
            debug(f"mediapipe tasks model missing: {model_path}")
            continue
        debug(f"mediapipe tasks trying model: {model_path}")
        options = vision.FaceDetectorOptions(
            base_options=base_options_cls(model_asset_path=str(model_path)),
            min_detection_confidence=0.18,
            min_suppression_threshold=0.3,
        )
        try:
            with vision.FaceDetector.create_from_options(options) as detector:
                for pass_name, input_rgb in mediapipe_detection_inputs(cv2, rgb):
                    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=input_rgb)
                    detections = detector.detect(mp_image).detections or []
                    if not detections:
                        debug(f"mediapipe tasks pass returned no detections: {model_path.name} / {pass_name}")
                        continue

                    task_candidates = []
                    for detection in detections:
                        score = float(detection.categories[0].score) if detection.categories else 0.0
                        box = detection.bounding_box
                        task_candidates.append({
                            "box": clamp_box((
                                box.origin_x / input_rgb.shape[1],
                                box.origin_y / input_rgb.shape[0],
                                box.width / input_rgb.shape[1],
                                box.height / input_rgb.shape[0],
                            )),
                            "score": score,
                        })
                    selected = pick_best_face_candidate(task_candidates, f"mediapipe tasks {model_path.name} / {pass_name}")
                    if not selected:
                        continue
                    return result("face", selected["score"], selected["box"], "mediapipe")
        except Exception as error:
            debug(f"mediapipe tasks model failed ({model_path.name}): {type(error).__name__}: {error}")
            continue

    debug("mediapipe tasks returned no detections from available models")
    return None


def main():
    try:
        import cv2
        import numpy as np

        data = np.frombuffer(sys.stdin.buffer.read(), dtype=np.uint8)
        image = cv2.imdecode(data, cv2.IMREAD_COLOR)
        if image is None:
            raise ValueError("unsupported image")
        height, width = image.shape[:2]

        # MediaPipe's detector is more robust for angled and partially visible faces.
        try:
            subject = detect_with_mediapipe(cv2, image)
            if subject:
                print(json.dumps(subject))
                return
            debug("mediapipe returned no detections; falling back to opencv")
        except Exception as error:
            debug(f"mediapipe failed: {type(error).__name__}: {error}")

        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        gray = cv2.equalizeHist(gray)
        # Try several cascades: occluded eyes often defeat a single frontal model.
        face_candidates = []
        for cascade_name in ("haarcascade_frontalface_alt2.xml", "haarcascade_frontalface_default.xml"):
            cascade = cv2.CascadeClassifier(cv2.data.haarcascades + cascade_name)
            face_candidates.extend(cascade.detectMultiScale(
                gray, scaleFactor=1.06, minNeighbors=3, minSize=(28, 28)
            ))

        profile = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")
        face_candidates.extend(profile.detectMultiScale(
            gray, scaleFactor=1.06, minNeighbors=3, minSize=(28, 28)
        ))
        flipped_faces = profile.detectMultiScale(
            cv2.flip(gray, 1), scaleFactor=1.06, minNeighbors=3, minSize=(28, 28)
        )
        face_candidates.extend((width - x - w, y, w, h) for x, y, w, h in flipped_faces)

        # Reject common false positives such as feet, phones and fabric patterns.
        # A hero portrait's useful face should be in the upper ~65% of the source.
        face_candidates = [
            (x, y, w, h) for x, y, w, h in face_candidates
            if 0.68 <= (w / max(h, 1)) <= 1.45
            and 0.0007 <= ((w * h) / (width * height)) <= 0.18
            and ((y + h * 0.5) / height) <= 0.65
        ]

        if face_candidates:
            # Prefer a substantial face near the upper part of the image.
            x, y, w, h = max(
                face_candidates,
                key=lambda item: (item[2] * item[3]) * (1.35 - (item[1] + item[3] * 0.5) / height)
            )
            debug(f"opencv face candidate selected: x={x}, y={y}, w={w}, h={h}")
            print(json.dumps(result("face", 0.72, (x / width, y / height, w / width, h / height), "opencv")))
            return

        # If facial features are covered, use the upper-body box to estimate the head.
        upper_body = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_upperbody.xml")
        bodies = upper_body.detectMultiScale(
            gray, scaleFactor=1.05, minNeighbors=3,
            minSize=(max(40, width // 12), max(40, height // 12))
        )
        if len(bodies):
            x, y, w, h = max(bodies, key=lambda item: int(item[2]) * int(item[3]))
            debug(f"opencv upper-body candidate selected: x={x}, y={y}, w={w}, h={h}")
            print(json.dumps(result("person", 0.55, (x / width, y / height, w / width, h / height), "opencv")))
            return

        hog = cv2.HOGDescriptor()
        hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
        scale = min(1.0, 1000.0 / max(width, height))
        scan = cv2.resize(image, None, fx=scale, fy=scale) if scale < 1 else image
        bodies, weights = hog.detectMultiScale(scan, winStride=(8, 8), padding=(8, 8), scale=1.05)
        if len(bodies):
            index = max(range(len(bodies)), key=lambda i: float(weights[i]))
            x, y, w, h = bodies[index]
            x, y, w, h = x / scale, y / scale, w / scale, h / scale
            debug(f"opencv hog candidate selected: x={x}, y={y}, w={w}, h={h}, weight={float(weights[index])}")
            print(json.dumps(result("person", float(weights[index]), (x / width, y / height, w / width, h / height), "opencv")))
            return

        debug("no mediapipe or opencv detections; using centered opencv fallback")
        print(json.dumps(result(detector="opencv")))
        return

    except Exception as error:
        debug(f"fatal detection failure: {type(error).__name__}: {error}")

    debug("returning unavailable fallback")
    print(json.dumps(result()))


if __name__ == "__main__":
    main()
