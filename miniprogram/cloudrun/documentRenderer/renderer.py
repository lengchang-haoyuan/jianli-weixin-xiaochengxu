"""将已确认的结构化简历渲染为 DOCX、PDF 与 JPEG 预览。"""

from __future__ import annotations

import base64
import os
import re
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.sax.saxutils import escape
from zipfile import ZIP_DEFLATED, ZipFile

from templates import TEMPLATES, TemplateStyle

MAX_DOCX_BYTES = 1_500_000
MAX_PDF_BYTES = 2_500_000
MAX_PREVIEW_BYTES = 400_000
MAX_PREVIEW_PAGES = 3
MAX_TOTAL_TEXT = 50_000


class RendererError(Exception):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _required_text(value: Any, maximum: int, code: str, message: str) -> str:
    text = value.strip() if isinstance(value, str) else ""
    if not text or len(text) > maximum:
        raise RendererError(code, message)
    return text


def validate_payload(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise RendererError("INVALID_RENDER_REQUEST", "无法识别文档渲染请求。")
    template_id = payload.get("templateId")
    if template_id not in TEMPLATES:
        raise RendererError("INVALID_RESUME_TEMPLATE", "请选择有效的简历模板。")
    language = payload.get("language")
    if language not in {"zh-CN", "en", "bilingual"}:
        raise RendererError("INVALID_LANGUAGE", "无法识别简历输出语言。")
    contact_block = payload.get("contactBlock", "")
    if not isinstance(contact_block, str) or len(contact_block) > 1_500:
        raise RendererError("INVALID_CONTACT_BLOCK", "联系方式内容不符合要求。")
    raw_sections = payload.get("sections")
    if not isinstance(raw_sections, list) or not 1 <= len(raw_sections) <= 20:
        raise RendererError("INVALID_RESUME_SECTIONS", "简历段落数量不符合要求。")
    sections = []
    total_text = len(contact_block)
    for item in raw_sections:
        if not isinstance(item, dict):
            raise RendererError("INVALID_RESUME_SECTION", "简历段落结构不符合要求。")
        title = _required_text(item.get("title"), 100, "INVALID_RESUME_SECTION", "简历段落标题不符合要求。")
        text = _required_text(item.get("text"), 6_000, "INVALID_RESUME_SECTION", "简历段落内容不符合要求。")
        total_text += len(title) + len(text)
        sections.append({"title": title, "text": text})
    if total_text > MAX_TOTAL_TEXT:
        raise RendererError("RESUME_TOO_LONG", "简历内容过长，请精简后重试。")
    return {
        "contactBlock": contact_block.strip(),
        "language": language,
        "resumeTitle": _required_text(
            payload.get("resumeTitle"),
            100,
            "INVALID_RESUME_TITLE",
            "简历标题不符合要求。",
        ),
        "sections": sections,
        "templateId": template_id,
    }


def _run(text: str, *, bold: bool = False, color: str | None = None, size: int | None = None) -> str:
    properties = []
    if bold:
        properties.append("<w:b/>")
    if color:
        properties.append(f'<w:color w:val="{color}"/>')
    if size:
        properties.append(f'<w:sz w:val="{size * 2}"/><w:szCs w:val="{size * 2}"/>')
    properties.append('<w:rFonts w:ascii="Arial" w:eastAsia="Noto Sans CJK SC" w:hAnsi="Arial"/>')
    preserve = ' xml:space="preserve"' if text[:1].isspace() or text[-1:].isspace() else ""
    return f"<w:r><w:rPr>{''.join(properties)}</w:rPr><w:t{preserve}>{escape(text)}</w:t></w:r>"


def _paragraph(
    text: str,
    *,
    align: str = "left",
    before: int = 0,
    after: int = 80,
    line: int = 276,
    bold: bool = False,
    color: str | None = None,
    size: int | None = None,
    shading: str | None = None,
    border: str | None = None,
    keep_next: bool = False,
) -> str:
    paragraph_properties = [
        f'<w:jc w:val="{align}"/>',
        f'<w:spacing w:before="{before}" w:after="{after}" w:line="{line}" w:lineRule="auto"/>',
    ]
    if keep_next:
        paragraph_properties.append("<w:keepNext/>")
    if shading:
        paragraph_properties.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{shading}"/>')
    if border:
        paragraph_properties.append(
            f'<w:pBdr><w:bottom w:val="single" w:sz="8" w:space="4" w:color="{border}"/></w:pBdr>'
        )
    return (
        "<w:p><w:pPr>"
        + "".join(paragraph_properties)
        + "</w:pPr>"
        + _run(text, bold=bold, color=color, size=size)
        + "</w:p>"
    )


def _content_paragraphs(text: str, style: TemplateStyle) -> str:
    paragraphs = []
    for raw_line in re.split(r"\r?\n", text):
        line = raw_line.strip()
        if not line:
            continue
        is_bullet = bool(re.match(r"^(?:[-*•·]|\d+[.)、])\s*", line))
        normalized = re.sub(r"^(?:[-*•·]|\d+[.)、])\s*", "", line) if is_bullet else line
        prefix = "• " if is_bullet else ""
        paragraphs.append(
            _paragraph(
                prefix + normalized,
                after=56 if is_bullet else 72,
                line=264,
                size=style.body_size,
            )
        )
    return "".join(paragraphs)


def _document_xml(payload: dict[str, Any], style: TemplateStyle) -> str:
    body = [
        _paragraph(
            payload["resumeTitle"],
            align=style.title_align,
            after=100,
            bold=True,
            color=style.accent,
            size=style.title_size,
        )
    ]
    for contact_line in re.split(r"\r?\n", payload["contactBlock"]):
        if contact_line.strip():
            body.append(
                _paragraph(
                    contact_line.strip(),
                    align=style.title_align,
                    after=30,
                    color="4F5A54",
                    size=9,
                )
            )
    for section in payload["sections"]:
        heading = section["title"].upper() if style.heading_uppercase else section["title"]
        body.append(
            _paragraph(
                heading,
                before=180,
                after=90,
                bold=True,
                color=style.accent,
                size=style.heading_size,
                shading=style.heading_fill if style.heading_fill != "FFFFFF" else None,
                border=style.accent if style.heading_border else None,
                keep_next=True,
            )
        )
        body.append(_content_paragraphs(section["text"], style))
    body.append(
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>'
        '<w:pgMar w:top="850" w:right="1020" w:bottom="850" w:left="1020" '
        'w:header="420" w:footer="420" w:gutter="0"/></w:sectPr>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f"<w:body>{''.join(body)}</w:body></w:document>"
    )


def _styles_xml() -> str:
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:docDefaults><w:rPrDefault><w:rPr>'
        '<w:rFonts w:ascii="Arial" w:eastAsia="Noto Sans CJK SC" w:hAnsi="Arial"/>'
        '<w:lang w:val="en-US" w:eastAsia="zh-CN"/>'
        '</w:rPr></w:rPrDefault></w:docDefaults>'
        '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">'
        '<w:name w:val="Normal"/><w:qFormat/></w:style>'
        '</w:styles>'
    )


