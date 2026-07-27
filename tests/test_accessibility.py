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


def test_dashboard_metrics_and_profile_photo_controls_are_present():
    stylesheet = CSS_PATH.read_text(encoding="utf-8")
    dashboard = (PUBLIC_PATH / "dashboard.html").read_text(encoding="utf-8")
    profile = (PUBLIC_PATH / "profile.html").read_text(encoding="utf-8")
    profile_script = (PUBLIC_PATH / "js" / "profile.js").read_text(encoding="utf-8")
    schema = (
        Path(__file__).resolve().parents[1] / "database" / "schema.sql"
    ).read_text(encoding="utf-8")

    assert dashboard.count('class="metric-card"') == 4
    assert re.search(
        r"\.app-body \.metric-grid\s*\{[^}]*repeat\(4,minmax\(0,1fr\)\)",
        stylesheet,
        re.DOTALL,
    )
    assert re.search(
        r"\.profile-header h1\s*\{[^}]*color:\s*#fff",
        stylesheet,
        re.DOTALL,
    )
    assert 'id="profile-photo-input"' in profile
    assert 'accept="image/png,image/jpeg,image/webp"' in profile
    assert '.from("profile-avatars")' in profile_script
    assert "avatar_path text" in schema
    assert "'profile-avatars'" in schema


def test_button_system_is_shared_across_platform_controls():
    stylesheet = CSS_PATH.read_text(encoding="utf-8")

    assert "--button-height: 44px" in stylesheet
    assert "--button-height-compact: 36px" in stylesheet
    assert "--button-radius: 8px" in stylesheet
    for selector in (
        ".button",
        ".text-button",
        ".sidebar-login",
        ".admin-nav button",
        ".decision-option",
        ".im3-select-trigger",
        ".im3-select-option",
        ".access-user-option",
        ".profile-photo-upload",
        ".theme-toggle",
    ):
        assert selector in stylesheet
    assert 'input[type="file"]::file-selector-button' in stylesheet


def test_identity_status_and_admin_user_management_are_available():
    root = Path(__file__).resolve().parents[1]
    stylesheet = CSS_PATH.read_text(encoding="utf-8")
    admin = (PUBLIC_PATH / "admin.html").read_text(encoding="utf-8")
    admin_script = (PUBLIC_PATH / "js" / "admin.js").read_text(encoding="utf-8")
    profile = (PUBLIC_PATH / "profile.html").read_text(encoding="utf-8")
    login = (PUBLIC_PATH / "login.html").read_text(encoding="utf-8")
    admin_login = (PUBLIC_PATH / "admin-login.html").read_text(encoding="utf-8")
    schema = (root / "database" / "schema.sql").read_text(encoding="utf-8")
    product_credit = "PetroSimLab, produto da LMTWEB, desenvolvido pela LEMOTE."

    assert 'id="profile-public-id"' in profile
    assert 'id="user-details-dialog"' in admin
    assert 'id="user-details-public-id"' in admin
    assert 'id="user-details-cancel"' in admin
    assert 'id="user-details-delete"' in admin
    assert 'admin_update_user_profile' in admin_script
    assert 'admin_delete_user_account' in admin_script
    assert 'create or replace function public.admin_update_user_profile' in schema
    assert 'create or replace function public.admin_delete_user_account' in schema
    assert 'create or replace function public.generate_public_profile_id' in schema
    assert "'ADM'" in schema
    assert "'REV'" in schema
    assert "'ST'" in schema
    assert "role = 'student' and public_id ~ '^ST-[0-9]{5}$'" in schema
    assert "role = 'admin' and public_id ~ '^ADM-[0-9]{5}$'" in schema
    assert "role = 'instructor' and public_id ~ '^REV-[0-9]{5}$'" in schema
    assert product_credit in login
    assert product_credit in admin_login
    assert ".status-pill," in stylesheet
    assert ".certificate-seal > .material-symbols-outlined" in stylesheet
    assert 'html[data-theme="dark"] .learning-auth' in stylesheet
    assert 'todo o texto da interface fica branco' in stylesheet
    assert 'color: #fff !important' in stylesheet
    assert ".professional-module-item .module-publish-marker" in stylesheet
    assert ".feed-marker.material-symbols-outlined" in stylesheet
