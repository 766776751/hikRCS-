# -*- coding: utf-8 -*-
"""Programmatically generate a 256x256 industrial-style app icon (PNG + ICO).
No external deps; pure Python stdlib. Design: deep-blue rounded square + white isobox wireframe.
"""
import struct, zlib, os

S = 256
OUT_DIR = os.path.dirname(os.path.abspath(__file__)) + '/build'
os.makedirs(OUT_DIR, exist_ok=True)

# ---- canvas (RGBA) ----
px = [[(0, 0, 0, 0) for _ in range(S)] for _ in range(S)]

def lerp(a, b, t): return a + (b - a) * t

def rounded_rect(x, y, w, h, r):
    """membership test for rounded rect with per-corner radius r"""
    if x < 0 or y < 0 or x >= w or y >= h:
        return False
    cx = min(max(x, r), w - 1 - r)
    cy = min(max(y, r), h - 1 - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r

# background: deep-blue vertical gradient, rounded square inset 8px
for y in range(S):
    t = y / (S - 1)
    r = int(lerp(0x2b, 0x12, t))
    g = int(lerp(0x5a, 0x2f, t))
    b = int(lerp(0x8c, 0x50, t))
    for x in range(S):
        if rounded_rect(x, y, S, S, 46) and (8 <= x < S - 8) and (8 <= y < S - 8):
            if not rounded_rect(x - 8, y - 8, S - 16, S - 16, 40):
                continue
            px[y][x] = (r, g, b, 255)

# subtle inner top highlight
for y in range(8, 70):
    for x in range(48, S - 48):
        r0, g0, b0, a0 = px[y][x]
        if a0:
            f = int(30 * (1 - (y - 8) / 62))
            px[y][x] = (min(255, r0 + f), min(255, g0 + f), min(255, b0 + f), 255)

# ---- isometric box (iso cube) centered ----
CX, CY = 128, 132
W, H, D = 58, 34, 22  # half-width, half-height(top rhombus), depth(height of sides)

def top_pt(i):
    # rhombus: left, top, right, bottom
    pts = [(CX - W, CY), (CX, CY - H), (CX + W, CY), (CX, CY + H)]
    return pts[i]

def bottom_pt(i):
    x, y = top_pt(i)
    return (x, y + D)

def in_poly(x, y, poly):
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]; xj, yj = poly[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

def draw_poly(poly, fill, alpha=255, edge=None, ew=2):
    xs = [p[0] for p in poly]; ys = [p[1] for p in poly]
    for y in range(max(0, min(ys) - 2), min(S, max(ys) + 3)):
        for x in range(max(0, min(xs) - 2), min(S, max(xs) + 3)):
            is_edge = False
            if edge:
                for i in range(len(poly)):
                    ax, ay = poly[i]; bx, by = poly[(i + 1) % len(poly)]
                    vx, vy = bx - ax, by - ay
                    L2 = vx * vx + vy * vy
                    if L2 == 0: continue
                    t = max(0, min(1, ((x - ax) * vx + (y - ay) * vy) / L2))
                    ddx, ddy = x - (ax + t * vx), y - (ay + t * vy)
                    if ddx * ddx + ddy * ddy <= ew * ew:
                        is_edge = True; break
            if is_edge:
                px[y][x] = (*edge, 255)
            elif in_poly(x, y, poly) and px[y][x][3]:
                r0, g0, b0, a0 = px[y][x]
                px[y][x] = (int(lerp(r0, fill[0], 0.55)), int(lerp(g0, fill[1], 0.55)),
                            int(lerp(b0, fill[2], 0.55)), 255)

top = [top_pt(i) for i in range(4)]
bl = bottom_pt(0); bt = bottom_pt(1); br = bottom_pt(2); bb = bottom_pt(3)
# left face: top-left, top-bottom, bottom-bottom, bottom-left
left_face = [top[0], top[3], bb, bl]
right_face = [top[3], top[2], br, bb]
WHITE = (238, 246, 255)
draw_poly(left_face, (150, 190, 230), edge=WHITE, ew=3)
draw_poly(right_face, (110, 160, 215), edge=WHITE, ew=3)
draw_poly(top, (205, 228, 250), edge=WHITE, ew=3)

# vertical seam line on top + label mark (small diamond on top face)
def draw_line(x0, y0, x1, y1, color, w=2):
    steps = int(max(abs(x1 - x0), abs(y1 - y0))) * 2 + 1
    for i in range(steps + 1):
        t = i / steps
        x = int(lerp(x0, x1, t)); y = int(lerp(y0, y1, t))
        for dy in range(-w, w + 1):
            for dx in range(-w, w + 1):
                xx, yy = x + dx, y + dy
                if 0 <= xx < S and 0 <= yy < S and px[yy][xx][3]:
                    px[yy][xx] = (*color, 255)

# cross straps on top face
draw_line(CX - W + 12, CY - H + 6, CX + 12, CY + H - 6, (120, 170, 220), 1)
draw_line(CX + W - 12, CY - H + 6, CX - 12, CY + H - 6, (120, 170, 220), 1)

# ---- encode PNG ----
def chunk(tag, data):
    c = struct.pack('>I', len(data)) + tag + data
    c += struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    return c

raw = b''
for y in range(S):
    raw += b'\x00'
    for x in range(S):
        raw += bytes(px[y][x])
png = b'\x89PNG\r\n\x1a\n'
png += chunk(b'IHDR', struct.pack('>IIBBBBB', S, S, 8, 6, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')

with open(os.path.join(OUT_DIR, 'icon.png'), 'wb') as f:
    f.write(png)

# ---- encode ICO (PNG-compressed, 256x256) ----
ico = struct.pack('<HHH', 0, 1, 1)
ico += struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 22)
ico += png
with open(os.path.join(OUT_DIR, 'icon.ico'), 'wb') as f:
    f.write(ico)

print('icon.png / icon.ico generated in', OUT_DIR)
print('sizes:', len(png), 'bytes (png),', len(ico), 'bytes (ico)')
