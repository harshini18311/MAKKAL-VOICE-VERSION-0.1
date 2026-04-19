"""
MAKKAL VOICE — Patent-Grade Image Forensics Engine
===================================================
Multi-layer visual semantic analysis pipeline:
  Layer 1 : YOLO object detection → civic domain mapping
  Layer 2 : Color/texture visual fingerprinting
  Layer 3 : Image authenticity (EXIF, hash, entropy)

No external API dependencies. Fully local inference.
"""

import io
import json
import sys
import math
import contextlib
from PIL import Image, ExifTags, ImageStat
import exifread
import imagehash

# ─────────────────────────────────────────────────────────────
# YOLO import (optional — graceful fallback if not installed)
# ─────────────────────────────────────────────────────────────
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False

# ─────────────────────────────────────────────────────────────
# CIVIC DOMAIN ONTOLOGY
# Maps every YOLO COCO class to civic complaint categories
# with weighted relevance scores.
# ─────────────────────────────────────────────────────────────
YOLO_TO_CIVIC = {
    # ── INFRASTRUCTURE / ROADS ──
    "car":           {"road": 0.5, "traffic": 0.8},
    "truck":         {"road": 0.6, "traffic": 0.8},
    "bus":           {"traffic": 0.9, "road": 0.5},
    "motorcycle":    {"traffic": 0.7, "road": 0.4},
    "bicycle":       {"traffic": 0.5},
    "traffic light": {"traffic": 1.0, "road": 0.6},
    "stop sign":     {"traffic": 1.0, "road": 0.6},
    "fire hydrant":  {"water": 0.9, "infrastructure": 0.4},
    "parking meter": {"traffic": 0.7},
    "bench":         {"public_buildings": 0.5, "sanitation": 0.3},
    "potted plant":  {"sanitation": 0.3},
    "umbrella":      {},  # non-civic
    "suitcase":      {},
    "sports ball":   {},
    "kite":          {},
    "baseball bat":  {"safety": 0.6},
    "skateboard":    {},
    "surfboard":     {},
    "wine glass":    {"sanitation": 0.4},
    "cup":           {"sanitation": 0.3},
    "fork":          {},
    "knife":         {"safety": 0.5},
    "spoon":         {},
    "bowl":          {},
    "banana":        {"sanitation": 0.2},
    "apple":         {"sanitation": 0.2},
    "sandwich":      {"sanitation": 0.2},
    "orange":        {"sanitation": 0.2},
    "broccoli":      {"sanitation": 0.2},
    "carrot":        {"sanitation": 0.2},
    "hot dog":       {"sanitation": 0.2},
    "pizza":         {"sanitation": 0.2},
    "donut":         {"sanitation": 0.2},
    "cake":          {},
    "chair":         {"public_buildings": 0.3},
    "couch":         {"sanitation": 0.4},
    "bed":           {},
    "dining table":  {},
    "toilet":        {"water": 0.6, "sanitation": 0.8},
    "tv":            {},
    "laptop":        {},
    "mouse":         {},
    "remote":        {},
    "keyboard":      {},
    "cell phone":    {},
    "microwave":     {},
    "oven":          {},
    "toaster":       {},
    "sink":          {"water": 0.9},
    "refrigerator":  {},
    "book":          {},
    "clock":         {},
    "vase":          {},
    "scissors":      {},
    "teddy bear":    {},
    "hair drier":    {},
    "toothbrush":    {},
    "bottle":        {"sanitation": 0.6, "water": 0.3},
    # ── INFRASTRUCTURE SPECIFIC ──
    "person":        {},  # intentionally neutral
    "bird":          {"sanitation": 0.2},
    "cat":           {"sanitation": 0.2},
    "dog":           {"sanitation": 0.3},
    "horse":         {"road": 0.2},
    "sheep":         {},
    "cow":           {},
    "elephant":      {},
    "bear":          {},
    "zebra":         {},
    "giraffe":       {},
    "backpack":      {},
    "handbag":       {},
    "tie":           {},
    "frisbee":       {},
    "skis":          {},
    "snowboard":     {},
    "baseball glove":{},
    "boat":          {"water": 0.5},
    "aeroplane":     {},
    "train":         {"traffic": 0.7, "infrastructure": 0.5},
    "airplane":      {},
}

