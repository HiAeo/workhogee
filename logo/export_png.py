#!/usr/bin/env python3
"""WorkHogee Text Logo v10: PNG + favicon.ico export"""
import os
from PIL import Image, ImageDraw, ImageFont

LOGO_DIR = r"C:\Users\91003\Desktop\创业项目孵化\workhogee\logo"
FONT_PATH = r"C:\Windows\Fonts\corbelb.ttf"  # Corbel Bold
ORANGE = (234, 88, 12, 255)   # #ea580c
INK = (28, 25, 23, 255)       # #1c1917
WHITE = (255, 255, 255, 255)

def draw_text_logo(width, text_color=INK):
    """Draw WorkHogee text logo with split-W (orange left half).
    viewBox: 0 0 360 80, font-size 48, baseline y=58
    """
    height = int(width * 80 / 360)
    scale = width / 360.0
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))

    font_size = max(10, int(48 * scale))
    font = ImageFont.truetype(FONT_PATH, font_size)
    text = "WorkHogee"

    # Calculate text position (SVG y=58 with dominant-baseline central)
    bbox = font.getbbox(text)
    text_h = bbox[3] - bbox[1]
    # SVG central baseline at y=58; Pillow draws from top-left
    ty = int(58 * scale) - text_h // 2 - bbox[1]
    tx = 0

    # 1. Draw full text in text color
    draw = ImageDraw.Draw(img)
    draw.text((tx, ty), text, fill=text_color, font=font)

    # 2. Draw orange W on a separate layer
    w_layer = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    w_draw = ImageDraw.Draw(w_layer)
    w_draw.text((tx, ty), "W", fill=ORANGE, font=font)

    # 3. Create mask: left half of W = white (show orange), right = black (show text color)
    # W clip width = 21 in viewBox coords
    clip_w = int(21 * scale)
    mask = Image.new("L", (width, height), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rectangle([0, 0, clip_w, height], fill=255)

    # 4. Composite: orange W where mask white, text color where mask black
    img = Image.composite(w_layer, img, mask)

    return img

def draw_w_favicon(size):
    """Draw favicon: split-W only (orange left, dark right), centered."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    font_size = int(size * 0.72)
    font = ImageFont.truetype(FONT_PATH, font_size)

    bbox = font.getbbox("W")
    w_w = bbox[2] - bbox[0]
    w_h = bbox[3] - bbox[1]
    tx = (size - w_w) // 2 - bbox[0]
    ty = (size - w_h) // 2 - bbox[1]

    # Full W in dark
    draw = ImageDraw.Draw(img)
    draw.text((tx, ty), "W", fill=INK, font=font)

    # Orange W clipped to left half
    w_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(w_layer).text((tx, ty), "W", fill=ORANGE, font=font)

    clip_w = (size - w_w) // 2 + w_w // 2
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rectangle([0, 0, clip_w, size], fill=255)

    img = Image.composite(w_layer, img, mask)
    return img

def main():
    os.chdir(LOGO_DIR)

    print("=== Exporting WorkHogee Text Logo v10 ===\n")

    # Horizontal text logo (light) - 1800x400
    h = draw_text_logo(1800, INK)
    h_path = os.path.join(LOGO_DIR, "workhogee-logo-text.png")
    h.save(h_path, "PNG")
    print(f"  OK: {h_path} ({h.size[0]}x{h.size[1]})")

    # Horizontal text logo (dark bg version) - 1800x400
    hd = draw_text_logo(1800, WHITE)
    hd_path = os.path.join(LOGO_DIR, "workhogee-logo-text-dark.png")
    hd.save(hd_path, "PNG")
    print(f"  OK: {hd_path} ({hd.size[0]}x{hd.size[1]})")

    # Favicon - multi-size ICO
    fav_base = draw_w_favicon(256)
    fav_path = os.path.join(LOGO_DIR, "favicon.ico")
    sizes = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    fav_base.save(fav_path, format="ICO", sizes=sizes)
    print(f"  OK: {fav_path} (sizes: {sizes})")

    print("\n=== Done! ===")
    for f in ["workhogee-logo-text.png", "workhogee-logo-text-dark.png", "favicon.ico"]:
        path = os.path.join(LOGO_DIR, f)
        size = os.path.getsize(path)
        print(f"  {f}: {size:,} bytes")

if __name__ == "__main__":
    main()
