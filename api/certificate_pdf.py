from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Callable

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas


NAVY = colors.HexColor("#00365B")
GOLD = colors.HexColor("#C9A55B")
GOLD_SOFT = colors.HexColor("#EAC78B")
CREAM = colors.HexColor("#FFF8E4")
MUTED = colors.HexColor("#526A78")
LINE = colors.HexColor("#CBD5DB")


def _text_lines(text: str, font: str, size: float, max_width: float) -> list[str]:
    words = (text or "").split()
    lines: list[str] = []
    current = ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if not current or stringWidth(candidate, font, size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines or [""]


def _draw_centered_wrapped(
    pdf: canvas.Canvas,
    text: str,
    center_x: float,
    top_y: float,
    max_width: float,
    font: str,
    size: float,
    color= NAVY,
    leading: float | None = None,
) -> float:
    line_height = leading or size * 1.25
    pdf.setFillColor(color)
    pdf.setFont(font, size)
    y = top_y
    for line in _text_lines(text, font, size, max_width):
        pdf.drawCentredString(center_x, y, line)
        y -= line_height
    return y


def _draw_asset(
    pdf: canvas.Canvas,
    path: str | None,
    x: float,
    y: float,
    width: float,
    height: float,
    asset_loader: Callable[[str], bytes | None] | None,
) -> bool:
    if not path or not asset_loader:
        return False
    try:
        payload = asset_loader(path)
        if not payload:
            return False
        pdf.drawImage(
            ImageReader(BytesIO(payload)),
            x,
            y,
            width,
            height,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
        return True
    except Exception:
        return False


def _draw_qr(pdf: canvas.Canvas, target: str, x: float, y: float, size: float) -> None:
    widget = qr.QrCodeWidget(target, barLevel="H")
    widget.barFillColor = colors.black
    bounds = widget.getBounds()
    source_width = bounds[2] - bounds[0]
    source_height = bounds[3] - bounds[1]
    quiet = size * 0.11
    drawing = Drawing(
        size,
        size,
        transform=[
            (size - quiet * 2) / source_width,
            0,
            0,
            (size - quiet * 2) / source_height,
            quiet,
            quiet,
        ],
    )
    drawing.add(widget)
    pdf.setFillColor(colors.white)
    pdf.rect(x, y, size, size, fill=1, stroke=0)
    renderPDF.draw(drawing, pdf, x, y)


def _draw_classic(
    pdf: canvas.Canvas,
    data: dict,
    width: float,
    height: float,
) -> None:
    margin = 24
    pdf.setFillColor(colors.HexColor("#FFFDF7"))
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setStrokeColor(NAVY)
    pdf.setLineWidth(8)
    pdf.rect(margin, margin, width - margin * 2, height - margin * 2, fill=0, stroke=1)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(2)
    pdf.rect(margin + 10, margin + 10, width - (margin + 10) * 2, height - (margin + 10) * 2)

    brand_x = margin + 34
    brand_y = height - margin - 66
    pdf.setFillColor(GOLD_SOFT)
    pdf.roundRect(brand_x, brand_y, 42, 42, 10, fill=1, stroke=0)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 12)
    pdf.drawCentredString(brand_x + 21, brand_y + 15, "PS")
    pdf.setFont("Helvetica-Bold", 13)
    pdf.drawString(brand_x + 54, brand_y + 26, "PetroSimLab")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7.5)
    pdf.drawString(brand_x + 54, brand_y + 12, "FORMAÇÃO TÉCNICA APLICADA")

    center_x = width / 2
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(center_x, height - 152, "CERTIFICADO DE CONCLUSÃO")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(center_x, height - 181, "Certificamos que")
    _draw_centered_wrapped(
        pdf, data["student_name"], center_x, height - 224, width - 150,
        "Helvetica-Bold", 27, NAVY, 30,
    )
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 11)
    pdf.drawCentredString(center_x, height - 267, "concluiu com aproveitamento o laboratório")
    _draw_centered_wrapped(
        pdf, data["module_title"], center_x, height - 305, width - 170,
        "Helvetica-Bold", 19, GOLD, 22,
    )
    _draw_centered_wrapped(
        pdf, data["module_description"], center_x, height - 343, width - 220,
        "Helvetica", 8.5, MUTED, 11,
    )

    details_y = 116
    left = margin + 36
    available = width - (margin + 36) * 2
    cell_width = available / 3
    pdf.setStrokeColor(LINE)
    pdf.setLineWidth(0.8)
    pdf.line(left, details_y + 58, left + available, details_y + 58)
    pdf.line(left, details_y, left + available, details_y)
    details = [
        ("RESULTADO FINAL", f"{data['final_score']}%"),
        ("DATA DE EMISSÃO", data["issued_date"]),
        ("CARGA DE REFERÊNCIA", f"{data['duration_minutes']} minutos"),
    ]
    for index, (label, value) in enumerate(details):
        x = left + cell_width * index
        if index:
            pdf.line(x, details_y, x, details_y + 58)
        pdf.setFillColor(MUTED)
        pdf.setFont("Helvetica", 7)
        pdf.drawCentredString(x + cell_width / 2, details_y + 38, label)
        pdf.setFillColor(NAVY)
        pdf.setFont("Helvetica-Bold", 9)
        pdf.drawCentredString(x + cell_width / 2, details_y + 20, value)

    _draw_qr(pdf, data["verification_url"], left, 34, 82)
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 7)
    pdf.drawString(left + 96, 72, "CÓDIGO DE VERIFICAÇÃO")
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 8.5)
    pdf.drawString(left + 96, 56, data["certificate_code"])
    pdf.setFont("Helvetica-Bold", 9)
    pdf.drawRightString(width - left, 70, "PetroSimLab")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6.8)
    pdf.drawRightString(width - left, 55, data["product_credit"])


