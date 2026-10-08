"""Susun GIF demo dari frame tangkapan layar asli (bukan mockup)."""
from pathlib import Path
from PIL import Image

BASE = Path(__file__).resolve().parent
IMAGES = BASE / "images"

frames = []
for name in ("preview-1.png", "preview-2.png"):
    img = Image.open(IMAGES / name).convert("RGB")
    frames.append(img)

if len(frames) >= 2:
    w, h = frames[0].size
    frames = [f.resize((w, h)) for f in frames]
    # tahan lebih lama di frame akhir supaya terbaca
    seq = frames + [frames[-1]] * 2
    seq[0].save(
        IMAGES / "demo.gif",
        save_all=True,
        append_images=seq[1:],
        duration=[900, 1200, 1200, 1200],
        loop=0,
        optimize=True,
    )
    print("demo.gif", (IMAGES / "demo.gif").stat().st_size, "bytes")
else:
    print("butuh minimal 2 frame")
