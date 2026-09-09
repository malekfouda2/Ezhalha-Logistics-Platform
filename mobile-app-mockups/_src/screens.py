#!/usr/bin/env python3
"""
Every client-app screen, grouped by flow.

Content mirrors client/src/pages/client/*.tsx — the card titles, wizard steps, tab names
and dialog titles are the real ones, so a screen here maps to a page there.
"""

from build import (
    back, chips, cta, field, kvcard, label, navlist, note, rate, row2, sar,
    screen, sheet, steps, success, svg, tabbar, title, blurred,
)

# ═══════════════════════════════════════════════════════════════ 01 · AUTH ═══

def auth():
    login_body = (
        '<div class="login">'
        '<div class="logo" style="height:70px;display:flex;align-items:center;justify-content:center;margin-top:44px">'
        '<div style="font-size:30px;font-weight:800;letter-spacing:-.03em">ezhalha</div></div>'
        '<div class="lt" style="margin-top:26px">Welcome back</div>'
        '<div class="ls">Sign in to your account</div>'
        '<div class="field"><label>Email, username or phone</label><div class="inp">razan@alrajhi-trading.com</div></div>'
        '<div class="field"><label>Password</label><div class="inp">••••••••••</div></div>'
        '<div style="text-align:right;color:var(--brand);font-size:13px;font-weight:700;margin-top:12px">Forgot password?</div>'
        '<div class="signin">Sign in</div>'
        '<div class="divider">OR</div>'
        '<div class="apply">Email me a sign-in code</div>'
        '<div style="text-align:center;color:var(--muted);font-size:13px;margin-top:22px">'
        'New to ezhalha? <b style="color:var(--brand)">Apply for an account</b></div>'
        "</div>"
    )

    otp_req = (
        '<div class="login">'
        f'<div class="backbtn" style="margin-top:8px">{svg("back", 18, 2.2)}</div>'
        '<div class="lt" style="margin-top:34px">Sign in with a code</div>'
        '<div class="ls">We\'ll email you a 6-digit code</div>'
        '<div class="field"><label>Email address</label><div class="inp">razan@alrajhi-trading.com</div></div>'
        '<div class="signin">Send code</div>'
        + note("No password needed. The code expires in 10 minutes.")
        + "</div>"
    )

    otp_verify = (
        '<div class="login">'
        f'<div class="backbtn" style="margin-top:8px">{svg("back", 18, 2.2)}</div>'
        '<div class="lt" style="margin-top:34px">Check your email</div>'
        '<div class="ls">Code sent to<br><b style="color:var(--ink)">razan@alrajhi-trading.com</b></div>'
        '<div class="otpbox"><div class="d on">4</div><div class="d on">9</div><div class="d on">2</div>'
        '<div class="d cur">|</div><div class="d"></div><div class="d"></div></div>'
        '<div style="text-align:center;color:var(--muted);font-size:13px;margin-top:20px">'
        'Expires in <b style="color:var(--ink)">9:42</b></div>'
        '<div class="signin">Verify and sign in</div>'
        '<div style="text-align:center;color:var(--muted);font-size:13px;margin-top:18px">'
        'Didn\'t get it? <b style="color:var(--brand)">Resend</b></div></div>'
    )

    forgot = (
        '<div class="login">'
        f'<div class="backbtn" style="margin-top:8px">{svg("back", 18, 2.2)}</div>'
        '<div class="lt" style="margin-top:34px">Reset your password</div>'
        '<div class="ls">We\'ll send you a reset link</div>'
        '<div class="field"><label>Email address</label><div class="inp">razan@alrajhi-trading.com</div></div>'
        '<div class="signin">Send reset link</div>'
        + note("For security we always say the email was sent, whether or not the address exists.")
        + "</div>"
    )

    reset = (
        '<div class="login">'
        '<div class="lt" style="margin-top:52px">Set a new password</div>'
        '<div class="ls">At least 8 characters</div>'
        '<div class="field"><label>New password</label><div class="inp">••••••••••</div></div>'
        '<div class="field"><label>Confirm password</label><div class="inp">••••••••••</div></div>'
        '<div style="display:flex;gap:7px;margin-top:14px">'
        '<span style="flex:1;height:4px;border-radius:3px;background:#16a34a"></span>'
        '<span style="flex:1;height:4px;border-radius:3px;background:#16a34a"></span>'
        '<span style="flex:1;height:4px;border-radius:3px;background:#16a34a"></span>'
        '<span style="flex:1;height:4px;border-radius:3px;background:var(--line)"></span></div>'
        '<div style="color:var(--muted);font-size:12px;margin-top:8px">Strong</div>'
        '<div class="signin">Save and sign in</div>'
        + note("Changing your password signs you out on every other device.")
        + "</div>"
    )

    invite = (
        '<div class="login">'
        '<div class="lt" style="margin-top:52px">You\'ve been invited</div>'
        '<div class="ls"><b style="color:var(--ink)">Al Rajhi Trading</b> added you to their ezhalha account</div>'
        '<div class="scard" style="margin-top:22px;text-align:center">'
        '<div class="avatar" style="margin:0 auto 12px;width:52px;height:52px;border-radius:17px;font-size:19px">AR</div>'
        '<div style="font-weight:800;font-size:15px">Al Rajhi Trading</div>'
        '<div style="color:var(--muted);font-size:12.5px;margin-top:3px">Invited by Malek Fouda</div></div>'
        '<div class="field"><label>Create a password</label><div class="inp">••••••••••</div></div>'
        '<div class="signin">Accept and continue</div></div>'
    )

    apply_form = (
        '<div class="login" style="overflow:hidden">'
        f'<div class="backbtn" style="margin-top:8px">{svg("back", 18, 2.2)}</div>'
        '<div class="lt" style="margin-top:20px;text-align:left;font-size:22px">Apply for an account</div>'
        '<div class="ls" style="text-align:left">We\'ll review and get back within one business day</div>'
        + label("Account type")
        + '<div class="slot" style="grid-template-columns:1fr 1fr">'
        '<div class="s on">Company</div><div class="s">Individual</div></div>'
        + label("Company")
        + field("Al Rajhi Trading")
        + '<div style="height:10px"></div>'
        + field("Commercial registration no.", placeholder=True)
        + label("Contact")
        + field("Full name", placeholder=True)
        + '<div style="height:10px"></div>'
        + field("Work email", placeholder=True)
        + '<div style="height:10px"></div>'
        + field("Phone", placeholder=True)
        + "</div>"
    )

    return [
        screen("login", login_body, raw=True, caption="Sign in"),
        screen("otp-request", otp_req, raw=True, caption="Request a code"),
        screen("otp-verify", otp_verify, raw=True, caption="Enter the code"),
        screen("forgot-password", forgot, raw=True, caption="Forgot password"),
        screen("reset-password", reset, raw=True, caption="Reset password"),
        screen("accept-invite", invite, raw=True, caption="Accept invite"),
        screen("apply", apply_form, raw=True, cta_html=cta("Submit application"), caption="Apply for an account"),
    ]


# ══════════════════════════════════════════════════════════ 02 · DASHBOARD ═══

