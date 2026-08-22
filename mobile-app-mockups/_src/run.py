#!/usr/bin/env python3
"""Renders every client flow. Usage: python3 _src/run.py [--no-png]"""
import sys, shutil
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from build import write_flow, ROOT
import screens

FLOWS = [
    ("01-auth",            "Authentication",        screens.auth),
    ("02-dashboard",       "Dashboard",             screens.dashboard),
    ("03-create-express",  "Create express shipment", screens.create_express),
    ("04-create-local",    "Create local delivery", screens.create_local),
    ("05-create-freight",  "Door to door freight",  screens.create_ddp),
    ("06-shipments",       "Shipments & tracking",  screens.shipments),
    ("07-quotations",      "Quotations",            screens.quotations),
    ("08-orders",          "Orders & sales channels", screens.orders),
    ("09-billing",         "Billing & payments",    screens.billing),
    ("10-account",         "Account & team",        screens.account),
]

def main():
    no_png = "--no-png" in sys.argv
    total = 0
    print("Building client mockups…")
    for folder, title, fn in FLOWS:
        scr = fn()
        total += len(scr)
        write_flow(folder, title, scr, no_png=no_png)
    print(f"\n  {total} screens across {len(FLOWS)} flows → {ROOT/'client'}")

if __name__ == "__main__":
    main()