# ─────────────────────────────────────────────────────────────
# DIGITAL / NON-AUTHENTIC IMAGE SIGNATURES
# Used to detect posters, screenshots, generated art, etc.
# ─────────────────────────────────────────────────────────────
DIGITAL_ART_PALETTE_RANGES = [
    # Flat vivid hues typical of event posters / illustrations
    {"h": (200, 280), "s": (150, 255), "v": (180, 255)},  # bright blues/purples
    {"h": (0, 20),    "s": (180, 255), "v": (200, 255)},  # bright reds
    {"h": (25, 50),   "s": (200, 255), "v": (220, 255)},  # neon yellows/oranges
]

# ─────────────────────────────────────────────────────────────
# COMPLAINT CATEGORY → EXPECTED VISUAL SIGNATURES
# Encodes what a legitimate photo SHOULD look like for each
# civic complaint type (dominant color ranges, textures).
# ─────────────────────────────────────────────────────────────
CATEGORY_VISUAL_SIGNATURES = {
    "road": {
        "dominant_colors": ["grey", "black", "brown", "beige"],
        "yolo_classes": ["car", "truck", "bus", "motorcycle", "traffic light", "stop sign"],
        "keywords": ["pothole", "road", "street", "asphalt", "pavement", "crack", "highway",
                     "lane", "bridge", "tar", "broken road", "damaged road", "speed breaker",
                     "divider", "median", "shoulder", "berm", "culvert"]
    },
    "water": {
        "dominant_colors": ["blue", "dark blue", "brown", "dark green"],
        "yolo_classes": ["sink", "toilet", "fire hydrant", "bottle", "boat"],
        "keywords": ["water", "leak", "pipe", "drain", "drainage", "sewer", "flooding",
                     "waterlogging", "stagnant", "overflow", "puddle", "pond", "blocked drain",
                     "broken pipe", "leaking", "burst pipe", "water supply", "borewell",
                     "groundwater", "contaminated water", "drinking water"]
    },
    "sanitation": {
        "dominant_colors": ["brown", "dark grey", "black", "dark green"],
        "yolo_classes": ["bottle", "cup", "wine glass", "banana", "apple", "sandwich",
                         "orange", "hot dog", "pizza", "donut", "couch", "dog"],
        "keywords": ["garbage", "trash", "waste", "dump", "filth", "dirt", "rubbish",
                     "littering", "litter", "refuse", "stench", "smell", "bin", "dustbin",
                     "sewage", "open defecation", "faecal", "hygiene", "rats", "cockroach",
                     "mosquito", "breeding", "compost", "dumping", "slum"]
    },
    "electricity": {
        "dominant_colors": ["grey", "black", "white", "silver"],
        "yolo_classes": [],
        "keywords": ["electricity", "power", "power cut", "blackout", "outage", "voltage",
                     "electric pole", "transformer", "wire", "cable", "streetlight",
                     "light", "lamp", "spark", "short circuit", "shock", "meter", "billing",
                     "power supply", "no power", "tripping", "fluctuation"]
    },
    "traffic": {
        "dominant_colors": ["grey", "black", "yellow", "white"],
        "yolo_classes": ["car", "truck", "bus", "motorcycle", "bicycle", "traffic light",
                         "stop sign", "train"],
        "keywords": ["traffic", "congestion", "jam", "signal", "accident", "vehicle",
                     "road block", "diversion", "wrong side", "overloading", "no parking",
                     "encroachment", "zebra crossing", "speed", "reckless", "drunk driving",
                     "hit and run", "unsafe"]
    },
    "public_buildings": {
        "dominant_colors": ["beige", "white", "grey", "red"],
        "yolo_classes": ["person", "bench", "chair"],
        "keywords": ["school", "hospital", "clinic", "dispensary", "government", "office",
                     "ration shop", "panchayat", "court", "police", "fire station",
                     "community hall", "library", "anganwadi", "building", "structure",
                     "wall", "ceiling", "roof", "crumbling", "dilapidated", "demolish"]
    },
    "safety": {
        "dominant_colors": ["red", "orange", "yellow", "black"],
        "yolo_classes": ["knife", "baseball bat"],
        "keywords": ["danger", "hazard", "unsafe", "risk", "collapse", "broken", "fallen",
                     "accident", "injury", "fire", "explosion", "chemical", "toxic",
                     "open manhole", "exposed wire", "falling debris", "tree fallen",
                     "flood", "landslide", "encroachment", "illegal construction"]
    }
}

