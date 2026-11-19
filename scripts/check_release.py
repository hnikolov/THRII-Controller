#!/usr/bin/env python3
"""Release check of the installed app (see doc/release.md). Standard library only.

    python scripts/check_release.py            check; exit code 1 on any problem
    python scripts/check_release.py --stamp    write the file list into sw.js and the build hash into
                                               src/app/version.js, then check
    python scripts/check_release.py --out DIR  check, then copy the release files into DIR (what is published)

The release set is index.html, manifest.json, sw.js, icons/ and src/ without the debug folders. The check fails when
the service worker's PRECACHE list differs from it, when a shipped file refers to a file outside it (a debug module,
dev.html, a missing file), or when BUILD does not match the shipped files (a change without a new stamp).
"""
import hashlib
import json
import re
import shutil
import sys
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parent.parent
SHELL = ["index.html", "manifest.json", "sw.js"]
EXCLUDED = ("src/debug/", "src/ui/debug/")
SW, VERSION = ROOT / "sw.js", ROOT / "src/app/version.js"

PRECACHE_RE = re.compile(r"const PRECACHE = \[.*?\];", re.S)
BUILD_RE = re.compile(r"export const BUILD = '([0-9a-f]*)';")
# Files a shipped file loads: ES imports, new URL(..., import.meta.url), and src/href attributes in HTML.
REF_RES = [
    re.compile(r"""^\s*(?:import|export)\b[^;'"]*?\bfrom\s*['"]([^'"\n]+)['"]""", re.M),
    re.compile(r"""^\s*import\s*['"]([^'"\n]+)['"]""", re.M),
    re.compile(r"""\bimport\(\s*['"]([^'"\n]+)['"]"""),
    re.compile(r"""new URL\(\s*['"]([^'"\n]+)['"]\s*,\s*import\.meta\.url"""),
]
HTML_REF_RE = re.compile(r"""\b(?:src|href)="([^"]+)\"""")


def release_set():
    files = list(SHELL)
    files += sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "icons").glob("*") if p.is_file())
    files += sorted(p.relative_to(ROOT).as_posix() for p in (ROOT / "src").rglob("*")
                    if p.is_file() and not p.relative_to(ROOT).as_posix().startswith(EXCLUDED))
    return files


def precache_of(files):
    return ["./" + f for f in files if f != "sw.js"]


def build_hash(files):
    # Line endings are normalized, so a Windows checkout (CRLF) and GitHub's runner (LF) give the same hash.
    digest = hashlib.sha256()
    for f in sorted(files):
        if f in ("sw.js", "src/app/version.js"):
            continue
        digest.update(f.encode() + b"\0" + (ROOT / f).read_bytes().replace(b"\r\n", b"\n") + b"\0")
    return digest.hexdigest()[:8]


def read(path):
    with open(path, encoding="utf-8", newline="") as fh:
        return fh.read()


def write(path, text):
    with open(path, "w", encoding="utf-8", newline="") as fh:
        fh.write(text)


def references(rel):
    text = read(ROOT / rel)
    if rel.endswith(".json"):
        return [icon["src"] for icon in json.loads(text).get("icons", [])]
    found = [m for r in REF_RES for m in r.findall(text)]
    if rel.endswith(".html"):
        found += HTML_REF_RE.findall(text)
    return found


def resolve(rel, ref):
    if re.match(r"^[a-z]+:", ref):
        return None  # another site or a data: URL; not part of the release
    parts = []
    for part in (PurePosixPath(rel).parent / ref).parts:
        if part == "..":
            if parts:
                parts.pop()
        elif part != ".":
            parts.append(part)
    return "/".join(parts)


def check(files):
    problems = []
    listed = re.findall(r"'([^']+)'", PRECACHE_RE.search(read(SW)).group(0))
    expected = precache_of(files)
    if listed != expected:
        missing, extra = sorted(set(expected) - set(listed)), sorted(set(listed) - set(expected))
        problems.append(f"sw.js PRECACHE is not current (run --stamp). Missing: {missing or '-'}; not in the release: {extra or '-'}")
    for entry in listed:
        if entry.endswith("dev.html") or entry[2:].startswith(EXCLUDED):
            problems.append(f"sw.js PRECACHE lists a development file: {entry}")
    shipped = set(files)
    for rel in files:
        if not rel.endswith((".js", ".html", ".json")) or rel.startswith("src/data/"):
            continue
        for ref in references(rel):
            target = resolve(rel, ref)
            if target is not None and target not in shipped:
                problems.append(f"{rel} refers to {ref}, which is not in the release")
    match = BUILD_RE.search(read(VERSION))
    if not match or match.group(1) != build_hash(files):
        problems.append("src/app/version.js BUILD does not match the shipped files (run --stamp)")
    return problems


def stamp(files):
    text = read(SW)
    nl = "\r\n" if "\r\n" in text else "\n"
    block = "const PRECACHE = [" + nl + ("," + nl).join(f"  '{p}'" for p in precache_of(files)) + nl + "];"
    write(SW, PRECACHE_RE.sub(lambda _: block, text, count=1))
    version = read(VERSION)
    write(VERSION, BUILD_RE.sub(f"export const BUILD = '{build_hash(files)}';", version, count=1))


def main(args):
    files = release_set()
    missing = [f for f in SHELL if not (ROOT / f).is_file()]
    if missing:
        print("Missing:", ", ".join(missing))
        return 1
    if "--stamp" in args:
        stamp(files)
        print("Stamped:", len(files) - 1, "files, BUILD", build_hash(files))
    problems = check(files)
    for problem in problems:
        print("FAIL:", problem)
    if problems:
        return 1
    print(f"Release check passed: {len(files)} files, BUILD {build_hash(files)}")
    if "--out" in args:
        out = (ROOT / args[args.index("--out") + 1]).resolve()
        if out == ROOT or ROOT not in out.parents:
            print("--out must be a folder inside the repository")
            return 1
        shutil.rmtree(out, ignore_errors=True)
        for f in files:
            (out / f).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / f, out / f)
        print("Copied to", out.relative_to(ROOT).as_posix())
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
