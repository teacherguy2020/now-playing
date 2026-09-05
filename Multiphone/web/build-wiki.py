#!/usr/bin/env python3
"""Build the small static Multiphone wiki from wiki/*.md."""

from html import escape
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "wiki"
SITE = ROOT / "site"


def inline(text):
    text = escape(text, quote=False)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    def link(match):
        label, target = match.group(1), match.group(2)
        if target.endswith(".md") and not target.startswith("../"):
            target = target[:-3] + ".html"
        return f'<a href="{target}">{label}</a>'
    text = re.sub(r"\[([^]]+)\]\(([^)]+)\)", link, text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    return text


def render(md):
    out, lines, in_code, in_list, list_tag = [], md.splitlines(), False, False, None
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                out.append("</code></pre>")
            else:
                out.append("<pre><code>")
            in_code = not in_code
            continue
        if in_code:
            out.append(escape(line) + "\n")
            continue
        if not line:
            if in_list:
                out.append(f"</{list_tag}>"); in_list = False; list_tag = None
            continue
        if line.startswith("#"):
            if in_list:
                out.append(f"</{list_tag}>"); in_list = False; list_tag = None
            level = len(line) - len(line.lstrip("#"))
            out.append(f"<h{level}>{inline(line[level:].strip())}</h{level}>")
        elif re.match(r"^[-*] ", line):
            if not in_list:
                out.append("<ul>"); in_list = True; list_tag = "ul"
            out.append(f"<li>{inline(line[2:])}</li>")
        elif re.match(r"^\d+\. ", line):
            if not in_list:
                out.append("<ol>"); in_list = True; list_tag = "ol"
            out.append(f"<li>{inline(re.sub(r'^\d+\. ', '', line))}</li>")
        elif line.startswith("> "):
            out.append(f"<blockquote>{inline(line[2:])}</blockquote>")
        elif "|" in line and line.strip().startswith("|"):
            # Keep the compact project tables readable without a dependency.
            cells = [c.strip() for c in line.strip().strip("|").split("|")]
            if all(set(c) <= {"-", ":", " "} for c in cells):
                continue
            tag = "th" if not any(x.startswith("<table") for x in out[-3:]) else "td"
            if tag == "th": out.append("<table><tr>" + "".join(f"<th>{inline(c)}</th>" for c in cells) + "</tr>")
            else: out.append("<tr>" + "".join(f"<td>{inline(c)}</td>" for c in cells) + "</tr>")
        else:
            out.append(f"<p>{inline(line)}</p>")
    if in_list: out.append(f"</{list_tag}>")
    if any(x.startswith("<table") for x in out): out.append("</table>")
    return "\n".join(out)


def page(title, body, nav):
    links = "".join(f'<li><a href="{href}">{label}</a></li>' for label, href in nav)
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(title)} — Shyvers Multiphone</title><link rel="stylesheet" href="style.css"></head>
<body><header><a href="index.html">Shyvers Multiphone Project</a><span>Historical reconstruction + reversible modernization</span></header>
<div class="layout"><nav><strong>Wiki</strong><ul>{links}</ul><p><a href="../README.md">Project README</a></p></nav><main>{body}</main></div>
</body></html>'''


def main():
    SITE.mkdir(exist_ok=True)
    nav = [(p.stem.replace("-", " ").title(), p.stem + ".html") for p in sorted(SOURCE.glob("*.md")) if p.name != "index.md"]
    for source in sorted(SOURCE.glob("*.md")):
        title = source.stem.replace("-", " ").title()
        html = page(title, render(source.read_text()), nav)
        (SITE / (source.stem + ".html")).write_text(html)


if __name__ == "__main__":
    main()
