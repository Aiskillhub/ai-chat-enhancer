"""Generate icon matching desktop LOGO style: bold geometric AI lettermark."""
from PIL import Image, ImageDraw, ImageFont
import os, math

OUT = os.path.join(os.path.dirname(__file__), 'icons')

# Try fonts in order of preference - match the desktop LOGO's bold geometric style
FONT_CANDIDATES = [
    '/System/Library/Fonts/Supplemental/Arial Black.ttf',
    '/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf',
    '/System/Library/Fonts/Supplemental/Arial Bold.ttf',
    '/System/Library/Fonts/Helvetica.ttc',
]

FONT = None
for fp in FONT_CANDIDATES:
    if os.path.exists(fp):
        try:
            ImageFont.truetype(fp, 40)
            FONT = fp
            break
        except:
            pass

if not FONT:
    FONT = '/System/Library/Fonts/Supplemental/Arial Bold.ttf'

BG_DARK = (18, 18, 18)      # #121212 matching desktop LOGO dark
WHITE = (255, 255, 255)
ACCENT = (108, 92, 231)     # for accent version


def make_icon(size):
    im = Image.new('RGBA', (size, size), (0,0,0,0))
    draw = ImageDraw.Draw(im)
    r = int(size * 0.22)

    # Matching desktop LOGO: dark background
    draw.rounded_rectangle([0, 0, size-1, size-1], radius=r, fill=BG_DARK)

    # Bold "AI" text, centered, white (matching desktop style)
    font_size = int(size * 0.50)
    font = ImageFont.truetype(FONT, font_size)

    # For Arial Black, we need to measure precisely
    text = "AI"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]

    tx = (size - tw) / 2 - bbox[0]
    ty = (size - th) / 2 - bbox[1] - size * 0.01

    # Draw white text
    draw.text((tx, ty), text, font=font, fill=WHITE)

    return im


for s in [16, 48, 128]:
    make_icon(s).save(os.path.join(OUT, f'icon{s}.png'), 'PNG')
    print(f'  icon{s}.png OK')

print('Done! Matching desktop LOGO style.')
