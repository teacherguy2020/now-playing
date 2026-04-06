#!/usr/bin/env python3
from pathlib import Path
import html
import re
import subprocess
import sys

ROOT = Path('/Users/brianwis/.openclaw/workspace')
SRC_DIR = ROOT / 'docs' / 'now-playing-knowledge'
SITE_DIR = ROOT / 'docs' / 'now-playing-knowledge-site'
README_HTML = SITE_DIR / 'README.html'
STYLE_HREF = 'style.css?v=20260406-0646'
SEARCH_HREF = 'search-index.js?v=20260406-0646'


def strip_frontmatter(text: str) -> str:
    if text.startswith('---\n'):
        parts = text.split('\n---\n', 1)
        if len(parts) == 2:
            return parts[1]
    return text


def slugify(text: str) -> str:
    text = re.sub(r'`([^`]+)`', r'\1', text.strip().lower())
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text)
    text = re.sub(r'-+', '-', text).strip('-')
    return text or 'section'


def inline_md(s: str) -> str:
    s = html.escape(s)
    s = re.sub(r'`([^`]+)`', lambda m: f'<code>{m.group(1)}</code>', s)
    s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', lambda m: f'<a href="{m.group(2).replace(".md", ".html")}">{m.group(1)}</a>', s)
    s = re.sub(r'\*\*([^*]+)\*\*', r'<strong>\1</strong>', s)
    s = re.sub(r'\*([^*]+)\*', r'<em>\1</em>', s)
    return s


def md_to_html(text: str) -> str:
    lines = strip_frontmatter(text).splitlines()
    out = []
    i = 0
    in_code = False
    code = []
    while i < len(lines):
        line = lines[i]
        if line.startswith('```'):
            if not in_code:
                in_code = True
                code = []
            else:
                out.append('<pre><code>' + html.escape('\n'.join(code)) + '</code></pre>')
                in_code = False
            i += 1
            continue
        if in_code:
            code.append(line)
            i += 1
            continue
        if not line.strip():
            i += 1
            continue
        m = re.match(r'^(#{1,6})\s+(.*)$', line)
        if m:
            lvl = len(m.group(1))
            txt = m.group(2).strip()
            sid = slugify(txt)
            out.append(f'<h{lvl} id="{sid}">{inline_md(txt)}</h{lvl}>')
            i += 1
            continue
        if re.match(r'^-\s+', line):
            items = []
            while i < len(lines) and re.match(r'^-\s+', lines[i]):
                items.append('<li>' + inline_md(re.sub(r'^-\s+', '', lines[i])) + '</li>')
                i += 1
            out.append('<ul>' + ''.join(items) + '</ul>')
            continue
        if re.match(r'^\d+\.\s+', line):
            items = []
            while i < len(lines) and re.match(r'^\d+\.\s+', lines[i]):
                items.append('<li>' + inline_md(re.sub(r'^\d+\.\s+', '', lines[i])) + '</li>')
                i += 1
            out.append('<ol>' + ''.join(items) + '</ol>')
            continue
        para = [line.strip()]
        i += 1
        while i < len(lines) and lines[i].strip() and not re.match(r'^(#{1,6})\s+', lines[i]) and not re.match(r'^-\s+', lines[i]) and not re.match(r'^\d+\.\s+', lines[i]) and not lines[i].startswith('```'):
            para.append(lines[i].strip())
            i += 1
        out.append('<p>' + inline_md(' '.join(para)) + '</p>')
    return ''.join(out)


def extract_canonical_nav_and_scripts():
    if not README_HTML.exists():
        raise RuntimeError('README.html missing; cannot derive canonical shell')
    base = README_HTML.read_text(encoding='utf-8', errors='ignore')
    nav_match = re.search(r'(<nav>.*?</nav>)', base, flags=re.S)
    if not nav_match:
        raise RuntimeError('canonical nav not found in README.html')
    nav = nav_match.group(1)
    scripts = re.findall(r'(<script[\s\S]*?</script>)', base, flags=re.S)
    search_and_nav_scripts = [s for s in scripts if 'NP_KNOWLEDGE_SEARCH_INDEX' in s or 'nav-current' in s or 'location.pathname' in s or 'nav-search' in s]
    return nav, search_and_nav_scripts


