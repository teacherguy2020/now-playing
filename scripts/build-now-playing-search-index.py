#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from pathlib import Path

WORKSPACE = Path('/Users/brianwis/.openclaw/workspace')
SOURCE_DIR = WORKSPACE / 'docs' / 'now-playing-knowledge'
SITE_DIR = WORKSPACE / 'docs' / 'now-playing-knowledge-site'
OUT_FILE = SITE_DIR / 'search-index.js'

STOPWORDS = {
    'a','an','and','are','as','at','be','because','by','for','from','how','if','in','into','is','it',
    'its','of','on','or','that','the','their','this','to','use','when','with','while','already','also',
    'than','then','through','about','does','not','only','more','one','two','three','four','five'
}

SYNONYMS = {
    'config': ['settings', 'runtime', 'configuration'],
    'diagnostics': ['debug', 'inspection', 'checks'],
    'display': ['screen', 'visualizer', 'player', 'peppy'],
    'kiosk': ['presentation', 'shell'],
    'queue': ['next up', 'playlist', 'curation'],
    'playback': ['transport', 'playing', 'player'],
    'theme': ['tokens', 'presets', 'colors', 'editor'],
    'api': ['routes', 'http', 'endpoints', 'service'],
    'library': ['albums', 'metadata', 'scan'],
    'route': ['ownership', 'handler', 'path'],
    'runbook': ['troubleshooting', 'checklist'],
}


def slug_words(name: str) -> list[str]:
    return [w for w in re.split(r'[^a-z0-9]+', name.lower()) if w]


def normalize_text(text: str) -> str:
    text = re.sub(r'`+', '', text)
    text = re.sub(r'\[[^\]]*\]\([^)]*\)', ' ', text)
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'[^a-zA-Z0-9\-\s/]+', ' ', text)
    text = text.replace('/', ' ')
    text = text.replace('-', ' ')
    return re.sub(r'\s+', ' ', text).strip()


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s-]', '', text)
    text = re.sub(r'\s+', '-', text.strip())
    text = re.sub(r'-+', '-', text)
    return text or 'section'


def extract_markdown(path: Path) -> tuple[str, list[str], list[dict[str, str]], list[str], str]:
    lines = path.read_text(encoding='utf-8').splitlines()
    title = ''
    headings: list[str] = []
    heading_targets: list[dict[str, str]] = []
    body_lines: list[str] = []
    used_ids: set[str] = set()
    for line in lines:
        if not title and line.startswith('# '):
            title = line[2:].strip()
            continue
        heading_text = ''
        if line.startswith('## '):
            heading_text = line[3:].strip()
        elif line.startswith('### '):
            heading_text = line[4:].strip()
        if heading_text:
            headings.append(heading_text)
            slug = slugify(heading_text)
            base = slug
            n = 2
            while slug in used_ids:
                slug = f"{base}-{n}"
                n += 1
            used_ids.add(slug)
            heading_targets.append({"id": slug, "text": heading_text})
        body_lines.append(line)

    summary = ''
    paras = re.split(r'\n\s*\n', '\n'.join(body_lines))
    for para in paras:
        cleaned = normalize_text(para)
        if cleaned:
            summary = cleaned
            break

    keywords = []
    base_words = slug_words(path.stem)
    keywords.extend(base_words)
    for word in list(base_words):
        keywords.extend(SYNONYMS.get(word, []))
    for heading in headings[:8]:
        for word in slug_words(heading):
            if word not in STOPWORDS:
                keywords.append(word)
                keywords.extend(SYNONYMS.get(word, []))

    seen = set()
    deduped_keywords = []
    for word in keywords:
        if word and word not in seen:
            seen.add(word)
            deduped_keywords.append(word)

    return title or path.stem, headings, heading_targets, deduped_keywords, summary


index: dict[str, str] = {}
summaries: dict[str, str] = {}
heading_map: dict[str, str] = {}
heading_targets_map: dict[str, list[dict[str, str]]] = {}

for md in sorted(SOURCE_DIR.glob('*.md')):
    title, headings, heading_targets, keywords, summary = extract_markdown(md)
    html_name = md.with_suffix('.html').name
    combined_index = ' '.join(filter(None, [title, md.stem.replace('-', ' '), ' '.join(keywords), ' '.join(headings)]))
    index[html_name] = normalize_text(combined_index).lower()
    if summary:
        summaries[html_name] = summary
    if headings:
        heading_map[html_name] = normalize_text(' '.join(headings)).lower()
        heading_targets_map[html_name] = heading_targets

content = (
    'window.NP_KNOWLEDGE_SEARCH_INDEX = ' + json.dumps(index, indent=2, ensure_ascii=False) + ';\n\n'
    'window.NP_KNOWLEDGE_SEARCH_SUMMARIES = ' + json.dumps(summaries, indent=2, ensure_ascii=False) + ';\n\n'
    'window.NP_KNOWLEDGE_SEARCH_HEADINGS = ' + json.dumps(heading_map, indent=2, ensure_ascii=False) + ';\n\n'
    'window.NP_KNOWLEDGE_SEARCH_HEADING_TARGETS = ' + json.dumps(heading_targets_map, indent=2, ensure_ascii=False) + ';\n'
)
OUT_FILE.write_text(content, encoding='utf-8')
print(f'wrote {OUT_FILE}')
print(f'indexed {len(index)} pages')
