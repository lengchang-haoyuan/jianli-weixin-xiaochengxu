import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from zipfile import ZipFile


SERVICE_ROOT = Path(__file__).resolve().parents[2] / "cloudrun" / "documentRenderer"
sys.path.insert(0, str(SERVICE_ROOT))

from renderer import RendererError, _run_command, build_docx, validate_payload  # noqa: E402
from templates import TEMPLATES  # noqa: E402


BASE_PAYLOAD = {
    "contactBlock": "邮箱 user@example.com\n电话 138****0000",
    "language": "zh-CN",
    "resumeTitle": "前端开发简历",
    "sections": [
        {"title": "项目经历", "text": "• 使用 Vue 完成管理系统\n负责页面开发与联调"},
        {"title": "专业技能", "text": "TypeScript\nVue"},
    ],
    "templateId": "minimal-general",
}


class DocumentRendererTests(unittest.TestCase):
    def test_all_templates_build_valid_a4_docx(self):
        with tempfile.TemporaryDirectory() as directory:
            for template_id in TEMPLATES:
                payload = validate_payload({**BASE_PAYLOAD, "templateId": template_id})
                output = Path(directory) / f"{template_id}.docx"
                build_docx(payload, output)
                with ZipFile(output) as archive:
                    names = set(archive.namelist())
                    self.assertIn("word/document.xml", names)
                    self.assertIn("word/styles.xml", names)
                    document = archive.read("word/document.xml").decode("utf-8")
                    self.assertIn('w:pgSz w:w="11906" w:h="16838"', document)
                    self.assertIn("前端开发简历", document)
                    self.assertIn("使用 Vue 完成管理系统", document)

    def test_payload_rejects_unknown_template_and_blank_sections(self):
        with self.assertRaises(RendererError) as unknown:
            validate_payload({**BASE_PAYLOAD, "templateId": "unknown"})
        self.assertEqual(unknown.exception.code, "INVALID_RESUME_TEMPLATE")
        with self.assertRaises(RendererError) as blank:
            validate_payload({**BASE_PAYLOAD, "sections": [{"title": "项目", "text": "  "}]})
        self.assertEqual(blank.exception.code, "INVALID_RESUME_SECTION")

    @patch("renderer.subprocess.run")
    def test_converter_uses_argument_list_without_shell(self, mocked_run):
        mocked_run.return_value = subprocess.CompletedProcess(["tool"], 0, "ok", "")
        result = _run_command(["tool", "--input", "value;not-a-command"], timeout=5)
        self.assertEqual(result.stdout, "ok")
        args, kwargs = mocked_run.call_args
        self.assertIsInstance(args[0], list)
        self.assertNotIn("shell", kwargs)
        self.assertEqual(kwargs["timeout"], 5)


if __name__ == "__main__":
    unittest.main()

