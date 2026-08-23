#!/usr/bin/env python3
"""Génère les icônes PNG de la PWA (haltère sur fond dégradé).

    pip install pillow && python3 tools/gen_icons.py
"""
from PIL import Image, ImageDraw
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "web", "icons")
os.makedirs(OUT, exist_ok=True)

BG_TOP = (255, 176, 32)
BG_BOT = (255, 71, 26)
FG = (255, 255, 255)
S = 1024          # canvas de travail, redimensionné ensuite


def gradient(size, radius_ratio):
    """Fond dégradé, coins arrondis (0 = carré plein pour l'icône maskable)."""
    img = Image.new("RGB", (size, size))
    d = ImageDraw.Draw(img)
    for y in range(size):
        t = y / (size - 1)
        d.line(
            [(0, y), (size, y)],
            fill=tuple(round(BG_TOP[i] + (BG_BOT[i] - BG_TOP[i]) * t) for i in range(3)),
        )
    img = img.convert("RGBA")
    if radius_ratio > 0:
        mask = Image.new("L", (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=int(size * radius_ratio), fill=255
        )
        img.putalpha(mask)
    return img


def dumbbell(img, scale=1.0):
    """Haltère blanc centré."""
    d = ImageDraw.Draw(img)
    size = img.size[0]
    cx = cy = size / 2
    u = size / 1024 * scale

    bar_h, bar_w = 74 * u, 300 * u
    d.rounded_rectangle(
        [cx - bar_w / 2, cy - bar_h / 2, cx + bar_w / 2, cy + bar_h / 2],
        radius=bar_h / 2, fill=FG,
    )
    for sign in (-1, 1):
        # disque intérieur (haut)
        ix = cx + sign * 190 * u
        d.rounded_rectangle(
            [ix - 46 * u, cy - 150 * u, ix + 46 * u, cy + 150 * u],
            radius=40 * u, fill=FG,
        )
        # disque extérieur
        ox = cx + sign * 288 * u
        d.rounded_rectangle(
            [ox - 42 * u, cy - 100 * u, ox + 42 * u, cy + 100 * u],
            radius=36 * u, fill=FG,
        )
    return img


def build(name, size, radius_ratio, scale=1.0):
    img = dumbbell(gradient(S, radius_ratio), scale)
    img.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))
    print("→", name, f"{size}x{size}")


build("icon-192.png", 192, 0.22)
build("icon-512.png", 512, 0.22)
build("icon-maskable-512.png", 512, 0.0, scale=0.72)   # zone de sécurité Android
build("apple-touch-icon.png", 180, 0.0)                # iOS arrondit lui-même
