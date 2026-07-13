#!/usr/bin/env python3
"""Generate LongRange PWA icons (task 0.6) — pure stdlib, no PIL.

Writes to GameBuild/app/public/:
  icon-192.png, icon-512.png (any-purpose), icon-512-maskable.png
  (content inside the 60% safe zone), apple-touch-icon.png (180, opaque).

Design: dark slate field, off-white scope crosshair (ring + hairlines +
center dot). Deterministic output — rerun any time; icons are committed.
"""
import struct
import zlib
from pathlib import Path

BG = (26, 34, 44, 255)        # dark slate
FG = (232, 238, 244, 255)     # off-white
OUT = Path(__file__).resolve().parent.parent / 'public'


def make_icon(size: int, safe: float) -> bytes:
    c = (size - 1) / 2.0
    ring_r = size * 0.32 * safe
    ring_t = max(size * 0.030 * safe, 1.5)
    hair_t = max(size * 0.016 * safe, 1.0)
    hair_len = size * 0.46 * safe
    dot_r = max(size * 0.035 * safe, 1.5)

    rows = []
    for y in range(size):
        row = bytearray([0])  # PNG filter type 0
        for x in range(size):
            dx, dy = x - c, y - c
            d = (dx * dx + dy * dy) ** 0.5
            on = (
                abs(d - ring_r) <= ring_t
                or (abs(dx) <= hair_t and abs(dy) <= hair_len)
                or (abs(dy) <= hair_t and abs(dx) <= hair_len)
                or d <= dot_r
            )
            row.extend(FG if on else BG)
        rows.append(bytes(row))
    return b''.join(rows)


def write_png(path: Path, size: int, raw: bytes) -> None:
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack('>I', len(data)) + tag + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)  # 8-bit RGBA
    png = (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )
    path.write_bytes(png)
    print(f'  {path.name}  {size}x{size}  {len(png)} B')


OUT.mkdir(exist_ok=True)
write_png(OUT / 'icon-192.png', 192, make_icon(192, 1.0))
write_png(OUT / 'icon-512.png', 512, make_icon(512, 1.0))
write_png(OUT / 'icon-512-maskable.png', 512, make_icon(512, 0.60))
write_png(OUT / 'apple-touch-icon.png', 180, make_icon(180, 0.85))
print('done.')
