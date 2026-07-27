import re
from pathlib import Path


CSS_PATH = Path(__file__).resolve().parents[1] / "public" / "css" / "styles.css"


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


def test_core_palette_meets_wcag_aa_for_normal_text():
    stylesheet = CSS_PATH.read_text(encoding="utf-8")
    declarations = re.findall(
        r"--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})",
        stylesheet,
    )
    palette = {name: value for name, value in declarations}
    white = "#ffffff"

    pairs = [
        (palette["text"], white),
        (palette["muted"], white),
        (palette["brand-navy"], white),
        (palette["brand-gold-strong"], white),
        (palette["brand-navy"], palette["brand-gold-soft"]),
    ]

    assert all(contrast_ratio(foreground, background) >= 4.5 for foreground, background in pairs)