def render_page(md_path: Path, html_path: Path, canonical_nav: str, scripts: list[str]):
    article = '<article>' + md_to_html(md_path.read_text(encoding='utf-8')) + '</article>'
    title = md_path.stem
    if html_path.exists():
        doc = html_path.read_text(encoding='utf-8', errors='ignore')
        doc = re.sub(r'<nav>.*?</nav>', canonical_nav, doc, count=1, flags=re.S)
        doc = re.sub(r'<article>.*?</article>', article, doc, count=1, flags=re.S)
        doc = re.sub(r'href="style\.css(?:\?v=[^"]+)?"', f'href="{STYLE_HREF}"', doc)
        doc = re.sub(r'<script src="search-index\.js(?:\?v=[^"]+)?"></script>', f'<script src="{SEARCH_HREF}"></script>', doc)
        for s in scripts:
            if s not in doc and '</body>' in doc:
                doc = doc.replace('</body>', s + '</body>', 1)
    else:
        extra_scripts = ''.join(scripts)
        doc = f'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>{title}</title><link rel="stylesheet" href="{STYLE_HREF}"><script src="{SEARCH_HREF}"></script></head><body>{canonical_nav}{article}{extra_scripts}</body></html>'
    html_path.write_text(doc, encoding='utf-8')


def sanity_check():
    html_files = sorted(SITE_DIR.glob('*.html'))
    if not html_files:
        raise RuntimeError('no rendered html files found')
    nav_blocks = set()
    for p in html_files:
        txt = p.read_text(encoding='utf-8', errors='ignore')
        if '<nav>' not in txt or '</nav>' not in txt or '<article>' not in txt or '</article>' not in txt:
            raise RuntimeError(f'malformed shell in {p.name}')
        nav = txt[txt.find('<nav>'):txt.find('</nav>') + 6]
        nav_blocks.add(nav)
        if 'id="nav-search"' not in txt:
            raise RuntimeError(f'missing nav search in {p.name}')
        if 'README.html' not in nav:
            raise RuntimeError(f'missing home link in nav for {p.name}')
    if len(nav_blocks) != 1:
        raise RuntimeError(f'expected 1 shared nav block, found {len(nav_blocks)}')


def main():
    canonical_nav, scripts = extract_canonical_nav_and_scripts()
    md_files = sorted(SRC_DIR.glob('*.md'))
    updated = []
    for md_path in md_files:
        html_path = SITE_DIR / (md_path.stem + '.html')
        source_mtime = md_path.stat().st_mtime
        target_mtime = html_path.stat().st_mtime if html_path.exists() else 0
        if (not html_path.exists()) or source_mtime > target_mtime:
            render_page(md_path, html_path, canonical_nav, scripts)
            updated.append(html_path.name)
    # Normalize nav/scripts/assets across all rendered pages, even if article content did not change.
    for html_path in sorted(SITE_DIR.glob('*.html')):
        doc = html_path.read_text(encoding='utf-8', errors='ignore')
        doc = re.sub(r'<nav>.*?</nav>', canonical_nav, doc, count=1, flags=re.S)
        doc = re.sub(r'href="style\.css(?:\?v=[^"]+)?"', f'href="{STYLE_HREF}"', doc)
        doc = re.sub(r'<script src="search-index\.js(?:\?v=[^"]+)?"></script>', f'<script src="{SEARCH_HREF}"></script>', doc)
        for s in scripts:
            if s not in doc and '</body>' in doc:
                doc = doc.replace('</body>', s + '</body>', 1)
        html_path.write_text(doc, encoding='utf-8')
    subprocess.run([sys.executable, str(ROOT / 'scripts' / 'build-now-playing-search-index.py')], check=True)
    sanity_check()
    print('Wiki sync complete.')
    if updated:
        print('Updated pages:')
        for name in updated:
            print(f'- {name}')
    else:
        print('No out-of-sync markdown pages needed article updates.')


if __name__ == '__main__':
    main()