# ─────────────────────────────────────────────────────────────
# GPS helpers
# ─────────────────────────────────────────────────────────────
def _ratio_to_float(value):
    try:
        return float(value.num) / float(value.den)
    except Exception:
        return None


def _convert_gps_to_decimal(values, ref):
    if not values or len(values) != 3:
        return None
    deg  = _ratio_to_float(values[0])
    mins = _ratio_to_float(values[1])
    secs = _ratio_to_float(values[2])
    if deg is None or mins is None or secs is None:
        return None
    decimal = deg + (mins / 60.0) + (secs / 3600.0)
    if ref in ("S", "W"):
        decimal *= -1
    return round(decimal, 6)


# ─────────────────────────────────────────────────────────────
# LAYER 1 — YOLO Object Detection
# ─────────────────────────────────────────────────────────────
def detect_objects(file_path):
    """Detect COCO objects using YOLOv8n."""
    if not YOLO_AVAILABLE:
        return []
    try:
        model = YOLO("yolov8n.pt")
        results = model.predict(file_path, conf=0.25, verbose=False)
        detected = []
        if results:
            for result in results:
                if hasattr(result, "boxes") and result.boxes is not None:
                    for box in result.boxes:
                        class_id   = int(box.cls[0])
                        class_name = result.names[class_id]
                        confidence = float(box.conf[0])
                        detected.append({
                            "object":     class_name,
                            "confidence": round(confidence, 2)
                        })
        return detected
    except Exception:
        return []