def dashboard():
    home = (
        '<div class="toprow" style="padding-top:6px">'
        '<div class="company"><div class="avatar">AR</div>'
        '<div><div class="nm">Al Rajhi Trading</div><div class="rl">Razan Sameh · EZ0002</div></div></div>'
        f'<div class="iconbtn">{svg("bell", 19, 1.9)}<span class="dot"></span></div></div>'
        '<div class="greet">Welcome back!</div>'
        '<span class="tier">Pricing tier <b>VIP</b></span>'
        '<div class="grid2">'
        f'<div class="stat"><div class="ic">{svg("box", 17)}</div><div class="lbl">Total shipments</div>'
        '<div class="val">148</div><div class="trd">▲ 12% this month</div></div>'
        f'<div class="stat"><div class="ic">{svg("truck", 17)}</div><div class="lbl">In transit</div>'
        '<div class="val">23</div><div class="trd" style="color:var(--muted)">6 out for delivery</div></div>'
        f'<div class="stat"><div class="ic">{svg("doc", 17)}</div><div class="lbl">Outstanding</div>'
        f'<div class="val"><span class="cur">﷼</span>17,700</div><div class="trd" style="color:var(--amber)">2 invoices due</div></div>'
        f'<div class="stat"><div class="ic">{svg("chart", 17)}</div><div class="lbl">Spent (30d)</div>'
        '<div class="val"><span class="cur">﷼</span>24,180</div><div class="trd">▲ 8%</div></div>'
        "</div>"
        '<div class="sectionhd"><h2>Shipment Activity (Last 6 Months)</h2></div>'
        '<div class="scard" style="margin-top:0;padding:16px 15px">'
        '<div style="display:flex;align-items:flex-end;gap:10px;height:96px">'
        + "".join(
            f'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px">'
            f'<div style="width:100%;height:{h}px;background:{"var(--brand)" if i == 5 else "rgba(254,82,0,.22)"};border-radius:6px 6px 0 0"></div>'
            f'<span style="font-size:10px;color:var(--muted);font-weight:600">{m}</span></div>'
            for i, (h, m) in enumerate([(34, "Mar"), (52, "Apr"), (44, "May"), (68, "Jun"), (58, "Jul"), (82, "Aug")])
        )
        + "</div></div>"
        '<div class="sectionhd"><h2>Recent Shipments</h2><a>See all</a></div>'
        '<div class="listcard">'
        f'<div class="ship"><div class="pic">{svg("box", 19, 1.8)}</div><div class="mid">'
        '<div class="who">Olivia Bennett</div><div class="meta">EZH977158300 · New York</div></div>'
        f'<div class="rt"><div class="amt">{sar("795")}</div><span class="pill p-blue">In Transit</span></div></div>'
        f'<div class="ship"><div class="pic">{svg("box", 19, 1.8)}</div><div class="mid">'
        '<div class="who">Yuki Tanaka</div><div class="meta">EZH069906125 · Tokyo</div></div>'
        f'<div class="rt"><div class="amt">{sar("940")}</div><span class="pill p-amber">Processing</span></div></div>'
        "</div>"
    )

    notifications = (
        '<div class="toprow" style="padding-top:6px">'
        '<h1 class="page">Notifications</h1>'
        '<span style="color:var(--brand);font-size:13px;font-weight:700">Mark all read</span></div>'
        '<div class="listcard" style="margin-top:6px">'
        + _notif("green", "check", "Shipment delivered", "EZH740561330 delivered to James Carter in London.", "12 min ago", True)
        + _notif("amber", "warn", "Customs hold", "EZH069906125 needs an updated commercial invoice.", "2 h ago", True)
        + _notif("blue", "doc", "Invoice due in 5 days", f'INV-2026-0841 · {sar("12,480.00")} due 22 Aug.', "Yesterday")
        + _notif("orange", "truck", "Pickup confirmed", "FedEx will collect Tue 19 Aug, 09:00–17:00.", "Yesterday")
        + _notif("purple", "card", "Payment received", f'{sar("795.00")} paid on card •••• 4242.', "2 days ago")
        + "</div>"
    )

    return [
        screen("dashboard", home, tab="home", caption="Dashboard"),
        screen("notifications", notifications, caption="Notifications"),
    ]


def _notif(tone, icon, t, msg, when, unread=False):
    tones = {
        "green": ("var(--green-bg)", "var(--green)"),
        "amber": ("var(--amber-bg)", "var(--amber)"),
        "blue": ("var(--blue-bg)", "var(--blue)"),
        "purple": ("var(--purple-bg)", "var(--purple)"),
        "orange": ("rgba(254,82,0,.12)", "var(--brand)"),
    }
    bg, fg = tones[tone]
    dot = '<span class="undot"></span>' if unread else ""
    return (
        f'<div class="notif{" unread" if unread else ""}">'
        f'<div class="nic2" style="background:{bg};color:{fg}">{svg(icon, 17)}</div>'
        f'<div><div class="nb">{t}</div><div class="nm">{msg}</div>'
        f'<div class="nt2">{when}</div></div>{dot}</div>'
    )


# ═════════════════════════════════════════════ 03 · CREATE EXPRESS (9 steps) ═

WIZ = 9  # Type, Sender, Recipient, Packages, Rate, Customs, Pickup, Payment, Done


