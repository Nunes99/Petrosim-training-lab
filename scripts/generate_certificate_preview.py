"""Generate the approved horizontal PetroSimLab certificate design preview."""

from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "public" / "assets" / "certificates" / "default"
OUTPUT = ROOT / "output" / "pdf" / "petrosim-certificate-model.pdf"

NAVY = colors.HexColor("#00365B")
GOLD = colors.HexColor("#C9A55B")
GOLD_TEXT = colors.HexColor("#8A631D")
SOFT_GOLD = colors.HexColor("#EAC78B")
CREAM = colors.HexColor("#FFF8E4")


def configure_fonts() -> tuple[str, str]:
    regular = Path("C:/Windows/Fonts/arial.ttf")
    bold = Path("C:/Windows/Fonts/arialbd.ttf")
    if regular.exists() and bold.exists():
        pdfmetrics.registerFont(TTFont("CertificateSans", str(regular)))
        pdfmetrics.registerFont(TTFont("CertificateSans-Bold", str(bold)))
        return "CertificateSans", "CertificateSans-Bold"
    return "Helvetica", "Helvetica-Bold"


def centered_text(
    page: canvas.Canvas,
    text: str,
    center_x: float,
    y: float,
    font: str,
    size: float,
    color: colors.Color = NAVY,
) -> None:
    page.setFillColor(color)
    page.setFont(font, size)
    page.drawCentredString(center_x, y, text)


def add_qr(page: canvas.Canvas, value: str, x: float, y: float, size: float) -> None:
    widget = qr.QrCodeWidget(value)
    bounds = widget.getBounds()
    width = bounds[2] - bounds[0]
    height = bounds[3] - bounds[1]
    drawing = Drawing(size, size, transform=[size / width, 0, 0, size / height, 0, 0])
    drawing.add(widget)
    renderPDF.draw(drawing, page, x, y)


