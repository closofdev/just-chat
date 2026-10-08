"""Rekam animasi stream sungguhan lalu ubah jadi GIF dan WebM/MP4.

Jalankan server dulu (npm run dev atau npm run serve), lalu:
    python docs/capture.py

Butuh: pip install pillow playwright && playwright install chromium
"""
import asyncio
import shutil
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent
IMAGES = BASE / "images"
FRAMES = BASE / "frames"
URL = "http://localhost:8081/"
PROMPT = "buatkan fungsi kalkulator python sederhana"

try:
    from playwright.async_api import async_playwright
except ImportError:
    sys.exit("playwright belum terpasang: pip install playwright && playwright install chromium")

from PIL import Image


async def record():
    FRAMES.mkdir(exist_ok=True)
    for f in FRAMES.glob("*.png"):
        f.unlink()

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 760, "height": 900}, device_scale_factor=2)
        await page.goto(URL)
        await page.wait_for_selector("textarea")
        await page.fill("textarea", PROMPT)
        await page.click(".send-btn")

        # tangkap tiap 120ms selama stream berjalan
        for i in range(90):
            await page.screenshot(path=FRAMES / f"{i:03d}.png")
            await page.wait_for_timeout(120)
            done = await page.evaluate(
                "() => !document.querySelector('.streaming-caret') && !!document.querySelector('.ai-actions')"
            )
            if done and i > 5:
                await page.screenshot(path=FRAMES / f"{i+1:03d}.png")
                break

        await browser.close()


def build_gif():
    files = sorted(FRAMES.glob("*.png"))
    if not files:
        sys.exit("tidak ada frame")
    imgs = [Image.open(f).convert("RGB") for f in files]
    # perkecil agar GIF ringan
    w, h = imgs[0].size
    scale = 0.55
    size = (int(w * scale), int(h * scale))
    imgs = [im.resize(size) for im in imgs]
    # ambil maksimal 60 frame merata
    step = max(1, len(imgs) // 60)
    imgs = imgs[::step]
    out = IMAGES / "demo.gif"
    imgs[0].save(out, save_all=True, append_images=imgs[1:], duration=120, loop=0, optimize=True)
    print("gif:", out, out.stat().st_size, "bytes")


def build_video():
    """Gabung frame jadi WebM pakai ffmpeg bila tersedia."""
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        print("ffmpeg tidak ada, lewati video (GIF tetap jadi)")
        return
    out = IMAGES / "demo.webm"
    import subprocess

    subprocess.run(
        [
            ffmpeg, "-y", "-framerate", "8",
            "-i", str(FRAMES / "%03d.png"),
            "-c:v", "libvpx-vp9", "-pix_fmt", "yuv420p", "-b:v", "0", "-crf", "34",
            str(out),
        ],
        check=True,
    )
    print("video:", out, out.stat().st_size, "bytes")


if __name__ == "__main__":
    asyncio.run(record())
    build_gif()
    build_video()