def create_express():
    select = (
        title("Create a shipment", "Choose the type of shipment")
        + '<div class="choose">'
        + _choose("ic-orange", "ship", "Express Shipment",
                  "International &amp; domestic courier via FedEx, DHL and partners.")
        + _choose("ic-blue", "globe", "Door To Door Freight",
                  "Import with all duties &amp; taxes prepaid on fixed lane pricing.")
        + _choose("ic-green", "pin", "Local Delivery",
                  "Last-mile delivery within Saudi Arabia via local carriers.")
        + "</div>"
    )

    s1 = (
        back("Shipment Type", "Step 1 of 9 · Select the shipment direction") + steps(1, WIZ)
        + label("Direction")
        + '<div class="choose" style="gap:11px;margin-top:0">'
        + _radio_card("Domestic", "Inside Saudi Arabia", True)
        + _radio_card("Import", "Into Saudi Arabia (inbound)")
        + _radio_card("Export", "Out of Saudi Arabia (outbound)")
        + "</div>"
        + label("Currency")
        + field("SAR - Saudi Riyal", icon="chev")
        + note("Direction decides which customs steps you'll see later.")
    )

    s2 = (
        back("Sender Details", "Step 2 of 9 · Pickup address and contact") + steps(2, WIZ)
        + label("Saved sender addresses")
        + '<div class="addrcard" style="border:2px solid var(--brand)">'
        f'<div class="dotic" style="background:rgba(254,82,0,.12);color:var(--brand)">{svg("home", 17, 1.9)}</div>'
        '<div><div class="nm2">Al Rajhi Trading — HQ</div>'
        '<div class="ln">King Fahd Rd, Al Olaya<br>Riyadh 12333 · 🇸🇦</div></div>'
        '<span class="edit">Default</span></div>'
        '<div class="addrcard">'
        f'<div class="dotic" style="background:var(--bg);color:var(--muted)">{svg("store", 17, 1.9)}</div>'
        '<div><div class="nm2">Warehouse — Jeddah</div>'
        '<div class="ln">Al Khumrah Industrial<br>Jeddah 23762 · 🇸🇦</div></div></div>'
        + label("Or enter a new address")
        + field("Contact name", placeholder=True)
        + '<div style="height:10px"></div>' + field("Phone", placeholder=True)
        + '<div style="height:10px"></div>' + field("Address line 1", placeholder=True)
        + '<div style="height:10px"></div>'
        + row2(field("City", placeholder=True), field("Postal code", placeholder=True))
    )

    s3 = (
        back("Recipient Details", "Step 3 of 9 · Delivery address and contact") + steps(3, WIZ)
        + label("Country")
        + field("United Arab Emirates", icon="chev", flag="🇦🇪")
        + label("Saved recipient addresses")
        + '<div class="addrcard">'
        f'<div class="dotic" style="background:var(--bg);color:var(--muted)">{svg("user", 17, 1.9)}</div>'
        '<div><div class="nm2">Gulf Retail LLC</div>'
        '<div class="ln">Sheikh Zayed Rd, Al Quoz<br>Dubai · 🇦🇪</div></div>'
        '<span class="edit">Use</span></div>'
        + label("Or enter a new address")
        + field("Recipient name", placeholder=True)
        + '<div style="height:10px"></div>' + field("Phone", placeholder=True)
        + '<div style="height:10px"></div>'
        + row2(field("City", placeholder=True), field("Postal code", placeholder=True))
        + note("Some countries also require a state or province.")
    )

    s4 = (
        back("Package Details", "Step 4 of 9 · Weight and dimensions") + steps(4, WIZ)
        + _pkg("Package 1", "4.5", "40", "30", "20")
        + _pkg("Package 2", "2.0", "25", "20", "15")
        + '<div class="addbtn">+ &nbsp;Add another package</div>'
        + f'<div class="addbtn" style="display:flex;align-items:center;justify-content:center;gap:8px">{svg("upload", 16)}Scan a document to fill this in</div>'
        + kvcard([("Actual weight", "6.5 kg"), ("Volumetric weight", "6.0 kg")],
                 total=("Chargeable weight", "6.5 kg"))
    )

    s5 = (
        back("Select Shipping Rate", "Step 5 of 9 · Riyadh → Dubai · 6.5 kg") + steps(5, WIZ)
        + rate("FedEx", "lg-fedex", "International Priority", "Delivered Tue 19 Aug · 2 days",
               sar("795"), selected=True, tag="SELECTED")
        + rate("DHL", "lg-dhl", "Express Worldwide", "Delivered Wed 20 Aug · 3 days",
               sar("712"), badge="CHEAPEST")
        + rate("ARX", "lg-aramex", "Priority Document", "Delivered Wed 20 Aug · 3 days", sar("864"))
        + note("Prices held for 30 minutes. Re-quote after that.", tone="grey")
    )

    s6 = (
        back("Customs Details", "Step 6 of 9 · International only") + steps(6, WIZ)
        + f'<div class="addbtn" style="display:flex;align-items:center;justify-content:center;gap:8px;margin-top:14px">{svg("upload", 16)}Scan an invoice to fill this in</div>'
        + _item("Cotton T-Shirts", "Apparel · 100% cotton · 🇮🇳 India", sar("450.00"),
                f'30 × {sar("15.00")}', "ok", "HS 6109.10 · high confidence")
        + _item("Leather Wallets", "Accessories · Genuine leather · 🇮🇹 Italy", sar("600.00"),
                f'10 × {sar("60.00")}', "warn2", "HS 4202.31 · confirm this")
        + '<div class="addbtn">+ &nbsp;Add item</div>'
        + kvcard([("2 items · 40 units", sar("1,050.00")), ("Declared value", "USD 280.00")])
    )

    s7 = (
        back("Carrier Pickup", "Step 7 of 9 · Optional") + steps(7, WIZ)
        + '<div class="toggle"><div><div style="font-weight:800;font-size:14.5px">Request a pickup</div>'
        '<div style="color:var(--muted);font-size:12.5px;margin-top:2px">Otherwise drop off at a branch</div></div>'
        '<div class="sw"></div></div>'
        + label("Pickup date")
        + '<div class="slot"><div class="s">Mon<span class="sd">18 Aug</span></div>'
        '<div class="s on">Tue<span class="sd">19 Aug</span></div>'
        '<div class="s">Wed<span class="sd">20 Aug</span></div></div>'
        + label("Ready between")
        + row2(field("09:00", icon="clock"), field("17:00", icon="clock"))
        + label("Pickup location")
        + field("Reception, Gate 2…", placeholder=True)
        + '<div style="height:10px"></div>'
        + field("Instructions (optional)", placeholder=True)
        + note("Booked after payment. A failed pickup never fails the shipment.")
    )

    s8 = (
        back("Payment Options", "Step 8 of 9 · Order Summary") + steps(8, WIZ)
        + kvcard([("Shipping", sar("620.00")), ("Fuel surcharge", sar("58.00")),
                  ("Pickup", sar("25.00")), ("VAT (15%)", sar("92.00"))],
                 total=("Total", sar("795.00")))
        + label("Pay with")
        + _paycard("VISA", "•••• 4242", "Expires 09/28", True)
        + _paycard("+", "New card", "Secured by Tap", False, grey=True)
        + _paycard("", "Pay later · 30 days", f'{sar("42,300")} credit available', False, icon="card")
    )

    s9 = success(
        "green", "Shipment Created Successfully!",
        "Your shipment has been booked with the carrier.",
        '<div class="trackbox"><div class="tk">Shipment ID</div>'
        '<div class="tv">EZH977158300</div>'
        '<div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:13px;'
        'border-top:1px solid var(--line)">'
        '<span style="color:var(--muted);font-size:12.5px">FedEx · 7940 5613 3021</span>'
        '<span class="pill p-amber" style="margin:0">Processing</span></div></div>'
        f'<div class="dlrow"><div class="dl">{svg("doc", 16)}Label</div>'
        f'<div class="dl">{svg("doc", 16)}Invoice</div></div>'
    )

    hs_sheet = sheet(
        '<div style="font-weight:800;font-size:18px;letter-spacing:-.02em">Confirm the HS code</div>'
        '<p style="color:var(--muted);font-size:13.5px;margin-top:7px;line-height:1.5">'
        'Leather Wallets — pick the code customs should see.</p>'
        + "".join(
            f'<div class="card3" style="margin-top:10px"><div><div style="font-weight:800;font-size:14px;'
            f'font-family:ui-monospace,Menlo,monospace">{code}</div>'
            f'<div style="color:var(--muted);font-size:12px;margin-top:3px">{desc}</div></div>'
            f'<div class="radio{" on" if on else ""}"></div></div>'
            for code, desc, on in [
                ("4202.31", "Articles of leather, pocket-size", True),
                ("4202.32", "With outer surface of plastic sheeting", False),
                ("4202.39", "Other similar articles", False),
            ]
        )
        + '<div style="background:var(--brand);color:#fff;text-align:center;font-weight:800;'
        'font-size:15px;padding:16px;border-radius:16px;margin-top:18px">Confirm code</div>'
    )

    return [
        screen("type-select", select, tab="shipments", caption="Choose type"),
        screen("step1-shipment-type", s1, cta_html=cta("Continue"), caption="1 · Shipment Type"),
        screen("step2-sender", s2, cta_html=cta("Continue"), caption="2 · Sender Details"),
        screen("step3-recipient", s3, cta_html=cta("Continue"), caption="3 · Recipient Details"),
        screen("step4-packages", s4, cta_html=cta("Get rates"), caption="4 · Package Details"),
        screen("step5-rate", s5, cta_html=cta(f'Continue with FedEx · {sar("795")}'), caption="5 · Select Rate"),
        screen("step6-customs", s6, cta_html=cta("Continue"), caption="6 · Customs Details"),
        screen("step7-pickup", s7, cta_html=cta("Review order"), caption="7 · Carrier Pickup"),
        screen("step8-payment", s8, cta_html=cta(f'Pay {sar("795.00")}', "Booked with the carrier after payment"), caption="8 · Payment Options"),
        screen("step9-confirmation", s9, raw=True, cta_html=cta("Track shipment"), caption="9 · Confirmation"),
        screen("hs-code-confirm", blurred(s6) + hs_sheet, raw=True, caption="HS code confirm"),
    ]


def _choose(ic, icon, h, p):
    return (
        f'<div class="ct"><div class="cic {ic}">{svg(icon, 24, 1.8)}</div><h3>{h}</h3><p>{p}</p>'
        f'<div class="go">Continue {svg("fwd", 15, 2.2)}</div></div>'
    )


def _radio_card(t, s, on=False):
    return (
        f'<div class="card3" style="margin-top:0"><div><div style="font-weight:800;font-size:14.5px">{t}</div>'
        f'<div style="color:var(--muted);font-size:12.5px;margin-top:2px">{s}</div></div>'
        f'<div class="radio{" on" if on else ""}"></div></div>'
    )


def _pkg(name, w, l, wd, h):
    return (
        f'<div class="pkgrow"><div class="ph2"><span>{name}</span>'
        f'<span style="color:var(--muted);font-size:12px;font-weight:600">Remove</span></div>'
        f'<div class="dims">'
        f'<div class="dim"><div class="dk">Weight</div><div class="dv">{w}</div></div>'
        f'<div class="dim"><div class="dk">L cm</div><div class="dv">{l}</div></div>'
        f'<div class="dim"><div class="dk">W cm</div><div class="dv">{wd}</div></div>'
        f'<div class="dim"><div class="dk">H cm</div><div class="dv">{h}</div></div></div></div>'
    )


def _item(nm, sub, total, unit, dot, hs):
    return (
        f'<div class="itemcard"><div class="it"><div><div class="inm">{nm}</div>'
        f'<div class="isub">{sub}</div></div><div style="text-align:right;flex:none">'
        f'<div style="font-weight:800;font-size:14px">{total}</div>'
        f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">{unit}</div></div></div>'
        f'<div class="hs"><span class="{dot}"></span>{hs}</div></div>'
    )


def _paycard(mark, t, s, on, grey=False, icon=None):
    if icon:
        inner = f'<div class="brandmark" style="background:rgba(254,82,0,.12);color:var(--brand)">{svg(icon, 18)}</div>'
    elif grey:
        inner = f'<div class="brandmark" style="background:var(--bg);color:var(--muted)">{mark}</div>'
    else:
        inner = f'<div class="brandmark">{mark}</div>'
    return (
        f'<div class="card3">{inner}<div><div style="font-weight:800;font-size:14px">{t}</div>'
        f'<div style="color:var(--muted);font-size:12px;margin-top:2px">{s}</div></div>'
        f'<div class="radio{" on" if on else ""}"></div></div>'
    )


# ══════════════════════════════════════════════════ 04 · CREATE LOCAL (KSA) ═══

