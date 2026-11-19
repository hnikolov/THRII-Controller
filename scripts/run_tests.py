#!/usr/bin/env python3
"""Runs the unit tests (test/runner.html) in headless Chrome and reports the result. Standard library only.

    python scripts/run_tests.py

Starts a local server for the repository on a free port, opens the runner page in Chrome without a window (in a
throw-away profile), reads the summary and the failures from the finished page, and exits with 1 when a test fails.
No network is used: the tests load only files of this repository (see doc/testing.md). Chrome is looked up in the
usual places; set CHROME to its path to use another one.
"""
import functools
import html
import http.server
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROME_PATHS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
]
# Virtual time: the page's timers run as fast as the tests allow, up to this much page time.
TIME_BUDGET_MS = 120000


def find_chrome():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    for name in ("google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome"):
        if shutil.which(name):
            return shutil.which(name)
    return next((p for p in CHROME_PATHS if Path(p).is_file()), None)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    chrome = find_chrome()
    if not chrome:
        print("Chrome not found; set CHROME to its path.")
        return 1
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(QuietHandler, directory=str(ROOT)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f"http://127.0.0.1:{server.server_address[1]}/test/runner.html"
    try:
        with tempfile.TemporaryDirectory() as profile:
            args = [chrome, "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check",
                    f"--user-data-dir={profile}", f"--virtual-time-budget={TIME_BUDGET_MS}", "--dump-dom", url]
            if sys.platform.startswith("linux"):
                args.insert(1, "--no-sandbox")  # GitHub's runner; the page is this repository's own test page
            page = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", timeout=600).stdout
    finally:
        server.shutdown()

    summary = re.search(r'id="summary"[^>]*>([^<]*)<', page)
    if not summary:
        print("No test summary on the page: the runner did not finish or did not load.")
        return 1
    print(html.unescape(summary.group(1)).strip())
    failures = re.search(r'id="failures"[^>]*>(.*?)</(?:div|pre|ul|ol|section)>', page, re.S)
    if failures:
        text = html.unescape(re.sub(r"<[^>]+>", "\n", failures.group(1)))
        for line in filter(None, (line.strip() for line in text.splitlines())):
            print("  " + line)
    counts = re.search(r"PASS (\d+) FAIL (\d+)", summary.group(1))
    return 0 if counts and counts.group(2) == "0" else 1


if __name__ == "__main__":
    sys.exit(main())
