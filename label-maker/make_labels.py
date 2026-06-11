"""
make_labels.py
--------------
Reads the "Print Labels" tab of the label-maker workbook and produces a
print-ready PDF of Avery labels (8 per 8.5x11 sheet, 2 columns x 4 rows).

Each label shows:
    * the SKU (bold)
    * a small, auto-truncated description (looked up from the Reference tab)
    * "BIN: <#>-<letter>" if a bin was entered
    * a scannable Code 39 barcode of the SKU (with the SKU printed under it)

Usage:
    python make_labels.py
    python make_labels.py --xlsx Barcoding_Label_Maker.xlsx --out labels_to_print.pdf

No barcode font needs to be installed -- reportlab draws real Code 39 barcodes.
"""
import argparse
import warnings

import openpyxl
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.graphics.barcode import code39
from reportlab.pdfgen import canvas

warnings.filterwarnings("ignore")

# ---- Avery sheet geometry (tweak here to match your exact label stock) ------
PAGE_W, PAGE_H = letter            # 8.5 x 11 in points (612 x 792)
COLS, ROWS = 2, 4                  # 8 labels per sheet
MARGIN_X = 0.25 * inch             # left/right page margin
MARGIN_TOP = 0.5 * inch            # top page margin
MARGIN_BOTTOM = 0.5 * inch         # bottom page margin
COL_GAP = 0.20 * inch              # gap between the two columns
ROW_GAP = 0.10 * inch              # gap between rows
PAD = 0.12 * inch                  # inner padding inside each label

LABEL_W = (PAGE_W - 2 * MARGIN_X - (COLS - 1) * COL_GAP) / COLS
LABEL_H = (PAGE_H - MARGIN_TOP - MARGIN_BOTTOM - (ROWS - 1) * ROW_GAP) / ROWS

# ---- Fonts ------------------------------------------------------------------
SKU_FONT, SKU_SIZE = "Helvetica-Bold", 12
DESC_FONT, DESC_SIZE = "Helvetica", 6.5   # "very small" per request
DESC_MAX_LINES = 2
BIN_FONT, BIN_SIZE = "Helvetica-Bold", 9


def read_rows(xlsx_path):
    """Return a list of dicts {sku, desc, bin} from the Print Labels tab."""
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    if "Print Labels" not in wb.sheetnames:
        raise SystemExit(f"'Print Labels' tab not found in {xlsx_path}")
    ws = wb["Print Labels"]

    # SKU -> description lookup from the Reference tab (description may not be
    # cached if Excel hasn't recalculated the VLOOKUP, so look it up directly).
    desc_by_sku = {}
    if "Reference" in wb.sheetnames:
        for row in wb["Reference"].iter_rows(min_row=2, values_only=True):
            if row and row[0]:
                desc_by_sku[str(row[0]).strip()] = str(row[1] or "").strip()

    rows = []
    for r in range(5, 5 + COLS * ROWS):     # input rows B5:B12
        sku = ws.cell(r, 2).value
        if not sku:
            continue
        sku = str(sku).strip()
        bin_no = ws.cell(r, 3).value
        bin_letter = ws.cell(r, 4).value
        bin_parts = [str(p).strip() for p in (bin_no, bin_letter)
                     if p not in (None, "")]
        bin_str = "-".join(bin_parts)
        # prefer the live lookup; fall back to whatever Excel cached in col E
        desc = desc_by_sku.get(sku)
        if desc is None:
            desc = str(ws.cell(r, 5).value or "").strip()
        rows.append({"sku": sku, "desc": desc, "bin": bin_str})
    return rows


def fit_lines(text, font, size, max_width, max_lines):
    """Word-wrap text to at most max_lines, truncating the last line with an
    ellipsis if it still doesn't fit ("cut short" per request)."""
    if not text:
        return []
    words = text.split()
    lines, cur = [], ""
    for w in words:
        trial = (cur + " " + w).strip()
        if stringWidth(trial, font, size) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
            if len(lines) == max_lines:
                break
    if len(lines) < max_lines and cur:
        lines.append(cur)

    # If we ran out of lines but still have text, truncate the final line.
    used = " ".join(lines)
    if used.strip() != text.strip() and lines:
        last = lines[-1]
        while last and stringWidth(last + "…", font, size) > max_width:
            last = last[:-1]
        lines[-1] = (last + "…") if last else "…"
    return lines


def draw_label(c, x, y, item):
    """Draw one label with its lower-left corner at (x, y)."""
    inner_w = LABEL_W - 2 * PAD
    cursor_y = y + LABEL_H - PAD

    # SKU (top)
    cursor_y -= SKU_SIZE
    c.setFont(SKU_FONT, SKU_SIZE)
    c.drawString(x + PAD, cursor_y, item["sku"])

    # BIN (right-aligned on the SKU line, if present)
    if item["bin"]:
        c.setFont(BIN_FONT, BIN_SIZE)
        c.drawRightString(x + LABEL_W - PAD, cursor_y, f"BIN: {item['bin']}")

    # Description (small, truncated)
    cursor_y -= 3
    c.setFont(DESC_FONT, DESC_SIZE)
    for line in fit_lines(item["desc"], DESC_FONT, DESC_SIZE, inner_w,
                          DESC_MAX_LINES):
        cursor_y -= (DESC_SIZE + 1)
        c.drawString(x + PAD, cursor_y, line)

    # Barcode (bottom, centered, scaled to fit the label width)
    bar = code39.Standard39(item["sku"], barHeight=0.45 * inch,
                            barWidth=0.012 * inch, humanReadable=True,
                            checksum=False, quiet=False)
    scale = min(1.0, inner_w / bar.width)
    bw = bar.width * scale
    c.saveState()
    c.translate(x + (LABEL_W - bw) / 2, y + PAD)
    c.scale(scale, scale)
    bar.drawOn(c, 0, 0)
    c.restoreState()

    # thin guide border (comment out if your label stock is pre-cut)
    c.setLineWidth(0.25)
    c.rect(x, y, LABEL_W, LABEL_H)


def build_pdf(rows, out_path):
    c = canvas.Canvas(out_path, pagesize=letter)
    if not rows:
        c.setFont("Helvetica", 12)
        c.drawString(inch, PAGE_H - inch,
                     "No SKUs selected on the 'Print Labels' tab.")
    for i, item in enumerate(rows):
        slot = i % (COLS * ROWS)
        if i and slot == 0:
            c.showPage()
        col = slot % COLS
        row = slot // COLS
        x = MARGIN_X + col * (LABEL_W + COL_GAP)
        # rows fill top-to-bottom
        y = PAGE_H - MARGIN_TOP - (row + 1) * LABEL_H - row * ROW_GAP
        draw_label(c, x, y, item)
    c.showPage()
    c.save()


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--xlsx", default="Barcoding_Label_Maker.xlsx")
    ap.add_argument("--out", default="labels_to_print.pdf")
    args = ap.parse_args()

    rows = read_rows(args.xlsx)
    print(f"{len(rows)} label(s) selected:")
    for it in rows:
        print(f"  {it['sku']:<24} BIN {it['bin'] or '-':<8} {it['desc'][:40]}")
    build_pdf(rows, args.out)
    print(f"Wrote {args.out}")
