#!/usr/bin/env python3
"""Check local Markdown and generated HTML documentation links."""

from __future__ import annotations

import argparse
import re
from pathlib import Path
from urllib.parse import unquote, urlsplit


ROOT = Path(__file__).resolve().parents[1]
SITE_DIR = ROOT / "docs" / "wiki-site"
MARKDOWN_LINK = re.compile(r"!?(?:\[[^\]]*\])\(([^)]+)\)")
HTML_LINK = re.compile(r"(?:href|src)=[\"']([^\"']+)[\"']", re.I)


def strip_generated_blocks(text: str) -> str:
    return re.sub(
        r"<!-- openclaw:wiki:index:start -->.*?<!-- openclaw:wiki:index:end -->",
        "",
        text,
        flags=re.S,
    )


def local_target(raw: str) -> str | None:
    value = raw.strip().strip("<>")
    if not value or value.startswith(("#", "//", "/", "data:", "mailto:", "javascript:")):
        return None
    parts = urlsplit(value)
    if parts.scheme or parts.netloc:
        return None
    return unquote(parts.path)


def check_file(path: Path, pattern: re.Pattern[str], wiki: bool = False) -> list[str]:
    errors: list[str] = []
    text = path.read_text(encoding="utf-8", errors="ignore")
    if path == ROOT / "docs" / "wiki-source" / "index.md":
        text = strip_generated_blocks(text)
    for raw in pattern.findall(text):
        if "${" in raw:
            # JavaScript template strings embedded in existing generated pages
            # are not navigable URLs.
            continue
        target = local_target(raw)
        if target is None:
            continue
        resolved = (path.parent / target).resolve()
        if wiki and not resolved.exists() and not resolved.suffix:
            resolved = resolved.with_suffix(".md")
        if not resolved.exists():
            try:
                display_path = path.relative_to(ROOT)
            except ValueError:
                display_path = path
            errors.append(f"{display_path} -> {raw}")
    return errors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--wiki-dir", type=Path, help="also check the canonical pages in a Wiki checkout")
    args = parser.parse_args()
    errors: list[str] = []
    markdown_files = [ROOT / "README.md", *sorted((ROOT / "docs").glob("*.md"))]
    markdown_files.extend(sorted((ROOT / "docs" / "wiki-source").glob("*.md")))
    for path in markdown_files:
        errors.extend(check_file(path, MARKDOWN_LINK))
    for path in sorted(SITE_DIR.glob("*.html")):
        errors.extend(check_file(path, HTML_LINK))
    wiki_count = 0
    if args.wiki_dir:
        wiki_dir = args.wiki_dir.resolve()
        published_names = {"Home.md"} | {
            path.name
            for path in (ROOT / "docs" / "wiki-source").glob("*.md")
            if path.name not in {"README.md", "local-environment.md"}
        }
        for path in sorted(wiki_dir.glob("*.md")):
            if path.name in published_names:
                errors.extend(check_file(path, MARKDOWN_LINK, wiki=True))
                wiki_count += 1

    if errors:
        print(f"documentation link errors: {len(errors)}")
        for error in errors:
            print(f"- {error}")
        return 1
    suffix = f", {wiki_count} published Wiki pages" if args.wiki_dir else ""
    print(f"documentation links ok ({len(markdown_files)} Markdown files, {len(list(SITE_DIR.glob('*.html')))} HTML files{suffix})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
