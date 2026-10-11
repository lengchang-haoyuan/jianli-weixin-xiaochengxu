"""P5.2 原创 A4 简历模板定义。"""

from dataclasses import dataclass


@dataclass(frozen=True)
class TemplateStyle:
    template_id: str
    name: str
    accent: str
    heading_fill: str
    title_size: int
    body_size: int
    heading_size: int
    title_align: str
    heading_border: bool
    heading_uppercase: bool = False


TEMPLATES = {
    "minimal-general": TemplateStyle(
        template_id="minimal-general",
        name="极简通用",
        accent="1F6B4F",
        heading_fill="FFFFFF",
        title_size=26,
        body_size=10,
        heading_size=13,
        title_align="center",
        heading_border=True,
    ),
    "technical-project": TemplateStyle(
        template_id="technical-project",
        name="技术项目",
        accent="255D85",
        heading_fill="EAF2F8",
        title_size=24,
        body_size=9,
        heading_size=12,
        title_align="left",
        heading_border=False,
        heading_uppercase=True,
    ),
    "campus-growth": TemplateStyle(
        template_id="campus-growth",
        name="校招成长",
        accent="9A651A",
        heading_fill="F8F0DC",
        title_size=26,
        body_size=10,
        heading_size=12,
        title_align="center",
        heading_border=False,
    ),
    "social-experience": TemplateStyle(
        template_id="social-experience",
        name="社招经历",
        accent="7A3B36",
        heading_fill="F4E9E6",
        title_size=24,
        body_size=9,
        heading_size=12,
        title_align="left",
        heading_border=True,
    ),
}