# ─────────────────────────────────────────────────────────────
# LAYER 2 — Visual Fingerprinting
# ─────────────────────────────────────────────────────────────
def compute_visual_signature(image: Image.Image) -> dict:
    """
    Extract visual fingerprint:
    - dominant_color: rough color bucket (grey, blue, brown, etc.)
    - pixel_entropy: Shannon entropy of grayscale histogram (0-8)
    - edge_density: fraction of high-contrast edge pixels  
    - color_variance: how varied the image colors are (real photos = high)
    - is_likely_digital: True ONLY if image looks like a poster/clipart/screenshot
    """
    sig = {
        "dominant_color": "unknown",
        "pixel_entropy":  0.0,
        "edge_density":   0.0,
        "color_variance": 0.0,
        "is_likely_digital": False
    }

    try:
        rgb = image.convert("RGB").resize((160, 160))
        stat = ImageStat.Stat(rgb)
        r, g, b = stat.mean
        r_std, g_std, b_std = stat.stddev

        # ── Dominant color bucket ──
        if r > 200 and g > 200 and b > 200:
            sig["dominant_color"] = "white"
        elif r < 55 and g < 55 and b < 55:
            sig["dominant_color"] = "black"
        elif r > g + 40 and r > b + 40:
            sig["dominant_color"] = "red"
        elif g > r + 35 and g > b + 30:
            sig["dominant_color"] = "green"
        elif b > r + 30 and b > g + 25:
            sig["dominant_color"] = "blue"
        elif r > 140 and g > 100 and b < 75:
            sig["dominant_color"] = "orange"
        elif r > 90 and g > 65 and b < 55 and r > g:
            sig["dominant_color"] = "brown"
        elif abs(r - g) < 25 and abs(g - b) < 25 and r > 55:
            sig["dominant_color"] = "grey"
        elif r > 160 and g > 150 and b < 80:
            sig["dominant_color"] = "yellow"
        else:
            sig["dominant_color"] = "mixed"

        # ── Color variance (real photos have high per-channel variation) ──
        color_variance = (r_std + g_std + b_std) / 3.0
        sig["color_variance"] = round(color_variance, 2)

        # ── Shannon pixel entropy ──
        gray = rgb.convert("L")
        histogram = gray.histogram()
        total_px = sum(histogram)
        entropy = 0.0
        for count in histogram:
            if count > 0:
                p = count / total_px
                entropy -= p * math.log2(p)
        sig["pixel_entropy"] = round(entropy, 3)

        # ── Edge density using numpy (fast) ──
        try:
            import numpy as np
            gray_np = np.array(gray, dtype=np.int32)
            gx = np.abs(gray_np[:, 2:] - gray_np[:, :-2])
            gy = np.abs(gray_np[2:, :] - gray_np[:-2, :])
            # Trim to same size
            min_h = min(gx.shape[0], gy.shape[0])
            min_w = min(gx.shape[1], gy.shape[1])
            gradient = gx[:min_h, :min_w] + gy[:min_h, :min_w]
            edge_count = np.sum(gradient > 60)
            sig["edge_density"] = round(float(edge_count) / gradient.size, 4)
        except ImportError:
            # Fallback: sample-based edge check (fast enough at 160x160)
            gray_data = list(gray.getdata())
            w, h = gray.size
            edge_count = 0
            step = 2  # sample every other pixel for speed
            for y in range(step, h - step, step):
                for x in range(step, w - step, step):
                    idx = y * w + x
                    gx = abs(gray_data[idx + step] - gray_data[idx - step])
                    gy = abs(gray_data[idx + step * w] - gray_data[idx - step * w])
                    if gx + gy > 60:
                        edge_count += 1
            total_sampled = ((h // step) - 2) * ((w // step) - 2)
            sig["edge_density"] = round(edge_count / max(total_sampled, 1), 4)

        # ── Digital art / poster detection ──
        # A real outdoor photo typically has:
        #   - Higher color_variance (textures, lighting variations)  
        #   - Moderate-to-high edge density (real world has edges)
        # A digital poster/clipart has:
        #   - Low color variance (flat fills)  
        #   - Very low entropy (few unique tones)
        #   - Very low edge density (smooth gradients only)
        #   - Bright saturated colors
        bright_vivid = (
            max(r, g, b) > 190 and                  # Bright
            (max(r, g, b) - min(r, g, b)) > 70      # Highly saturated
        )
        flat_image = (
            sig["pixel_entropy"] < 4.5 and          # Very few unique tones
            sig["edge_density"] < 0.08 and          # Almost no edges
            sig["color_variance"] < 30              # Flat fills
        )
        sig["is_likely_digital"] = flat_image and bright_vivid

    except Exception as e:
        sig["error"] = str(e)

    return sig


# ─────────────────────────────────────────────────────────────
# LAYER 3 — Complaint-to-Category Identification
# ─────────────────────────────────────────────────────────────
def identify_complaint_categories(complaint_text: str) -> list:
    """
    Return ranked list of civic categories inferred from complaint text.
    """
    text = complaint_text.lower()
    scores = {}
    for cat, sig in CATEGORY_VISUAL_SIGNATURES.items():
        hits = sum(1 for kw in sig["keywords"] if kw in text)
        if hits > 0:
            scores[cat] = hits
    # Sort by hits descending
    return sorted(scores, key=lambda c: scores[c], reverse=True)


def score_yolo_against_categories(detected_objects: list, categories: list) -> float:
    """
    Score how well YOLO-detected objects align with the expected civic categories.
    Returns 0–100.
    """
    if not detected_objects or not categories:
        return 0.0

    total_weight = 0.0
    matched_weight = 0.0

    for obj in detected_objects:
        label = obj["object"].lower()
        conf  = obj["confidence"]
        civic_map = YOLO_TO_CIVIC.get(label, {})
        for cat in categories:
            cat_weight = civic_map.get(cat, 0.0)
            matched_weight += cat_weight * conf
        total_weight += conf  # max possible contribution

    if total_weight == 0:
        return 0.0

    raw = (matched_weight / total_weight) * 100
    return min(round(raw, 1), 100.0)


def score_visual_signature_against_categories(visual_sig: dict, categories: list) -> float:
    """
    Score how well the image's visual fingerprint aligns with expected signatures.
    Returns 0–100.
    """
    if not categories:
        return 50.0  # neutral if no categories

    dominant = visual_sig.get("dominant_color", "unknown")
    entropy   = visual_sig.get("pixel_entropy", 0)
    is_digital = visual_sig.get("is_likely_digital", False)

    # Hard penalty: digital art image
    if is_digital:
        return 0.0

    # Low entropy penalty (stock-like image)
    entropy_bonus = min((entropy - 4.0) * 20, 40) if entropy > 4.0 else 0.0

    # Check dominant color against expected colors for each category
    color_hits = 0
    for cat in categories:
        expected_colors = CATEGORY_VISUAL_SIGNATURES.get(cat, {}).get("dominant_colors", [])
        if dominant in expected_colors:
            color_hits += 1

    color_score = (color_hits / len(categories)) * 60 if categories else 30
    total = color_score + entropy_bonus
    return min(round(total, 1), 100.0)


# ─────────────────────────────────────────────────────────────
# MAIN ANALYSIS
# ─────────────────────────────────────────────────────────────
def analyze_image(file_path):
    result = {
        "ok": True,
        "hash": None,
        "capturedAt": None,
        "gps": None,
        "warnings": [],
        "detectedObjects": [],
        "visualSignature": {},
        "civicSignatureScore": 0
    }

    with open(file_path, "rb") as f:
        data = f.read()

    # ── PIL open ──
    try:
        image = Image.open(io.BytesIO(data))
        image.load()
        result["hash"] = str(imagehash.phash(image))
    except Exception as e:
        result["warnings"].append(f"Image open failure: {str(e)}")
        result["ok"] = False
        return result

    # ── Layer 2: Visual fingerprint ──
    try:
        visual_sig = compute_visual_signature(image)
        result["visualSignature"] = visual_sig
    except Exception as e:
        result["warnings"].append(f"Visual fingerprint error: {str(e)}")
        visual_sig = {}

    # ── Layer 1: YOLO ──
    try:
        detected = detect_objects(file_path)
        result["detectedObjects"] = detected
    except Exception as e:
        result["warnings"].append(f"YOLO error: {str(e)}")
        detected = []

    # ── EXIF ──
    try:
        tags = exifread.process_file(io.BytesIO(data), details=False)
        date_tag = tags.get("EXIF DateTimeOriginal") or tags.get("Image DateTime")
        if date_tag:
            result["capturedAt"] = str(date_tag)

        lat_v = tags.get("GPS GPSLatitude")
        lat_r = tags.get("GPS GPSLatitudeRef")
        lon_v = tags.get("GPS GPSLongitude")
        lon_r = tags.get("GPS GPSLongitudeRef")

        if lat_v and lat_r and lon_v and lon_r:
            lat = _convert_gps_to_decimal(lat_v.values, str(lat_r))
            lng = _convert_gps_to_decimal(lon_v.values, str(lon_r))
            if lat is not None and lng is not None:
                result["gps"] = {"lat": lat, "lng": lng}
    except Exception as e:
        result["warnings"].append(f"EXIF error: {str(e)}")

    # Pillow EXIF fallback
    if not result["capturedAt"]:
        try:
            exif_data = image.getexif()
            if exif_data:
                tag_map = {ExifTags.TAGS.get(k, k): v for k, v in exif_data.items()}
                dt = tag_map.get("DateTimeOriginal") or tag_map.get("DateTime")
                if dt:
                    result["capturedAt"] = str(dt)
        except Exception:
            pass

    return result


# ─────────────────────────────────────────────────────────────
# CLI ENTRY POINT
# ─────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        sys.stdout.write(json.dumps({"ok": False, "error": "Missing image path"}))
        sys.exit(0)

    path = sys.argv[1]
    captured = io.StringIO()
    try:
        with contextlib.redirect_stdout(captured), contextlib.redirect_stderr(captured):
            result = analyze_image(path)
        sys.stdout.write(json.dumps(result))
    except Exception as exc:
        sys.stdout.write(json.dumps({"ok": False, "error": str(exc)}))
    sys.exit(0)


if __name__ == "__main__":
    main()
