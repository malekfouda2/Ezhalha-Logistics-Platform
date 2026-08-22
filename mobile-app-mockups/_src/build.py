#!/usr/bin/env python3
"""
Builds every client-app mockup screen from a declarative spec.

Why a generator: the client surface is ~60 screens across 10 flows, and they share a
device chrome, a step indicator, a tab bar and about a dozen card patterns. Hand-writing
each one drifts — the same list renders three different ways and nobody notices. Here a
screen is data, the components are functions, and the design system lives in one place
(_src/base.css.html, lifted verbatim from the original source.html).

Screen content is taken from the real pages in client/src/pages/client/, not invented:
card titles, wizard steps, tab names and dialog titles all match the web app.

Usage:
    python3 _src/build.py            # writes HTML + renders PNGs
    python3 _src/build.py --no-png   # HTML only (fast)
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE_CSS = (ROOT / "_src" / "base.css.html").read_text()
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

# ── primitives ───────────────────────────────────────────────────────────────

STATUS = (
    '<div class="island"></div>'
    '<div class="status{onbrand}"><span>{time}</span><span class="sig">'
    '<span class="bars"><i></i><i></i><i></i><i></i></span>'
    '<span style="font-size:12px">5G</span><span class="batt"><i></i></span></span></div>'
)

ICONS = {
    "back": '<path d="m15 18-6-6 6-6"/>',
    "fwd": '<path d="M5 12h14M13 5l7 7-7 7"/>',
    "chev": '<path d="m6 9 6 6 6-6"/>',
    "check": '<path d="M20 6 9 17l-5-5"/>',
    "clock": '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    "info": '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
    "warn": '<path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
    "box": '<path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>',
    "home": '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
    "doc": '<path d="M4 2h11l5 5v15H4z"/><path d="M8 12h8M8 16h8M8 8h3"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    "plus": '<path d="M12 5v14M5 12h14"/>',
    "truck": '<rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 3v5h-7z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>',
    "pin": '<path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7z"/><circle cx="12" cy="9" r="2.5"/>',
    "card": '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/>',
    "store": '<path d="M3 9 4 3h16l1 6M4 9v12h16V9M9 21v-7h6v7"/>',
    "shield": '<path d="M12 2 4 6v6c0 5 3.4 9.4 8 10 4.6-.6 8-5 8-10V6z"/>',
    "scale": '<path d="M12 3v18M7 7h10M5 21h14"/><path d="m5 7-3 6h6zM19 7l3 6h-6z"/>',
    "globe": '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
    "ship": '<path d="M3 18h18l-2-7H5zM12 11V4M8 7h8"/>',
    "upload": '<path d="M12 3v12M7 8l5-5 5 5M5 21h14"/>',
    "bell": '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    "lock": '<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
    "x": '<path d="M18 6 6 18M6 6l12 12"/>',
    "refresh": '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
    "chart": '<path d="M3 3v18h18"/><path d="m7 15 4-5 3 3 5-7"/>',
}


def svg(name, size=17, w=2):
    return (
        f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" fill="none" '
        f'stroke="currentColor" stroke-width="{w}" stroke-linecap="round" '
        f'stroke-linejoin="round">{ICONS[name]}</svg>'
    )


def sar(amount):
    """﷼ is strong-RTL and reorders next to digits; force LTR."""
    return f'<span class="sar">﷼{amount}</span>'


# ── blocks ───────────────────────────────────────────────────────────────────

def title(t, sub=None):
    out = f'<h1 class="page" style="margin-top:6px">{t}</h1>'
    if sub:
        out += f'<div class="sub">{sub}</div>'
    return out


def back(t, sub=None, right=None):
    r = f'<span style="margin-left:auto">{right}</span>' if right else ""
    s = f'<div class="stepnum" style="margin-top:1px">{sub}</div>' if sub else ""
    return (
        f'<div class="backrow"><div class="backbtn">{svg("back", 18, 2.2)}</div>'
        f'<div><div style="font-weight:800;font-size:16px">{t}</div>{s}</div>{r}</div>'
    )


def steps(n, of):
    segs = "".join(f'<span class="sg{" on" if i < n else ""}"></span>' for i in range(of))
    return f'<div class="stepbar">{segs}</div>'


def label(t):
    return f'<div class="lbl2">{t}</div>'


def field(text, placeholder=False, icon=None, flag=None):
    inner = f'<span class="ph">{text}</span>' if placeholder else f"<span>{text}</span>"
    if flag:
        inner = f'<span><span class="flag">{flag}</span> &nbsp;{text}</span>'
    ic = svg(icon, 16, 2.2) if icon else ""
    ic = ic.replace('stroke="currentColor"', 'stroke="#94a3b8"') if ic else ""
    return f'<div class="inp2">{inner}{ic}</div>'


def row2(a, b):
    return f'<div class="fieldrow">{a}{b}</div>'


def note(text, tone="brand"):
    style = "" if tone == "brand" else ' style="background:#f8fafc;border-color:var(--line);color:var(--muted)"'
    ic = "info" if tone == "brand" else "clock"
    return f'<div class="note"{style}>{svg(ic, 15)}<span>{text}</span></div>'


def kvcard(rows, total=None):
    body = "".join(
        f'<div class="sr{" brd" if i < len(rows) - 1 else ""}"><span>{k}</span><b>{v}</b></div>'
        for i, (k, v) in enumerate(rows)
    )
    if total:
        body += f'<div class="sr tot"><span>{total[0]}</span><b>{total[1]}</b></div>'
    return f'<div class="sumcard">{body}</div>'


def cta(text, sub=None, tone="brand"):
    bg = "var(--brand)" if tone == "brand" else "#b91c1c"
    s = f'<div class="sm">{sub}</div>' if sub else ""
    return (
        f'<div class="cta"><div class="btn" style="background:{bg}">{text}</div>{s}</div>'
    )


def tabbar(active):
    items = [("home", "Home"), ("box", "Shipments"), None, ("doc", "Invoices"), ("user", "Profile")]
    out = ""
    for it in items:
        if it is None:
            out += f'<div class="tab"><div class="fab">{svg("plus", 26, 2.2)}</div></div>'
            continue
        icon, name = it
        on = " on" if name.lower() == active else ""
        out += f'<div class="tab{on}">{svg(icon, 22, 1.8)}{name}</div>'
    return f'<div class="tabbar">{out}</div>'


def chips(items, active=0):
    out = "".join(
        f'<span class="chip{" on" if i == active else ""}">{c}</span>' for i, c in enumerate(items)
    )
    return f'<div class="chips">{out}</div>'


def rate(carrier, cls, service, when, price, selected=False, badge=None, tag=None):
    b = f' <span class="cheap">{badge}</span>' if badge else ""
    t = f'<span class="tick">{tag}</span>' if tag else ""
    sel = " sel" if selected else ""
    return (
        f'<div class="rate{sel}">{t}<div class="rh"><div class="clogo {cls}">{carrier}</div>'
        f'<div><div class="cn">{service}{b}</div><div class="cs">{when}</div></div>'
        f'<div class="price"><div class="pv">{price}</div><div class="pc">incl. VAT</div></div>'
        f"</div></div>"
    )


def navlist(rows):
    out = ""
    for r in rows:
        icon, t, s = r[0], r[1], r[2]
        right = r[3] if len(r) > 3 else '<span class="chev">›</span>'
        out += (
            f'<div class="nl"><div class="nic">{svg(icon)}</div>'
            f'<div><div class="nt">{t}</div><div class="ns">{s}</div></div>{right}</div>'
        )
    return f'<div class="navlist">{out}</div>'


def sheet(inner):
    return (
        '<div style="position:absolute;inset:0;background:rgba(15,23,41,.4);z-index:7"></div>'
        '<div style="position:absolute;left:0;right:0;bottom:0;background:#fff;'
        'border-radius:28px 28px 0 0;padding:10px 22px 30px;z-index:8;'
        'box-shadow:0 -18px 40px rgba(15,23,41,.18)">'
        '<div style="width:42px;height:5px;border-radius:3px;background:#dde3ea;margin:0 auto 18px"></div>'
        f"{inner}</div>"
    )


def blurred(inner):
    return f'<div class="body" style="filter:blur(2px);opacity:.4">{inner}</div>'


def success(icon_tone, heading, para, extra=""):
    bg, fg = ("var(--green-bg)", "#16a34a") if icon_tone == "green" else ("rgba(254,82,0,.12)", "var(--brand)")
    return (
        f'<div class="successwrap"><div class="tickbig" style="background:{bg};color:{fg}">'
        f'{svg("check", 46, 2.6)}</div><h2>{heading}</h2><p>{para}</p>{extra}</div>'
    )


# ── screen assembly ──────────────────────────────────────────────────────────

def screen(name, body, cta_html="", tab=None, dark=False, rtl=False, caption=None, raw=False):
    cls = "screen" + (" rtl" if rtl else "")
    style = ' style="background:#0f1219"' if dark else ""
    st = STATUS.format(time="9:41", onbrand=" onbrand" if dark else "")
    inner = body if raw else f'<div class="body">{body}</div>'
    hi = '<div class="home-ind light"></div>' if dark else '<div class="home-ind"></div>'
    return {
        "name": name,
        "caption": caption or name,
        "html": (
            f'<div><div class="device"><div class="{cls}"{style}>{st}{inner}'
            f'{cta_html}{tabbar(tab) if tab else ""}{hi}</div></div>'
            f'<div class="caption">{caption or name}</div></div>'
        ),
    }


def write_flow(folder, flow_title, screens, no_png=False):
    out_dir = ROOT / "client" / folder
    out_dir.mkdir(parents=True, exist_ok=True)

    gallery = (
        BASE_CSS
        + "</style></head><body><div class='row'>"
        + "".join(s["html"] for s in screens)
        + "</div></body></html>"
    )
    (out_dir / "_all.html").write_text(gallery)

    if no_png:
        print(f"  {folder:26s} {len(screens):2d} screens (html only)")
        return

    for i, s in enumerate(screens, 1):
        single = (
            BASE_CSS
            + "</style></head><body style='background:#e9ebf0;padding:22px'><div class='row'>"
            + s["html"].replace('<div class="caption"', '<div class="caption" style="display:none"')
            + "</div></body></html>"
        )
        tmp = out_dir / f"_tmp.html"
        tmp.write_text(single)
        png = out_dir / f"{i:02d}-{s['name']}.png"
        subprocess.run(
            [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
             "--force-device-scale-factor=3", "--window-size=460,914",
             f"--screenshot={png}", f"file://{tmp}"],
            capture_output=True,
        )
        tmp.unlink(missing_ok=True)

    rows = max(1, (len(screens) + 2) // 3)
    subprocess.run(
        [CHROME, "--headless", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=2", f"--window-size=1600,{rows * 1010 + 80}",
         f"--screenshot={out_dir / '00-gallery.png'}", f"file://{out_dir / '_all.html'}"],
        capture_output=True,
    )
    print(f"  {folder:26s} {len(screens):2d} screens + gallery")
