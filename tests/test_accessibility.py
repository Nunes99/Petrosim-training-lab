import re
from pathlib import Path


CSS_PATH = Path(__file__).resolve().parents[1] / "public" / "css" / "styles.css"
PUBLIC_PATH = CSS_PATH.parent.parent


def relative_luminance(hex_color: str) -> float:
    channels = [
        int(hex_color[index:index + 2], 16) / 255
        for index in (1, 3, 5)
    ]
    linear = [
        value / 12.92
        if value <= 0.04045
        else ((value + 0.055) / 1.055) ** 2.4
        for value in channels
    ]
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]


def contrast_ratio(foreground: str, background: str) -> float:
    lighter, darker = sorted(
        [relative_luminance(foreground), relative_luminance(background)],
        reverse=True,
    )
    return (lighter + 0.05) / (darker + 0.05)


def declarations_from(block: str) -> dict[str, str]:
    declarations = re.findall(
        r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})",
        block,
    )
    return {name: value for name, value in declarations}


def test_core_palette_meets_wcag_aa_for_normal_text():
    stylesheet = CSS_PATH.read_text(encoding="utf-8")
    light_palette = {}
    for root_block in re.findall(r":root\s*\{(.*?)\}", stylesheet, re.DOTALL):
        light_palette.update(declarations_from(root_block))
    dark_match = re.search(
        r'html\[data-theme="dark"\]\s*\{(.*?)\}',
        stylesheet,
        re.DOTALL,
    )
    assert dark_match
    dark_palette = {**light_palette, **declarations_from(dark_match.group(1))}
    white = "#ffffff"

    light_pairs = [
        (light_palette["text"], white),
        (light_palette["muted"], white),
        (light_palette["brand-navy"], white),
        (light_palette["brand-gold-strong"], white),
        (light_palette["brand-navy"], light_palette["brand-gold-soft"]),
    ]
    dark_pairs = [
        (dark_palette["text"], dark_palette["surface"]),
        (dark_palette["muted"], dark_palette["surface"]),
        (dark_palette["brand-gold-soft"], dark_palette["paper"]),
    ]

    assert all(
        contrast_ratio(foreground, background) >= 4.5
        for foreground, background in light_pairs + dark_pairs
    )


def test_theme_toggle_is_available_on_every_page():
    pages = list(PUBLIC_PATH.rglob("*.html"))
    assert pages
    assert all('/js/theme.js' in page.read_text(encoding="utf-8") for page in pages)
