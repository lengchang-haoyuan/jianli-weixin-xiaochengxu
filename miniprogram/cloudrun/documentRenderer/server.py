"""CloudBase 云托管入口。"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from renderer import RendererError, render_payload

MAX_REQUEST_BYTES = 100_000


class RequestHandler(BaseHTTPRequestHandler):
    server_version = "ResumeRenderer/1.0"

    def log_message(self, _format: str, *_args: object) -> None:
        # 请求体包含简历事实，禁止输出访问日志或正文。
        return

    def _send_json(self, status: int, payload: dict[str, object]) -> None:
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802
        if self.path == "/health":
            self._send_json(200, {"ok": True, "service": "resume-renderer"})
            return
        self._send_json(404, {"ok": False, "error": {"code": "NOT_FOUND", "message": "接口不存在。"}})

    def do_POST(self) -> None:  # noqa: N802
        if self.path != "/render":
            self._send_json(404, {"ok": False, "error": {"code": "NOT_FOUND", "message": "接口不存在。"}})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if length < 2 or length > MAX_REQUEST_BYTES:
            self._send_json(413, {"ok": False, "error": {"code": "INVALID_RENDER_REQUEST", "message": "文档内容大小不符合要求。"}})
            return
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self._send_json(200, {"ok": True, "data": render_payload(payload)})
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._send_json(400, {"ok": False, "error": {"code": "INVALID_RENDER_REQUEST", "message": "无法识别文档渲染请求。"}})
        except RendererError as error:
            self._send_json(422, {"ok": False, "error": {"code": error.code, "message": error.message}})
        except Exception:
            self._send_json(500, {"ok": False, "error": {"code": "DOCUMENT_RENDER_FAILED", "message": "文档渲染暂时不可用，请稍后重试。"}})


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8080"))
    ThreadingHTTPServer(("0.0.0.0", port), RequestHandler).serve_forever()