def _draw_qualification(
    pdf: canvas.Canvas,
    data: dict,
    width: float,
    height: float,
    asset_loader: Callable[[str], bytes | None] | None,
) -> None:
    template = data["template"]
    margin = 18
    pdf.setFillColor(colors.HexColor("#FFFDF8"))
    pdf.rect(0, 0, width, height, fill=1, stroke=0)
    pdf.setStrokeColor(GOLD)
    pdf.setLineWidth(9)
    pdf.rect(margin, margin, width - margin * 2, height - margin * 2)
    pdf.setStrokeColor(NAVY)
    pdf.setLineWidth(2)
    pdf.rect(margin + 10, margin + 10, width - (margin + 10) * 2, height - (margin + 10) * 2)

    split_x = 325
    pdf.setStrokeColor(colors.HexColor("#DFD4B9"))
    pdf.setLineWidth(0.7)
    pdf.line(split_x, 52, split_x, height - 52)

    left_center = 170
    _draw_asset(
        pdf, template.get("logo_path"), 104, height - 132, 132, 76, asset_loader,
    )
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 11)
    pdf.drawCentredString(left_center, height - 146, template.get("issuer_name") or "LMTWEBNAIRS")
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6.5)
    pdf.drawCentredString(left_center, height - 160, "FORMAÇÃO TÉCNICA APLICADA")
    _draw_centered_wrapped(
        pdf, template.get("certificate_title") or "Certificado de Qualificação",
        left_center, height - 202, 240, "Helvetica-Bold", 15, GOLD, 18,
    )
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica", 9)
    pdf.drawCentredString(
        left_center, height - 235,
        template.get("qualification_label") or "Qualificação profissional",
    )
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica-Bold", 10)
    pdf.drawCentredString(left_center, height - 292, data["certificate_code"])
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica", 7)
    pdf.drawCentredString(left_center, height - 308, "NÚMERO DE REGISTO")
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(
        left_center, height - 352,
        template.get("location_text") or "Cidade de Maputo, Moçambique",
    )
    pdf.setFont("Helvetica", 8)
    pdf.drawCentredString(left_center, height - 368, data["issued_date"])

    signature_y = 64
    _draw_asset(
        pdf, template.get("director_signature_path"), 105, signature_y + 25, 120, 48,
        asset_loader,
    )
    _draw_asset(
        pdf, template.get("academic_stamp_path"), 198, signature_y + 10, 62, 62,
        asset_loader,
    )
    pdf.setStrokeColor(NAVY)
    pdf.line(88, signature_y + 18, 252, signature_y + 18)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawCentredString(left_center, signature_y + 5, template.get("director_name") or "Direção Académica")

    right_center = (split_x + width - 30) / 2
    pdf.setFillColor(GOLD)
    pdf.setFont("Helvetica", 10)
    pdf.drawCentredString(right_center, height - 88, "O PRESENTE DOCUMENTO CERTIFICA QUE")
    _draw_centered_wrapped(
        pdf, data["student_name"], right_center, height - 126, width - split_x - 90,
        "Helvetica-Bold", 19, NAVY, 22,
    )
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 9)
    pdf.drawCentredString(right_center, height - 160, "concluiu com sucesso e aproveitamento o laboratório")
    _draw_centered_wrapped(
        pdf, data["module_title"], right_center, height - 196, width - split_x - 90,
        "Helvetica-Bold", 15, NAVY, 18,
    )
    _draw_centered_wrapped(
        pdf, data["module_description"], right_center, height - 234,
        width - split_x - 105, "Helvetica", 8, MUTED, 10,
    )

    topics = template.get("program_topics") or [
        "Conteúdo técnico aplicado",
        "Simulação e interpretação de resultados",
    ]
    topic_y = height - 286
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(split_x + 48, topic_y, "O PROGRAMA ABORDOU:")
    pdf.setFont("Helvetica", 7.5)
    for topic in topics[:5]:
        topic_y -= 17
        pdf.drawString(split_x + 54, topic_y, f"• {topic[:72]}")

    pdf.setFont("Helvetica-Bold", 8)
    pdf.drawString(split_x + 48, 151, f"Carga horária: {data['duration_minutes']} minutos")
    pdf.drawString(split_x + 225, 151, f"Resultado final: {data['final_score']}%")
    _draw_qr(pdf, data["verification_url"], split_x + 42, 50, 84)
    _draw_asset(
        pdf, template.get("coordinator_signature_path"), split_x + 184, 82, 135, 48,
        asset_loader,
    )
    _draw_asset(
        pdf, template.get("institutional_seal_path"), split_x + 285, 62, 58, 58,
        asset_loader,
    )
    pdf.setStrokeColor(NAVY)
    pdf.line(split_x + 176, 76, split_x + 330, 76)
    pdf.setFillColor(NAVY)
    pdf.setFont("Helvetica-Bold", 7.5)
    pdf.drawCentredString(
        split_x + 253, 63,
        template.get("coordinator_name") or "Coordenação do Programa",
    )
    pdf.setFillColor(MUTED)
    pdf.setFont("Helvetica", 6.2)
    pdf.drawRightString(width - 44, 46, data["product_credit"])


def build_certificate_pdf(
    data: dict,
    model: str = "qualification",
    asset_loader: Callable[[str], bytes | None] | None = None,
) -> bytes:
    buffer = BytesIO()
    page_size = landscape(A4)
    pdf = canvas.Canvas(buffer, pagesize=page_size, pageCompression=1)
    pdf.setTitle("PetroSimLab")
    pdf.setAuthor("PetroSimLab")
    width, height = page_size
    if model == "classic":
        _draw_classic(pdf, data, width, height)
    else:
        _draw_qualification(pdf, data, width, height, asset_loader)
    pdf.showPage()
    pdf.save()
    return buffer.getvalue()