def generate() -> Path:
    regular, bold = configure_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    width, height = landscape(A4)
    page = canvas.Canvas(str(OUTPUT), pagesize=(width, height))
    page.setTitle("Modelo de Certificado PetroSimLab")

    page.setFillColor(colors.white)
    page.rect(0, 0, width, height, fill=1, stroke=0)
    page.setStrokeColor(GOLD)
    page.setLineWidth(10)
    page.rect(18, 18, width - 36, height - 36, fill=0, stroke=1)
    page.setStrokeColor(NAVY)
    page.setLineWidth(2.4)
    page.rect(29, 29, width - 58, height - 58, fill=0, stroke=1)
    page.setStrokeColor(SOFT_GOLD)
    page.setLineWidth(0.8)
    page.rect(37, 37, width - 74, height - 74, fill=0, stroke=1)

    split_x = 365
    page.setStrokeColor(colors.HexColor("#DDCDA9"))
    page.setLineWidth(0.8)
    page.line(split_x, 65, split_x, height - 58)

    left_center = split_x / 2 + 10
    right_center = split_x + (width - split_x) / 2 - 8
    logo = ASSETS / "lmtwebnairs-logo.png"
    page.drawImage(str(logo), left_center - 62, height - 150, 124, 82, mask="auto", preserveAspectRatio=True)
    centered_text(page, "LMTWEBNAIRS", left_center, height - 168, bold, 12, GOLD_TEXT)
    centered_text(page, "FORMAÇÃO TÉCNICA APLICADA", left_center, height - 181, regular, 6.5, GOLD_TEXT)

    page.setStrokeColor(colors.HexColor("#DDCDA9"))
    page.line(92, height - 200, split_x - 72, height - 200)
    centered_text(page, "CERTIFICADO DE QUALIFICAÇÃO", left_center, height - 228, bold, 17, GOLD_TEXT)
    centered_text(page, "Qualificação profissional", left_center, height - 252, regular, 10)
    centered_text(page, "PSL-2026-DEMONSTRAÇÃO", left_center, height - 306, bold, 11, GOLD_TEXT)
    centered_text(page, "Documento de qualificação", left_center, height - 334, regular, 9)
    centered_text(page, "Número de registo", left_center, height - 372, regular, 8)
    centered_text(page, "PSL-2026-DEMONSTRAÇÃO", left_center, height - 394, bold, 10, GOLD_TEXT)
    centered_text(page, "Cidade de Maputo, Moçambique", left_center, 142, bold, 9)
    centered_text(page, "27 de Julho de 2026", left_center, 125, regular, 8.5)

    director_signature = ASSETS / "director-signature.png"
    academic_stamp = ASSETS / "academic-stamp.png"
    page.drawImage(
        str(director_signature), left_center - 55, 70, 100, 55,
        mask="auto", preserveAspectRatio=True,
    )
    page.drawImage(
        str(academic_stamp), left_center + 25, 55, 70, 70,
        mask="auto", preserveAspectRatio=True,
    )
    page.setStrokeColor(NAVY)
    page.line(left_center - 95, 72, left_center + 95, 72)
    centered_text(page, "Direção Académica", left_center, 57, bold, 8.5)
    centered_text(page, "Diretor Académico", left_center, 44, regular, 7)

    centered_text(page, "O presente documento certifica que", right_center, height - 102, regular, 11, GOLD_TEXT)
    centered_text(page, "NOME DO FORMANDO", right_center, height - 135, bold, 16)
    centered_text(page, "concluiu com sucesso e aproveitamento satisfatório o laboratório", right_center, height - 164, regular, 9.5)
    centered_text(page, "LABORATÓRIO DE RESERVAS DE RESERVATÓRIO", right_center, height - 199, bold, 13)
    centered_text(page, "Programa de simulação técnica aplicado à indústria de energia.", right_center, height - 224, regular, 8.5)
    centered_text(page, "O programa abordou:", right_center, height - 258, regular, 9)

    topics = [
        "Volumetria de hidrocarbonetos in situ",
        "Estimativas probabilísticas P90, P50 e P10",
        "Fator de recuperação e incerteza",
        "Interpretação técnica de reservas",
    ]
    page.setFont(regular, 8)
    page.setFillColor(NAVY)
    topic_x = split_x + 76
    topic_y = height - 288
    for index, topic in enumerate(topics):
        x = topic_x + (index % 2) * 215
        y = topic_y - (index // 2) * 24
        page.setFillColor(GOLD)
        page.circle(x, y + 2, 1.6, fill=1, stroke=0)
        page.setFillColor(NAVY)
        page.drawString(x + 8, y, topic)

    centered_text(page, "Carga horária: 45 minutos", right_center - 90, 198, bold, 8.5)
    centered_text(page, "Resultado final: 100%", right_center + 105, 198, bold, 8.5)

    coordinator_signature = ASSETS / "coordinator-signature.png"
    institutional_seal = ASSETS / "institutional-seal.png"
    page.drawImage(
        str(coordinator_signature), right_center - 70, 73, 140, 48,
        mask="auto", preserveAspectRatio=True,
    )
    page.drawImage(
        str(institutional_seal), right_center + 112, 55, 62, 70,
        mask="auto", preserveAspectRatio=True,
    )
    page.setStrokeColor(NAVY)
    page.line(right_center - 115, 72, right_center + 115, 72)
    centered_text(page, "Coordenação do Programa", right_center, 57, bold, 8.5)
    centered_text(page, "Coordenador do Programa", right_center, 44, regular, 7)

    verify_url = "https://petrosim-training-lab.vercel.app/certificate?code=PSL-2026-DEMONSTRACAO"
    add_qr(page, verify_url, split_x + 22, 86, 42)
    page.setFillColor(NAVY)
    page.setFont(bold, 5.8)
    page.drawRightString(width - 43, 154, "PetroSimLab")
    page.setFont(regular, 5.2)
    page.drawRightString(width - 43, 145, "Produto da LMTWEB")
    page.drawRightString(width - 43, 136, "Desenvolvido pela LEMOTE")

    page.save()
    return OUTPUT


if __name__ == "__main__":
    print(generate())
