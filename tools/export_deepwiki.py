#!/usr/bin/env python3
import argparse
import codecs
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

UA = "Mozilla/5.0 (compatible; OpenClaw DeepWiki Exporter)"
PAGE_RE = re.compile(r'(?m)^(\d+(?:\.\d+)*)\:T[0-9a-f]+,\n#\s+(.+?)\n')
CHUNK_RE = re.compile(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', re.S)
SLUG_RE = re.compile(r'/([^/]+)/([^/]+)/([^/?#]+)$')


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "ignore")


def decode_payload(html: str) -> str:
    chunks = CHUNK_RE.findall(html)
    if not chunks:
        raise RuntimeError("Could not find DeepWiki payload chunks in HTML")
    return "\n".join(codecs.decode(c, "unicode_escape") for c in chunks)


def slugify(title: str) -> str:
    s = title.strip().lower()
    s = s.replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "page"


def extract_pages(payload: str):
    matches = list(PAGE_RE.finditer(payload))
    if not matches:
        raise RuntimeError("Could not find Markdown page markers in payload")
    pages = []
    for i, m in enumerate(matches):
        page_num = m.group(1)
        title = m.group(2).strip()
        start = m.end() - len(f"# {title}\n")
        end = matches[i + 1].start() if i + 1 < len(matches) else len(payload)
        body = payload[start:end].strip()
        pages.append((page_num, title, body))
    return pages


def rewrite_internal_links(md: str, org: str, repo: str) -> str:
    base = f"https://deepwiki.com/{org}/{repo}/"

    def repl(match):
        text = match.group(1)
        target = match.group(2)
        if target.startswith("#"):
            return match.group(0)
        if target.startswith(base):
            slug = target[len(base):].strip("/")
            return f"[{text}]({slug}.md)"
        return match.group(0)

    md = re.sub(r'\[([^\]]+)\]\((https://deepwiki\.com/[^)]+)\)', repl, md)
    return md


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url")
    ap.add_argument("--out", default="deepwiki-export")
    args = ap.parse_args()

    m = SLUG_RE.search(args.url.rstrip('/'))
    if not m:
        print("URL should look like https://deepwiki.com/<org>/<repo>/<page>", file=sys.stderr)
        sys.exit(2)
    org, repo, _page = m.groups()

    html = fetch(args.url)
    payload = decode_payload(html)
    pages = extract_pages(payload)

    outdir = Path(args.out)
    outdir.mkdir(parents=True, exist_ok=True)

    index_lines = [f"# DeepWiki export for {org}/{repo}", "", f"Source: {args.url}", "", "## Pages", ""]

    for page_num, title, body in pages:
        filename = f"{page_num}-{slugify(title)}.md"
        path = outdir / filename
        content = rewrite_internal_links(body, org, repo).rstrip() + "\n"
        path.write_text(content, encoding="utf-8")
        index_lines.append(f"- [{page_num} {title}]({filename})")

    (outdir / "README.md").write_text("\n".join(index_lines) + "\n", encoding="utf-8")
    print(f"Exported {len(pages)} pages to {outdir}")


if __name__ == "__main__":
    main()