def create_local():
    LOC = 5
    s1 = (back("Sender Details", "Step 1 of 5 · Local delivery") + steps(1, LOC)
          + label("Pick up from") + field("Al Rajhi Trading — HQ, Riyadh", icon="chev")
          + label("Or enter a new address")
          + field("Contact name", placeholder=True) + '<div style="height:10px"></div>'
          + field("Phone", placeholder=True) + '<div style="height:10px"></div>'
          + field("District", placeholder=True) + '<div style="height:10px"></div>'
          + field("Short address (national address)", placeholder=True))
    s2 = (back("Recipient Details", "Step 2 of 5 · Inside Saudi Arabia") + steps(2, LOC)
          + field("Recipient name", placeholder=True) + '<div style="height:10px"></div>'
          + field("Phone", placeholder=True) + '<div style="height:10px"></div>'
          + row2(field("Jeddah"), field("23762"))
          + '<div style="height:10px"></div>' + field("Address line 1", placeholder=True)
          + note("Domestic only. For cross-border use Express."))
    s3 = (back("Package Details", "Step 3 of 5") + steps(3, LOC)
          + _pkg("Package 1", "2.0", "25", "20", "15")
          + '<div class="addbtn">+ &nbsp;Add another package</div>'
          + '<div class="toggle"><div><div style="font-weight:800;font-size:14.5px">Cash on delivery</div>'
            '<div style="color:var(--muted);font-size:12.5px;margin-top:2px">Collect payment from the recipient</div></div>'
            '<div class="sw off"></div></div>'
          + kvcard([("Actual weight", "2.0 kg")], total=("Chargeable weight", "2.0 kg")))
    s4 = (back("Select Rate", "Step 4 of 5 · Riyadh → Jeddah") + steps(4, LOC)
          + rate("SMSA", "lg-smsa", "SMSA Express", "Next day", sar("28"), selected=True, tag="SELECTED")
          + rate("NQL", "lg-naqel", "Naqel Express", "1–2 days", sar("24"), badge="CHEAPEST")
          + rate("RDX", "lg-redbox", "Redbox", "2 days · locker drop-off", sar("19"))
          + rate("AJX", "lg-ajex", "AJEX", "Next day", sar("31")))
    s5 = (back("Payment", "Step 5 of 5 · Order summary") + steps(5, LOC)
          + kvcard([("Delivery", sar("24.35")), ("VAT (15%)", sar("3.65"))], total=("Total", sar("28.00")))
          + label("Pay with")
          + _paycard("VISA", "•••• 4242", "Expires 09/28", True)
          + _paycard("", "Pay later · 30 days", f'{sar("42,300")} available', False, icon="card"))
    done = success("green", "Local shipment created",
                   "SMSA has the booking and your label is ready.",
                   '<div class="trackbox"><div class="tk">Shipment ID</div>'
                   '<div class="tv">EZH552031884</div></div>'
                   f'<div class="dlrow"><div class="dl">{svg("doc", 16)}Label</div>'
                   f'<div class="dl">{svg("pin", 16)}Track</div></div>')
    return [
        screen("step1-sender", s1, cta_html=cta("Continue"), caption="1 · Sender"),
        screen("step2-recipient", s2, cta_html=cta("Continue"), caption="2 · Recipient"),
        screen("step3-packages", s3, cta_html=cta("Get rates"), caption="3 · Packages"),
        screen("step4-rate", s4, cta_html=cta(f'Continue · {sar("28")}'), caption="4 · Select Rate"),
        screen("step5-payment", s5, cta_html=cta(f'Pay {sar("28.00")}'), caption="5 · Payment"),
        screen("confirmation", done, raw=True, cta_html=cta("Track shipment"), caption="Created"),
    ]


# ═══════════════════════════════════════════ 05 · DOOR TO DOOR FREIGHT (DDP) ═

def create_ddp():
    D = 9
    s1 = (back("Shipment method", "Step 1 of 9 · Door To Door Freight") + steps(1, D)
          + '<div class="slot" style="margin-top:14px"><div class="s on">Air<span class="sd">5–8 days</span></div>'
            '<div class="s">Sea<span class="sd">25–35 days</span></div>'
            '<div class="s">Land<span class="sd">Domestic</span></div></div>'
          + note("Duties and taxes are prepaid — the recipient pays nothing on arrival."))
    s2 = (back("Origin country", "Step 2 of 9 · Fixed lane pricing") + steps(2, D)
          + field("China", icon="chev", flag="🇨🇳")
          + label("Available lanes")
          + kvcard([("China → Saudi Arabia · Air", f'{sar("28.00")} / kg'),
                    ("China → Saudi Arabia · Sea", f'{sar("890.00")} / CBM')])
          + note("Lane rates are agreed in advance and don't change per shipment."))
    s3 = (back("Recipient details", "Step 3 of 9 · Delivery in Saudi Arabia") + steps(3, D)
          + field("Al Rajhi Trading — HQ, Riyadh", icon="chev")
          + label("Or enter a new address")
          + field("Recipient name", placeholder=True) + '<div style="height:10px"></div>'
          + field("Phone", placeholder=True) + '<div style="height:10px"></div>'
          + row2(field("City", placeholder=True), field("Postal code", placeholder=True)))
    s4 = (back("Supplier details", "Step 4 of 9 · Who we collect from") + steps(4, D)
          + field("Shenzhen Yuhua Electronics") + '<div style="height:10px"></div>'
          + field("+86 755 8899 2210") + '<div style="height:10px"></div>'
          + field("Factory address", placeholder=True)
          + note("We contact the supplier directly to arrange collection."))
    s5 = (back("Package details", "Step 5 of 9 · Cargo") + steps(5, D)
          + '<div class="pkgrow"><div class="ph2"><span>Pallet 1</span>'
            '<span style="color:var(--muted);font-size:12px;font-weight:600">1.20 CBM</span></div>'
            '<div class="dims">'
            '<div class="dim"><div class="dk">Weight</div><div class="dv">180</div></div>'
            '<div class="dim"><div class="dk">L cm</div><div class="dv">120</div></div>'
            '<div class="dim"><div class="dk">W cm</div><div class="dv">100</div></div>'
            '<div class="dim"><div class="dk">H cm</div><div class="dv">100</div></div></div></div>'
          + '<div class="addbtn">+ &nbsp;Add pallet</div>'
          + kvcard([("Total volume", "1.20 CBM"), ("Total weight", "180 kg")]))
    s6 = (back("Select rate", "Step 6 of 9 · Air freight") + steps(6, D)
          + '<div class="rate sel"><span class="tick">SELECTED</span><div class="rh">'
            '<div class="clogo" style="background:#0f1729;color:#fff">DDP</div>'
            '<div><div class="cn">Air · door to door</div><div class="cs">5–8 days · duties prepaid</div></div>'
            f'<div class="price"><div class="pv">{sar("5,040")}</div><div class="pc">incl. VAT</div></div>'
            '</div></div>'
          + kvcard([("Chargeable weight", "180 kg"), ("Lane rate", f'{sar("28.00")} / kg'),
                    ("Duties &amp; clearance", "Included")], total=("Estimated", sar("5,040"))))
    s7 = (back("Documents", "Step 7 of 9 · Required for clearance") + steps(7, D)
          + _doc("Commercial invoice", "Required", True)
          + _doc("Packing list", "Required", True)
          + _doc("Certificate of origin", "If available", False)
          + _doc("SASO / SABER certificate", "If regulated goods", False)
          + note("Missing documents are the most common cause of clearance delays."))
    s8 = (back("Notes &amp; terms", "Step 8 of 9") + steps(8, D)
          + label("Notes for our team")
          + '<div class="inp2" style="height:84px;align-items:flex-start;padding-top:13px">'
            '<span class="ph">Anything we should know…</span></div>'
          + '<div class="toggle"><div><div style="font-weight:800;font-size:14px">I accept the freight terms</div>'
            '<div style="color:var(--muted);font-size:12px;margin-top:2px">Including duty &amp; tax prepayment</div></div>'
            '<div class="sw"></div></div>'
          + note("Final price is confirmed by our team after the cargo is measured at origin."))
    s9 = (back("Payment options", "Step 9 of 9 · Order summary") + steps(9, D)
          + kvcard([("Freight (180 kg × " + sar("28.00") + ")", sar("5,040.00")),
                    ("Duties &amp; clearance", "Included"), ("VAT (15%)", sar("756.00"))],
                   total=("Total", sar("5,796.00")))
          + label("Pay with")
          + _paycard("VISA", "•••• 4242", "Expires 09/28", True)
          + _paycard("", "Pay later · 30 days", f'{sar("42,300")} available', False, icon="card"))
    done = success("green", "Door To Door Freight shipment submitted",
                   "Our team will confirm the final rate once the cargo is measured at origin.",
                   '<div class="trackbox"><div class="tk">Reference</div>'
                   '<div class="tv">DDP-2026-0117</div>'
                   '<div style="display:flex;justify-content:space-between;margin-top:14px;'
                   'padding-top:13px;border-top:1px solid var(--line)">'
                   '<span style="color:var(--muted);font-size:12.5px">Air · China → Riyadh</span>'
                   '<span class="pill p-amber" style="margin:0">Under review</span></div></div>')
    return [
        screen("step1-method", s1, cta_html=cta("Continue"), caption="1 · Shipment method"),
        screen("step2-origin", s2, cta_html=cta("Continue"), caption="2 · Origin country"),
        screen("step3-recipient", s3, cta_html=cta("Continue"), caption="3 · Recipient"),
        screen("step4-supplier", s4, cta_html=cta("Continue"), caption="4 · Supplier"),
        screen("step5-packages", s5, cta_html=cta("Get rate"), caption="5 · Package details"),
        screen("step6-rate", s6, cta_html=cta("Continue"), caption="6 · Select rate"),
        screen("step7-documents", s7, cta_html=cta("Continue"), caption="7 · Documents"),
        screen("step8-terms", s8, cta_html=cta("Continue"), caption="8 · Notes &amp; terms"),
        screen("step9-payment", s9, cta_html=cta(f'Pay {sar("5,796.00")}'), caption="9 · Payment"),
        screen("confirmation", done, raw=True, cta_html=cta("View shipment"), caption="Submitted"),
    ]


