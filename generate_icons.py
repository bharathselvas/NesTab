from PIL import Image, ImageDraw, ImageFont

SIZES = [16, 48, 128]
BG = '#111111'
ACCENT = '#007acc'
WHITE = '#ffffff'

def draw_tabs(draw, size):
    """Three ascending rounded rects like browser tabs at top center."""
    cx = size // 2
    tab_w = max(2, size // 10)
    spacing = max(1, size // 24)
    heights = [max(2, size // 8), max(3, size // 6), max(4, size // 5)]
    tab_radius = max(1, size // 40)
    start_x = cx - (tab_w * 3 + spacing * 2) // 2

    for i in range(3):
        h = heights[i]
        x = start_x + i * (tab_w + spacing)
        y = max(1, size // 10)
        draw.rounded_rectangle([x, y, x + tab_w, y + h], radius=tab_radius, fill=ACCENT)

def draw_letter(draw, size):
    """Centered bold N."""
    font_size = size // 2
    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
    except (IOError, OSError):
        font = ImageFont.load_default()
    # Get text bounding box to center it
    bbox = draw.textbbox((0, 0), "N", font=font)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1]
    # Slight vertical offset so N doesn't overlap tabs
    y += size // 16
    draw.text((x, y), "N", fill=ACCENT, font=font)

def generate(size, path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Fully rounded square (circle)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=size // 2, fill=BG)

    draw_tabs(draw, size)
    draw_letter(draw, size)
    img.save(path, 'PNG')
    print(f"  Saved {path}  ({size}x{size})")

if __name__ == '__main__':
    out = '/home/bharath/Projects/tab-saver-extension/icons'
    for s in SIZES:
        generate(s, f'{out}/icon{s}.png')
    print("Done")
