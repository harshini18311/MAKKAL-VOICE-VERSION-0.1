import io
import json
import sys
from PIL import Image, ExifTags
import exifread
import imagehash

# Try to import YOLO for object detection
try:
    from ultralytics import YOLO
    YOLO_AVAILABLE = True
except ImportError:
    YOLO_AVAILABLE = False
    print("Warning: ultralytics not installed. Object detection disabled. Install with: pip install ultralytics", file=sys.stderr)


def _ratio_to_float(value):
    try:
        return float(value.num) / float(value.den)
    except Exception:
        return None


def _convert_gps_to_decimal(values, ref):
    if not values or len(values) != 3:
        return None

    deg = _ratio_to_float(values[0])
    mins = _ratio_to_float(values[1])
    secs = _ratio_to_float(values[2])

    if deg is None or mins is None or secs is None:
        return None

    decimal = deg + (mins / 60.0) + (secs / 3600.0)
    if ref in ("S", "W"):
        decimal *= -1
    return round(decimal, 6)


def detect_objects(file_path):
    """
    Detect objects in image using YOLO v8
    Returns list of detected object labels with confidence scores
    """
    if not YOLO_AVAILABLE:
        return []
    
    try:
        # Load YOLO model (nano for speed, will auto-download)
        model = YOLO("yolov8n.pt")
        
        # Run inference
        results = model.predict(file_path, conf=0.3, verbose=False)
        
        detected_objects = []
        if results and len(results) > 0:
            for result in results:
                if hasattr(result, 'boxes') and result.boxes is not None:
                    for box in result.boxes:
                        class_id = int(box.cls[0])
                        class_name = result.names[class_id]
                        confidence = float(box.conf[0])
                        detected_objects.append({
                            "object": class_name,
                            "confidence": round(confidence, 2)
                        })
        
        return detected_objects
    except Exception as e:
        return []  # Silently fail if YOLO unavailable


def analyze_image(file_path):
    result = {
        "ok": True,
        "hash": None,
        "capturedAt": None,
        "gps": None,
        "warnings": [],
        "detectedObjects": []  # NEW: Object detection results
    }

    with open(file_path, "rb") as f:
        data = f.read()

    image = Image.open(io.BytesIO(data))
    result["hash"] = str(imagehash.phash(image))

    # NEW: Run YOLO object detection
    detected_objects = detect_objects(file_path)
    if detected_objects:
        result["detectedObjects"] = detected_objects

    tags = exifread.process_file(io.BytesIO(data), details=False)

    date_tag = tags.get("EXIF DateTimeOriginal") or tags.get("Image DateTime")
    if date_tag:
        result["capturedAt"] = str(date_tag)
    else:
        result["warnings"].append("No EXIF capture date found")

    lat_values = tags.get("GPS GPSLatitude")
    lat_ref = tags.get("GPS GPSLatitudeRef")
    lon_values = tags.get("GPS GPSLongitude")
    lon_ref = tags.get("GPS GPSLongitudeRef")

    if lat_values and lat_ref and lon_values and lon_ref:
        lat = _convert_gps_to_decimal(lat_values.values, str(lat_ref))
        lng = _convert_gps_to_decimal(lon_values.values, str(lon_ref))
        if lat is not None and lng is not None:
            result["gps"] = {"lat": lat, "lng": lng}
        else:
            result["warnings"].append("GPS data present but could not be parsed")
    else:
        result["warnings"].append("No EXIF GPS location found")

    # Fallback through Pillow if EXIF reader is sparse.
    if not result["capturedAt"]:
        exif_data = image.getexif()
        if exif_data:
            tag_map = {ExifTags.TAGS.get(k, k): v for k, v in exif_data.items()}
            dt = tag_map.get("DateTimeOriginal") or tag_map.get("DateTime")
            if dt:
                result["capturedAt"] = str(dt)

    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"ok": False, "error": "Missing image path"}))
        sys.exit(1)

    path = sys.argv[1]
    try:
        result = analyze_image(path)
        print(json.dumps(result))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