def _doc(name, req, uploaded):
    right = ('<span class="pill p-green" style="margin:0;margin-left:auto">Uploaded</span>'
             if uploaded else '<span style="margin-left:auto;color:var(--brand);font-weight:700;font-size:12.5px">Upload</span>')
    return (f'<div class="docrow"><div class="docic">{svg("doc", 17)}</div>'
            f'<div><div style="font-weight:700;font-size:13.5px">{name}</div>'
            f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">{req}</div></div>{right}</div>')


# ══════════════════════════════════════════════════════════ 06 · SHIPMENTS ═══

def shipments():
    def card(trk, pill, cls, a, ac, b, bc, carrier, amt):
        return (f'<div class="scard"><div class="h"><span class="trkbig">{trk}</span>'
                f'<span class="pill {cls}">{pill}</span></div>'
                f'<div class="route"><div><div class="city">{a}</div><div class="cc">{ac}</div></div>'
                f'<div class="arrow"></div><div class="plane">{svg("ship", 15, 1.8)}</div>'
                f'<div style="text-align:right"><div class="city">{b}</div><div class="cc">{bc}</div></div></div>'
                f'<div style="display:flex;justify-content:space-between;margin-top:14px;padding-top:13px;'
                f'border-top:1px solid var(--line)"><span style="color:var(--muted);font-size:12.5px">{carrier}</span>'
                f'<span style="font-weight:800;font-size:14px">{amt}</span></div></div>')

    lst = (title("Shipments", "Track all your shipments")
           + f'<div class="search">{svg("pin", 18, 1.8)}Search by ID or recipient…</div>'
           + chips(["All", "Processing", "Attention", "Delivered"])
           + card("EZH977158300", "In Transit", "p-blue", "Riyadh", "SA", "New York", "US", "FedEx · Olivia Bennett", sar("795"))
           + card("EZH069906125", "Processing", "p-amber", "Riyadh", "SA", "Tokyo", "JP", "DHL · Yuki Tanaka", sar("940"))
           + card("EZH740561330", "Delivered", "p-green", "Riyadh", "SA", "London", "GB", "FedEx · James Carter", sar("690")))

    attention = (title("Shipments", "Track all your shipments")
                 + chips(["All", "Processing", "Attention", "Delivered"], active=2)
                 + '<div class="scard" style="border-left:3px solid #b91c1c">'
                 '<div class="h"><span class="trkbig">EZH069906125</span><span class="pill p-red">Customs hold</span></div>'
                 '<div style="color:var(--muted);font-size:12.5px;margin-top:9px">Awaiting an updated commercial invoice</div>'
                 '<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:11px;'
                 'border-top:1px solid var(--line)"><span style="color:var(--muted);font-size:12px">Flagged 4 h ago</span>'
                 '<span style="color:var(--brand);font-weight:700;font-size:12.5px">Fix it →</span></div></div>'
                 + '<div class="scard" style="border-left:3px solid #f59e0b">'
                 '<div class="h"><span class="trkbig">EZH441209887</span><span class="pill p-amber">Pickup failed</span></div>'
                 '<div style="color:var(--muted);font-size:12.5px;margin-top:9px">Driver could not collect — rebook a slot</div>'
                 '<div style="display:flex;justify-content:space-between;margin-top:12px;padding-top:11px;'
                 'border-top:1px solid var(--line)"><span style="color:var(--muted);font-size:12px">Yesterday</span>'
                 '<span style="color:var(--brand);font-weight:700;font-size:12.5px">Rebook →</span></div></div>')

    detail = (back("EZH977158300", "FedEx International Priority",
                   right='<span class="pill p-blue" style="margin:0">In Transit</span>')
              + '<div class="eta" style="margin-top:14px"><div><div class="k">Estimated delivery</div>'
              f'<div class="v">Tue, 19 Aug · 14:00</div></div>{svg("truck", 30, 1.7)}</div>'
              + label("Documents")
              + '<div class="listcard" style="margin-top:0">'
              + _dl("Shipping label", "PDF · 84 KB") + _dl("Commercial invoice", "PDF · 62 KB") + "</div>"
              + label("Details")
              + kvcard([("Carrier tracking", "7940 5613 3021"), ("Packages", "2 · 6.5 kg"),
                        ("Pickup", "Tue 19 Aug · 09:00–17:00"), ("Paid", sar("795.00"))])
              + label("Need something changed?")
              + navlist([("x", "Cancel shipment", "Refunded if not yet collected")]))

    tracking = ('<div class="body">'
                + back("Tracking", "EZH977158300")
                + '<div class="map"><div class="grid"></div>'
                '<div class="orig" style="left:18%;top:64%"></div>'
                '<div class="pin" style="right:24%;top:26%"></div></div>'
                + '<div class="tl" style="margin-top:16px">'
                + _step("done", "Booked with FedEx", "16 Aug · 09:41 · Riyadh")
                + _step("done", "Collected", "17 Aug · 11:20 · Riyadh")
                + _step("active", "In transit", "18 Aug · 03:55 · Dubai hub")
                + _step("todo", "Out for delivery", "Expected 19 Aug")
                + _step("todo", "Delivered", "Expected 19 Aug · 14:00")
                + "</div></div>")

    cancel = (blurred(back("EZH977158300", "FedEx International Priority"))
              + sheet('<div style="width:58px;height:58px;border-radius:19px;background:#fee2e2;color:#b91c1c;'
                      f'display:flex;align-items:center;justify-content:center;margin-bottom:16px">{svg("warn", 26, 2.2)}</div>'
                      '<div style="font-weight:800;font-size:19px;letter-spacing:-.02em">Cancel this shipment?</div>'
                      '<p style="color:var(--muted);font-size:13.5px;margin-top:8px;line-height:1.5">'
                      'The carrier booking and your pickup will both be cancelled.</p>'
                      + kvcard([("Paid", sar("795.00")), ("Cancellation fee", sar("0.00"))],
                               total=("Refund", sar("795.00")))
                      + note("Refunded to card •••• 4242 within 5–10 business days.")
                      + '<div style="background:#b91c1c;color:#fff;text-align:center;font-weight:800;font-size:15px;'
                      'padding:16px;border-radius:16px;margin-top:16px">Yes, cancel shipment</div>'
                      '<div style="text-align:center;color:var(--muted);font-size:13.5px;font-weight:700;'
                      'margin-top:14px">Keep it</div>'))

    empty = (title("Shipments", "Track all your shipments")
             + f'<div class="search">{svg("pin", 18, 1.8)}Search by ID or recipient…</div>'
             + '<div class="empty" style="padding-top:70px">'
             f'<div class="eic">{svg("box", 34, 1.6)}</div><h3>No shipments yet</h3>'
             '<p>Create your first shipment and it will<br>show up here with live tracking.</p>'
             '<div style="background:var(--brand);color:#fff;font-weight:800;font-size:14.5px;padding:14px 26px;'
             'border-radius:15px;display:inline-block;margin-top:20px;'
             'box-shadow:0 10px 20px -8px rgba(254,82,0,.6)">Create a shipment</div></div>')

    return [
        screen("list-all", lst, tab="shipments", caption="All shipments"),
        screen("list-attention", attention, tab="shipments", caption="Needs attention"),
        screen("detail", detail, cta_html=cta("Track live"), caption="Shipment detail"),
        screen("tracking", tracking, raw=True, caption="Live tracking"),
        screen("cancel-refund", cancel, raw=True, caption="Cancel &amp; refund"),
        screen("empty", empty, tab="shipments", caption="Empty state"),
    ]


def _dl(name, meta):
    return (f'<div class="docrow"><div class="docic">{svg("doc", 17)}</div>'
            f'<div><div style="font-weight:700;font-size:13.5px">{name}</div>'
            f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">{meta}</div></div>'
            f'<span style="margin-left:auto;color:var(--brand);font-weight:700;font-size:12.5px">Download</span></div>')


def _step(state, t, d):
    marker = {"done": f'<div class="marker done">{svg("check", 13, 3)}</div>',
              "active": '<div class="marker active"></div>',
              "todo": '<div class="marker todo"></div>'}[state]
    cls = " done" if state == "done" else (" todo" if state == "todo" else "")
    return (f'<div class="tstep{cls}">{marker}<div class="tc"><div class="tt">{t}</div>'
            f'<div class="td">{d}</div></div></div>')


# ═════════════════════════════════════════════════════════ 07 · QUOTATIONS ═══

def quotations():
    detail = (back("Quotation QT-2026-0044", "Prepared by your account manager")
              + label("Shipment details")
              + kvcard([("Route", "Riyadh → Dubai"), ("Service", "FedEx International Priority"),
                        ("Packages", "2 · 6.5 kg"), ("Ready", "Tue 19 Aug")])
              + label("Customs &amp; documents")
              + '<div class="listcard" style="margin-top:0">'
              + _dl("Commercial invoice", "Attached") + "</div>"
              + label("Customs declaration")
              + kvcard([("Items", "2 · 40 units"), ("Declared value", "USD 280.00"),
                        ("Incoterm", "DAP")])
              + label("Price")
              + kvcard([("Shipping", sar("620.00")), ("Discount", "−" + sar("40.00")),
                        ("VAT (15%)", sar("87.00"))], total=("Total", sar("667.00"))))

    accepted = success("green", "Quotation accepted",
                       "Your shipment is being created from this quotation.",
                       '<div class="trackbox"><div class="tk">Quotation</div>'
                       '<div class="tv">QT-2026-0044</div></div>')

    terms = (blurred(back("Quotation QT-2026-0044"))
             + sheet('<div style="font-weight:800;font-size:18px">Accept the terms</div>'
                     '<p style="color:var(--muted);font-size:13.5px;margin-top:8px;line-height:1.5">'
                     'By accepting you confirm the declared value and agree to the shipping terms.</p>'
                     + kvcard([("Total", sar("667.00"))])
                     + '<div class="toggle"><div><div style="font-weight:700;font-size:13.5px">'
                     'I accept the terms &amp; conditions</div></div><div class="sw"></div></div>'
                     '<div style="background:var(--brand);color:#fff;text-align:center;font-weight:800;'
                     'font-size:15px;padding:16px;border-radius:16px;margin-top:16px">Accept and continue</div>'))

    return [
        screen("detail", detail, cta_html=cta("Accept quotation"), caption="Quotation detail"),
        screen("accept-terms", terms, raw=True, caption="Accept terms"),
        screen("accepted", accepted, raw=True, cta_html=cta("Continue to payment"), caption="Accepted"),
    ]


# ═══════════════════════════════════════════════ 08 · ORDERS & SALES CHANNELS ═

def orders():
    channels = (title("Sales channels", "Connect your store, ship in clicks")
                + '<div class="listcard" style="margin-top:14px">'
                + _chan("lg-salla", "س", "Salla", "alrajhi.salla.sa · synced 6 min ago", "p-green", "Live")
                + _chan("lg-shopify", "S", "Shopify", "alrajhi.myshopify.com · synced 1 h ago", "p-green", "Live")
                + _chan("lg-zid", "ز", "Zid", "Token expired — reconnect", "p-red", "Action")
                + "</div>"
                + '<div class="addbtn" style="margin-top:14px">+ &nbsp;Connect a sales channel</div>')

    connect = (blurred(title("Sales channels", "Connect your store, ship in clicks"))
               + sheet('<div style="font-weight:800;font-size:18px">Connect a sales channel</div>'
                       '<p style="color:var(--muted);font-size:13.5px;margin-top:7px">Pick your platform</p>'
                       + '<div class="listcard" style="margin-top:14px">'
                       + _chan("lg-salla", "س", "Salla", "OAuth connect", "", "")
                       + _chan("lg-shopify", "S", "Shopify", "OAuth connect", "", "")
                       + _chan("lg-zid", "ز", "Zid", "API key", "", "")
                       + _chan("lg-woo", "W", "WooCommerce", "API key", "", "")
                       + "</div>"))

    detail = (back("Salla", "alrajhi.salla.sa")
              + kvcard([("Status", "Connected"), ("Orders pulled", "184"),
                        ("Last sync", "6 minutes ago"), ("Auto-sync", "Every 15 minutes")])
              + label("Recent syncs")
              + '<div class="listcard" style="margin-top:0">'
              + _sync("12 new orders", "Today 09:35", "p-green")
              + _sync("8 new orders", "Today 09:20", "p-green")
              + _sync("Rate limited — retried", "Today 09:05", "p-amber")
              + "</div>"
              + label("Danger zone")
              + navlist([("x", "Disconnect store", "Stops pulling new orders")]))

    order_list = (title("Orders", "From your connected stores")
                  + chips(["To fulfil · 12", "Fulfilled", "All"])
                  + _order("#1042", "lg-salla", "س", "Noura Alqahtani", "Jeddah · 2 items · 1.4 kg",
                           f'Rule → Naqel {sar("24")}', "Fulfil")
                  + _order("#1041", "lg-shopify", "S", "Faisal Al-Harbi", "Riyadh · 1 item · 0.6 kg",
                           f'Rule → SMSA {sar("28")}', "Fulfil")
                  + _order("#1039", "lg-shopify", "S", "Layla Mansour", "Dubai, AE · 3 items · 2.2 kg",
                           "Needs customs items", "Review", pill=True))

    fulfil = (back("Order #1042", "Salla · Noura Alqahtani")
              + label("Review order")
              + kvcard([("Recipient", "Noura Alqahtani"), ("Destination", "Jeddah, SA"),
                        ("Items", "2 · 1.4 kg"), ("Order value", sar("340.00"))])
              + label("Select carrier · rule matched Naqel")
              + rate("NQL", "lg-naqel", "Naqel Express", "1–2 days", sar("24"), selected=True, tag="RULE")
              + rate("SMSA", "lg-smsa", "SMSA Express", "Next day", sar("28"))
              + label("Payment")
              + kvcard([("Delivery", sar("20.87")), ("VAT (15%)", sar("3.13"))],
                       total=("Total", sar("24.00"))))

    rules = (back("Carrier assignment rules", "Applied automatically when fulfilling")
             + '<div class="listcard" style="margin-top:14px">'
             + _rule("Riyadh &amp; Jeddah · under 5 kg", "SMSA Express")
             + _rule("Rest of Saudi Arabia", "Naqel Express")
             + _rule("International", "Cheapest express")
             + "</div>"
             + '<div class="addbtn" style="margin-top:14px">+ &nbsp;New assignment rule</div>'
             + note("Rules run top to bottom. The first match wins."))

    new_rule = (blurred(back("Carrier assignment rules"))
                + sheet('<div style="font-weight:800;font-size:18px">New assignment rule</div>'
                        + label("When destination is")
                        + field("Riyadh", icon="chev")
                        + label("And weight is under")
                        + field("5 kg")
                        + label("Use carrier")
                        + field("SMSA Express", icon="chev")
                        + '<div style="background:var(--brand);color:#fff;text-align:center;font-weight:800;'
                        'font-size:15px;padding:16px;border-radius:16px;margin-top:18px">Save rule</div>'))

    return [
        screen("sales-channels", channels, caption="Sales channels"),
        screen("connect-channel", connect, raw=True, caption="Connect a channel"),
        screen("channel-detail", detail, caption="Channel detail"),
        screen("orders-list", order_list, cta_html=cta("Fulfil 12 orders together"), caption="Orders"),
        screen("order-fulfill", fulfil, cta_html=cta(f'Fulfil · {sar("24.00")}'), caption="Fulfil order"),
        screen("assignment-rules", rules, caption="Assignment rules"),
        screen("new-rule", new_rule, raw=True, caption="New rule"),
    ]


def _chan(cls, mark, name, sub, pill, ptxt):
    p = f'<span class="pill {pill}" style="margin:0;margin-left:auto">{ptxt}</span>' if pill else \
        '<span class="chev" style="margin-left:auto;color:#cbd5e1">›</span>'
    return (f'<div class="chan"><div class="chlogo {cls}">{mark}</div>'
            f'<div><div style="font-weight:800;font-size:14.5px">{name}</div>'
            f'<div style="color:var(--muted);font-size:12px;margin-top:2px">{sub}</div></div>{p}</div>')


def _sync(t, when, pill):
    return (f'<div class="docrow"><div><div style="font-weight:700;font-size:13.5px">{t}</div>'
            f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">{when}</div></div>'
            f'<span class="pill {pill}" style="margin:0;margin-left:auto">Done</span></div>')


def _order(num, cls, mark, who, meta, foot, action, pill=False):
    right = (f'<span class="pill p-amber" style="margin:0">{action}</span>' if pill
             else f'<span class="btnpay" style="margin:0">{action}</span>')
    return (f'<div class="ordrow"><div style="display:flex;align-items:center;justify-content:space-between">'
            f'<span style="font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:600">{num}</span>'
            f'<span class="chlogo {cls}" style="width:24px;height:24px;border-radius:7px;font-size:11px">{mark}</span></div>'
            f'<div style="font-weight:700;font-size:14px;margin-top:9px">{who}</div>'
            f'<div style="color:var(--muted);font-size:12.5px;margin-top:2px">{meta}</div>'
            f'<div style="display:flex;justify-content:space-between;align-items:center;margin-top:12px;'
            f'padding-top:11px;border-top:1px solid var(--line)">'
            f'<span style="color:var(--muted);font-size:12px">{foot}</span>{right}</div></div>')


def _rule(cond, carrier):
    return (f'<div class="docrow"><div><div style="font-weight:700;font-size:13.5px">{cond}</div>'
            f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">→ {carrier}</div></div>'
            f'<span class="chev" style="margin-left:auto;color:#cbd5e1">›</span></div>')


# ════════════════════════════════════════════════════════════ 09 · BILLING ═══

def billing():
    invoices = (title("Invoices")
                + chips(["All", "Pending", "Paid"])
                + '<div class="wallet"><div class="wk">Outstanding balance</div>'
                f'<div class="wv"><span class="cur">﷼</span>17,700<span style="font-size:18px;opacity:.6">.00</span></div>'
                '<div class="wrow"><div><div class="k">Invoices</div><div class="v">2 open</div></div>'
                '<div><div class="k">Next due</div><div class="v">22 Aug</div></div>'
                '<div><div class="k">Overdue</div><div class="v">None</div></div></div></div>'
                + '<div class="listcard" style="margin-top:14px">'
                + _inv("INV-2026-0841", "Issued 23 Jul · due 22 Aug", sar("12,480"), "p-amber", "Pending", True)
                + _inv("INV-2026-0902", "Issued 04 Aug · due 03 Sep", sar("5,220"), "p-grey", "Pending", True)
                + _inv("INV-2026-0788", "Paid 18 Jul", sar("9,140"), "p-green", "Paid", False)
                + "</div>")

    confirm_pay = (blurred(title("Invoices"))
                   + sheet('<div style="font-weight:800;font-size:18px">Confirm Payment</div>'
                           + kvcard([("Invoice", "INV-2026-0841"), ("Due", "22 Aug 2026")],
                                    total=("Amount", sar("12,480.00")))
                           + label("Pay with")
                           + _paycard("VISA", "•••• 4242", "Expires 09/28", True)
                           + '<div style="background:var(--brand);color:#fff;text-align:center;font-weight:800;'
                           f'font-size:15px;padding:16px;border-radius:16px;margin-top:16px">Pay {sar("12,480.00")}</div>'))

    credit = (back("Credit / Billing", "30-day payment terms")
              + '<div class="wallet" style="margin-top:14px"><div class="wk">Available credit</div>'
              f'<div class="wv"><span class="cur">﷼</span>42,300<span style="font-size:18px;opacity:.6">.00</span></div>'
              '<div style="height:7px;border-radius:4px;background:rgba(255,255,255,.18);margin-top:16px;'
              'overflow:hidden"><div style="width:29%;height:100%;background:var(--brand);border-radius:4px"></div></div>'
              f'<div class="wrow"><div><div class="k">Limit</div><div class="v">{sar("60,000")}</div></div>'
              f'<div><div class="k">Used</div><div class="v">{sar("17,700")}</div></div>'
              '<div><div class="k">Next due</div><div class="v">22 Aug</div></div></div></div>'
              + label("Credit Invoices")
              + '<div class="listcard" style="margin-top:0">'
              + _inv("INV-2026-0841", "Due 22 Aug", sar("12,480"), "p-amber", "5 days", False)
              + _inv("INV-2026-0902", "Due 03 Sep", sar("5,220"), "p-grey", "17 days", False)
              + "</div>"
              + note("Late invoices pause pay-later on new shipments until settled."))

    credit_detail = (back("Credit Invoice Details", "INV-2026-0841")
                     + kvcard([("Issued", "23 Jul 2026"), ("Due", "22 Aug 2026"),
                               ("Terms", "Net 30"), ("Shipments", "9")])
                     + label("Shipments on this invoice")
                     + '<div class="listcard" style="margin-top:0">'
                     + _invline("EZH977158300", "Riyadh → New York", sar("795.00"))
                     + _invline("EZH069906125", "Riyadh → Tokyo", sar("940.00"))
                     + _invline("EZH740561330", "Riyadh → London", sar("690.00"))
                     + "</div>"
                     + kvcard([("Subtotal", sar("10,852.00")), ("VAT (15%)", sar("1,628.00"))],
                              total=("Total", sar("12,480.00"))))

    request_credit = (blurred(back("Credit / Billing"))
                      + sheet('<div style="font-weight:800;font-size:18px">Request Credit Access</div>'
                              '<p style="color:var(--muted);font-size:13.5px;margin-top:8px;line-height:1.5">'
                              'Tell us roughly what you ship each month and we\'ll review your account.</p>'
                              + label("Reason")
                              + '<div class="inp2" style="height:84px;align-items:flex-start;padding-top:13px">'
                              '<span class="ph">Monthly volume, payment terms needed…</span></div>'
                              '<div style="background:var(--brand);color:#fff;text-align:center;font-weight:800;'
                              'font-size:15px;padding:16px;border-radius:16px;margin-top:18px">Send request</div>'))

    payments = (title("Payments")
                + label("Account Snapshot")
                + kvcard([("Billed (6 months)", sar("148,220")), ("Paid", sar("130,520")),
                          ("Outstanding", sar("17,700"))])
                + label("Billed vs Paid (Last 6 Months)")
                + '<div class="scard" style="margin-top:0;padding:16px 15px">'
                '<div style="display:flex;align-items:flex-end;gap:8px;height:88px">'
                + "".join(f'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:5px">'
                          f'<div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:70px">'
                          f'<div style="flex:1;height:{a}px;background:rgba(254,82,0,.25);border-radius:4px 4px 0 0"></div>'
                          f'<div style="flex:1;height:{b}px;background:var(--brand);border-radius:4px 4px 0 0"></div></div>'
                          f'<span style="font-size:10px;color:var(--muted);font-weight:600">{m}</span></div>'
                          for a, b, m in [(40, 34, "Mar"), (56, 52, "Apr"), (48, 44, "May"),
                                          (66, 60, "Jun"), (58, 50, "Jul"), (70, 44, "Aug")])
                + "</div></div>"
                + label("Extra Fee Notices")
                + '<div class="listcard" style="margin-top:0">'
                + _inv("Remote area surcharge", "EZH069906125 · 12 Aug", sar("85.00"), "p-amber", "New", False)
                + "</div>"
                + label("Payment Transactions")
                + '<div class="listcard" style="margin-top:0">'
                + _inv("Shipment EZH977158300", "16 Aug · card •••• 4242", sar("795.00"), "p-green", "Paid", False)
                + _inv("Refund EZH069906125", "12 Aug · to •••• 4242", "−" + sar("940.00"), "p-blue", "Refunded", False)
                + "</div>")

    saved_cards = (back("Saved cards", "Secured by Tap")
                   + _paycard("VISA", "•••• 4242", "Default · expires 09/28", True)
                   + _paycard("MC", "•••• 8871", "Expires 03/27", False)
                   + '<div class="addbtn" style="margin-top:14px">+ &nbsp;Add a card</div>'
                   + note("Card details never touch our servers — Tap stores them."))

    return [
        screen("invoices", invoices, tab="invoices", caption="Invoices"),
        screen("confirm-payment", confirm_pay, raw=True, caption="Confirm Payment"),
        screen("credit-billing", credit, cta_html=cta(f'Pay {sar("12,480.00")}'), caption="Credit / Billing"),
        screen("credit-invoice-detail", credit_detail, cta_html=cta("Pay this invoice"), caption="Credit invoice"),
        screen("request-credit", request_credit, raw=True, caption="Request credit"),
        screen("payments", payments, tab="invoices", caption="Payments"),
        screen("saved-cards", saved_cards, caption="Saved cards"),
    ]


def _inv(num, sub, amt, pill, ptxt, pay):
    action = f'<span class="btnpay">Pay now</span>' if pay else \
             f'<span class="pill {pill}" style="margin-top:4px">{ptxt}</span>'
    return (f'<div class="inv"><div><div class="num">{num}<span class="trk">{sub}</span></div></div>'
            f'<div class="rt"><div style="font-weight:800;font-size:14px">{amt}</div>{action}</div></div>')


def _invline(trk, route, amt):
    return (f'<div class="docrow"><div><div style="font-weight:700;font-size:13px;'
            f'font-family:ui-monospace,Menlo,monospace">{trk}</div>'
            f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">{route}</div></div>'
            f'<span style="margin-left:auto;font-weight:700;font-size:13px">{amt}</span></div>')


# ════════════════════════════════════════════════════════════ 10 · ACCOUNT ═══

def account():
    profile = ('<h1 class="page" style="margin-top:6px">Account Settings</h1>'
               + '<div class="scard" style="margin-top:12px;display:flex;align-items:center;gap:14px">'
               '<div class="avatar" style="width:54px;height:54px;border-radius:18px;font-size:20px">RS</div>'
               '<div><div style="font-weight:800;font-size:16px">Razan Sameh</div>'
               '<div style="color:var(--muted);font-size:12.5px;margin-top:2px">Al Rajhi Trading · EZ0002</div>'
               '<span class="tier" style="margin-top:8px">Pricing Tier <b>VIP</b></span></div></div>'
               + label("Account")
               + navlist([
                   ("user", "Profile Information", "Name, email, phone"),
                   ("store", "Account Details", "Company, CR, VAT number"),
                   ("pin", "Default Shipping Address", "King Fahd Rd, Riyadh"),
                   ("globe", "Billing Currency", "SAR — Saudi Riyal"),
               ])
               + label("Security")
               + navlist([
                   ("lock", "Change Password", "Last changed 3 months ago"),
                   ("shield", "Signed-in devices", "3 devices"),
               ])
               + label("Preferences")
               + navlist([
                   ("globe", "Language", "English", '<span style="margin-left:auto;color:var(--muted);font-size:13px;font-weight:600">العربية ›</span>'),
                   ("bell", "Notifications", "Push, email"),
               ]))

    company = (back("Account Details", "Company information")
               + label("Company")
               + field("Al Rajhi Trading") + '<div style="height:10px"></div>'
               + field("شركة الراجحي للتجارة")
               + label("Registration")
               + field("CR 1010123456") + '<div style="height:10px"></div>'
               + field("VAT 300012345600003")
               + label("Default Shipping Address")
               + field("King Fahd Rd, Al Olaya") + '<div style="height:10px"></div>'
               + row2(field("Riyadh"), field("12333"))
               + note("Arabic fields print on customs paperwork and invoices."))

    currency = (back("Billing Currency", "Display and charge currency")
                + '<div class="listcard" style="margin-top:14px">'
                + _cur("SAR", "Saudi Riyal", True) + _cur("USD", "US Dollar", False)
                + "</div>"
                + note("SAR is always the accounting currency. Other currencies are converted "
                       "at checkout using the rate shown at the time."))

    users_list = (back("Team Members (4)", "Primary contact only")
                  + '<div class="listcard" style="margin-top:14px">'
                  + _user("RS", "Razan Sameh", "razan@alrajhi-trading.com", "p-purple", "Primary", True)
                  + _user("HK", "Huda Khaled", "All permissions", "", "")
                  + _user("OM", "Omar Nasser", "View only", "", "")
                  + _user("SA", "Sara Alami", "Invite pending", "p-amber", "Invited")
                  + "</div>"
                  + '<div class="addbtn" style="margin-top:14px">+ &nbsp;Add Team Member</div>')

    add_user = (blurred(back("Team Members (4)"))
                + sheet('<div style="font-weight:800;font-size:18px">Add Team Member</div>'
                        + label("Details")
                        + field("Full name", placeholder=True) + '<div style="height:10px"></div>'
                        + field("Email address", placeholder=True)
                        + label("Permissions")
                        + '<div class="scard" style="margin-top:0;padding:4px 15px">'
                        + _perm("View shipments", True) + _perm("Create shipments", False)
                        + _perm("View invoices", True) + _perm("View payments", False)
                        + "</div>"
                        '<div style="background:var(--brand);color:#fff;text-align:center;font-weight:800;'
                        'font-size:15px;padding:16px;border-radius:16px;margin-top:16px">Send invite</div>'))

    edit_perms = (back("Edit Permissions", "Omar Nasser")
                  + '<div class="scard" style="margin-top:14px;padding:4px 15px">'
                  + _perm("View shipments", True) + _perm("Create shipments", False)
                  + _perm("View invoices", True) + _perm("View payments", False)
                  + _perm("Make payments", False) + _perm("Manage users", False)
                  + "</div>"
                  + note("The primary contact always has every permission and can't be limited.")
                  + label("Danger zone")
                  + navlist([("x", "Remove Team Member", "Revokes access immediately")]))

    devices = (back("Signed-in devices", "Sign out anywhere you don't recognise")
               + '<div class="listcard" style="margin-top:14px">'
               + _dev("iPhone 15 Pro", "This device · Riyadh · now", True)
               + _dev("iPad Air", "Riyadh · 2 days ago", False)
               + _dev("Chrome on macOS", "Jeddah · 1 week ago", False)
               + "</div>"
               + note("Changing your password signs out every device except this one."))

    quick = (title("Quick Quote", "An estimate — nothing is booked")
             + chips(["Express", "Local Delivery", "Freight"])
             + label("Route")
             + field("Saudi Arabia · Riyadh", icon="chev", flag="🇸🇦")
             + '<div style="height:10px"></div>'
             + field("United Kingdom · London", icon="chev", flag="🇬🇧")
             + label("Shipment")
             + row2(field("3.0 kg"), field("1 piece"))
             + label("Estimated")
             + rate("FedEx", "lg-fedex", "International Priority", "2–3 business days", sar("612"))
             + rate("DHL", "lg-dhl", "Express Worldwide", "3 business days", sar("578"))
             + note("Final price depends on the exact address, dimensions and customs value.",
                    tone="grey"))

    return [
        screen("settings", profile, tab="profile", caption="Account Settings"),
        screen("company-details", company, cta_html=cta("Save changes"), caption="Account Details"),
        screen("billing-currency", currency, cta_html=cta("Save"), caption="Billing Currency"),
        screen("team-members", users_list, caption="Team Members"),
        screen("add-team-member", add_user, raw=True, caption="Add Team Member"),
        screen("edit-permissions", edit_perms, cta_html=cta("Save permissions"), caption="Edit Permissions"),
        screen("devices", devices, caption="Signed-in devices"),
        screen("quick-quote", quick, cta_html=cta("Book this shipment"), caption="Quick Quote"),
    ]


def _cur(code, name, on):
    return (f'<div class="docrow"><div><div style="font-weight:800;font-size:14px">{code}</div>'
            f'<div style="color:var(--muted);font-size:12px;margin-top:2px">{name}</div></div>'
            f'<div class="radio{" on" if on else ""}" style="margin-left:auto"></div></div>')


def _user(initials, name, sub, pill, ptxt, primary=False):
    right = (f'<span class="pill {pill}" style="margin:0;margin-left:auto">{ptxt}</span>' if pill
             else '<span class="chev" style="margin-left:auto;color:#cbd5e1">›</span>')
    cls = "uav pri" if primary else "uav"
    return (f'<div class="userrow"><div class="{cls}">{initials}</div>'
            f'<div><div style="font-weight:700;font-size:14px">{name}</div>'
            f'<div style="color:var(--muted);font-size:12px;margin-top:2px">{sub}</div></div>{right}</div>')


def _perm(name, on):
    return (f'<div class="permrow"><span class="pn">{name}</span>'
            f'<span class="sw{"" if on else " off"}" style="transform:scale(.85)"></span></div>')


def _dev(name, meta, current):
    right = ('<span class="pill p-green" style="margin:0;margin-left:auto">Current</span>' if current
             else '<span style="margin-left:auto;color:#b91c1c;font-weight:700;font-size:12.5px">Sign out</span>')
    return (f'<div class="docrow"><div class="docic">{svg("lock", 17)}</div>'
            f'<div><div style="font-weight:700;font-size:13.5px">{name}</div>'
            f'<div style="color:var(--muted);font-size:11.5px;margin-top:2px">{meta}</div></div>{right}</div>')
