#!/usr/bin/env python3
"""
Generate PWA icons for CompEng Portal.

Run once, from frontend/:
    python3 scripts/generate_icons.py

Requires Pillow (already installed for avatar uploads).
"""
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).resolve().parent.parent / "public"
OUT_DIR.mkdir(exist_ok=True)

BG    = (15, 23, 42, 255)      # slate-900
BRAND = (59, 130, 246, 255)     # brand-500


def find_font(size):
    candidates = [
        "/System/Library/Fonts/Helvetica.ttc",
        "/System/Library/Fonts/SFNS.ttf",
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/System/Library/Fonts/Arial.ttf",
    ]
    for path in candidates:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                continue
    return ImageFont.load_default()


def draw_icon(size, *, maskable=False, out_path=None):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    radius = int(size * 0.22)
    draw.rounded_rectangle(
        [0, 0, size - 1, size - 1], radius=radius, fill=BG,
    )

    # Maskable icons need safe-zone padding (Android crops to circle).
    font_size = int(size * (0.42 if maskable else 0.58))
    font = find_font(font_size)

    text = "C"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1]

    draw.text((x, y), text, fill=BRAND, font=font)

    if out_path:
        img.save(out_path, "PNG", optimize=True)
        print(f"  wrote {out_path.name} ({size}x{size})")

    return img


def main():
    print(f"Generating PWA icons in {OUT_DIR}")

    draw_icon(192, out_path=OUT_DIR / "icon-192.png")
    draw_icon(512, out_path=OUT_DIR / "icon-512.png")
    draw_icon(512, maskable=True, out_path=OUT_DIR / "icon-maskable-512.png")
    draw_icon(180, out_path=OUT_DIR / "apple-touch-icon.png")
    draw_icon(32, out_path=OUT_DIR / "favicon-32x32.png")
    draw_icon(16, out_path=OUT_DIR / "favicon-16x16.png")

    print("\nDone. Next:")
    print("  1. Bump SW cache in public/sw.js (compeng-v2 → compeng-v3)")
    print("  2. Reload the app — Chrome address bar shows an Install icon")
    print("  3. iOS Safari: Share → Add to Home Screen")


if __name__ == "__main__":
    main()