def build_docx(payload: dict[str, Any], output_path: Path) -> None:
    style = TEMPLATES[payload["templateId"]]
    created = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    root_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
        '</Relationships>'
    )
    document_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    core = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
        'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
        f'<dc:title>{escape(payload["resumeTitle"])}</dc:title><dc:creator>简历优化助手</dc:creator>'
        f'<dcterms:created xsi:type="dcterms:W3CDTF">{created}</dcterms:created>'
        '</cp:coreProperties>'
    )
    app = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
        'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
        '<Application>简历优化助手</Application><AppVersion>1.0</AppVersion></Properties>'
    )
    with ZipFile(output_path, "w", ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", root_rels)
        archive.writestr("docProps/core.xml", core)
        archive.writestr("docProps/app.xml", app)
        archive.writestr("word/document.xml", _document_xml(payload, style))
        archive.writestr("word/styles.xml", _styles_xml())
        archive.writestr("word/_rels/document.xml.rels", document_rels)


def _run_command(command: list[str], timeout: int) -> subprocess.CompletedProcess[str]:
    try:
        return subprocess.run(
            command,
            check=True,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except (OSError, subprocess.SubprocessError) as error:
        raise RendererError("DOCUMENT_CONVERSION_FAILED", "DOCX/PDF 转换失败，请稍后重试。") from error


def _page_count(pdf_path: Path) -> int:
    result = _run_command([os.getenv("PDFINFO_BIN", "pdfinfo"), str(pdf_path)], timeout=8)
    match = re.search(r"^Pages:\s+(\d+)\s*$", result.stdout, re.MULTILINE)
    if not match:
        raise RendererError("PDF_INSPECTION_FAILED", "PDF 页数校验失败，本次未保存。")
    pages = int(match.group(1))
    if pages < 1 or pages > MAX_PREVIEW_PAGES:
        raise RendererError("RESUME_PAGE_LIMIT_EXCEEDED", "简历超过 3 页，请精简内容后重试。")
    return pages


def render_payload(raw_payload: Any) -> dict[str, Any]:
    payload = validate_payload(raw_payload)
    with tempfile.TemporaryDirectory(prefix="resume-render-") as temporary_directory:
        workdir = Path(temporary_directory)
        docx_path = workdir / "resume.docx"
        build_docx(payload, docx_path)
        profile_path = workdir / "libreoffice-profile"
        profile_path.mkdir()
        _run_command(
            [
                os.getenv("SOFFICE_BIN", "soffice"),
                f"-env:UserInstallation={profile_path.as_uri()}",
                "--headless",
                "--convert-to",
                "pdf",
                "--outdir",
                str(workdir),
                str(docx_path),
            ],
            timeout=35,
        )
        pdf_path = workdir / "resume.pdf"
        if not pdf_path.is_file():
            raise RendererError("DOCUMENT_CONVERSION_FAILED", "PDF 文件未生成，请稍后重试。")
        pages = _page_count(pdf_path)
        preview_prefix = workdir / "preview"
        _run_command(
            [
                os.getenv("PDFTOPPM_BIN", "pdftoppm"),
                "-jpeg",
                "-r",
                "90",
                "-jpegopt",
                "quality=76",
                "-f",
                "1",
                "-l",
                str(pages),
                str(pdf_path),
                str(preview_prefix),
            ],
            timeout=15,
        )
        previews = [workdir / f"preview-{index}.jpg" for index in range(1, pages + 1)]
        if any(not preview.is_file() for preview in previews):
            raise RendererError("PREVIEW_GENERATION_FAILED", "文档预览生成失败，本次未保存。")
        docx = docx_path.read_bytes()
        pdf = pdf_path.read_bytes()
        preview_bytes = [preview.read_bytes() for preview in previews]
        if not 0 < len(docx) <= MAX_DOCX_BYTES or not 0 < len(pdf) <= MAX_PDF_BYTES:
            raise RendererError("RENDERED_FILE_TOO_LARGE", "生成文件超过大小限制，本次未保存。")
        if any(not 0 < len(preview) <= MAX_PREVIEW_BYTES for preview in preview_bytes):
            raise RendererError("PREVIEW_FILE_TOO_LARGE", "文档预览超过大小限制，本次未保存。")
        return {
            "docxBase64": base64.b64encode(docx).decode("ascii"),
            "pageCount": pages,
            "pdfBase64": base64.b64encode(pdf).decode("ascii"),
            "previewBase64": [base64.b64encode(preview).decode("ascii") for preview in preview_bytes],
        }

