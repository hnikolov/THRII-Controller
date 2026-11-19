#!/usr/bin/env python3
"""Development server: the app's files plus the proxy that Import AI needs.

Serves the repository root like `python -m http.server 8080` and forwards
/api/* to the preset generator of amplifier-presets.com, which answers
browsers only on its own site. Run it from anywhere:

    python scripts/serve.py          -> http://localhost:8080

The generator belongs to the amplifier-presets.com authors, who pay for its AI
usage. This server listens on this machine only; keep it that way.
"""
import http.server
import os
import socketserver
import urllib.error
import urllib.request

PORT = 8080
UPSTREAM = "https://api.amplifier-presets.com"
PROXY_TIMEOUT = 180              # seconds; a generation can take a minute or more
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# The upstream answers only requests that come from its own site.
UPSTREAM_HEADERS = {
    "Origin": "https://amplifier-presets.com",
    "Referer": "https://amplifier-presets.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Content-Type": "application/json",
    "Accept": "application/json, text/plain, */*",
    "Connection": "close",
}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # edited modules are served fresh
        super().end_headers()

    def do_GET(self):
        if self.path == "/api/health":  # answered here: the app's availability check, no call to the generator
            return self.reply(200, b'{"ok":true}', "application/json")
        if self.path.startswith("/api/"):
            return self.proxy()
        return super().do_GET()

    def do_POST(self):
        if self.path.startswith("/api/"):
            return self.proxy()
        self.send_error(404)

    def proxy(self):
        url = UPSTREAM + self.path[len("/api"):]
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else None
        print(f"[proxy] {self.command} {url}")
        try:
            req = urllib.request.Request(url, data=body, headers=UPSTREAM_HEADERS, method=self.command)
            with urllib.request.urlopen(req, timeout=PROXY_TIMEOUT) as res:
                self.reply(res.status, res.read(), res.headers.get("Content-Type"))
        except urllib.error.HTTPError as e:
            # Upstream errors (e.g. 422 validation details) go through to the page.
            self.reply(e.code, e.read(), e.headers.get("Content-Type"))
        except Exception as e:
            print(f"[proxy] failed: {e}")
            self.reply(502, f"Proxy error: {e}".encode("utf-8"), "text/plain; charset=utf-8")

    def reply(self, status, data, content_type):
        print(f"[proxy] -> {status} ({len(data)} bytes)")
        self.send_response(status)
        self.send_header("Content-Type", content_type or "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


if __name__ == "__main__":
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    with socketserver.ThreadingTCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"THR-II Controller on http://localhost:{PORT} (Import AI proxy on /api)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nServer stopped.")
