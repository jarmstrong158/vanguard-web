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
COLS, ROWS = 2, 4                  # 8 labels per sheet (2 across, 4 down)

# Fixed label size: 3.5 in wide x 2 in tall
LABEL_W = 3.5 * inch
LABEL_H = 2.0 * inch
COL_GAP = 0.25 * inch              # gap between the two columns
ROW_GAP = 0.20 * inch              # gap between rows
PAD = 0.12 * inch                  # inner padding inside each label

# Center the whole grid of labels on the page
MARGIN_X = (PAGE_W - (COLS * LABEL_W + (COLS - 1) * COL_GAP)) / 2
MARGIN_TOP = (PAGE_H - (ROWS * LABEL_H + (ROWS - 1) * ROW_GAP)) / 2

# ---- Fonts ------------------------------------------------------------------
SKU_FONT = "Helvetica-Bold"
SKU_MAX_SIZE = 22          # SKU starts big...
SKU_MIN_SIZE = 8           # ...and auto-shrinks until it fits one line
DESC_FONT, DESC_SIZE = "Helvetica", 6.5   # "very small" per request
DESC_MAX_LINES = 2
BIN_FONT, BIN_SIZE = "Helvetica-Bold", 10
BAR_HEIGHT = 0.42 * inch
BAR_WIDTH = 0.012 * inch
BLOCK_GAP = 5              # vertical gap between SKU / desc / bin / barcode


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


def fit_sku_size(sku, max_width):
    """Largest SKU font size (within bounds) that fits on one line."""
    size = SKU_MAX_SIZE
    while size > SKU_MIN_SIZE and stringWidth(sku, SKU_FONT, size) > max_width:
        size -= 0.5
    return size


def draw_label(c, x, y, item):
    """Draw one label, with every element centered horizontally and the whole
    stack centered vertically inside the label cell."""
    inner_w = LABEL_W - 2 * PAD
    cx = x + LABEL_W / 2

    # --- size each element up front so we can center the stack vertically ---
    sku_size = fit_sku_size(item["sku"], inner_w)
    desc_lines = fit_lines(item["desc"], DESC_FONT, DESC_SIZE, inner_w,
                           DESC_MAX_LINES)
    bin_text = f"BIN: {item['bin']}" if item["bin"] else None

    bar = code39.Standard39(item["sku"], barHeight=BAR_HEIGHT,
                            barWidth=BAR_WIDTH, humanReadable=True,
                            checksum=False, quiet=False)
    bar_scale = min(1.0, inner_w / bar.width)
    bar_w = bar.width * bar_scale
    bar_bars_h = bar.barHeight * bar_scale
    bar_text_h = (bar.fontSize + 2) * bar_scale       # human-readable text below
    bar_block_h = bar_bars_h + bar_text_h

    # heights of each block (in draw order)
    blocks = [("sku", sku_size)]
    if desc_lines:
        blocks.append(("desc", len(desc_lines) * (DESC_SIZE + 1)))
    if bin_text:
        blocks.append(("bin", BIN_SIZE))
    blocks.append(("bar", bar_block_h))

    total_h = sum(h for _, h in blocks) + BLOCK_GAP * (len(blocks) - 1)
    cursor = y + LABEL_H / 2 + total_h / 2            # top of the stack

    for kind, h in blocks:
        if kind == "sku":
            c.setFont(SKU_FONT, sku_size)
            c.drawCentredString(cx, cursor - sku_size, item["sku"])
        elif kind == "desc":
            c.setFont(DESC_FONT, DESC_SIZE)
            ty = cursor
            for line in desc_lines:
                ty -= (DESC_SIZE + 1)
                c.drawCentredString(cx, ty, line)
        elif kind == "bin":
            c.setFont(BIN_FONT, BIN_SIZE)
            c.drawCentredString(cx, cursor - BIN_SIZE, bin_text)
        elif kind == "bar":
            c.saveState()
            # bars top sits at `cursor`; text renders below the bars
            c.translate(cx - bar_w / 2, cursor - bar_bars_h)
            c.scale(bar_scale, bar_scale)
            bar.drawOn(c, 0, 0)
            c.restoreState()
        cursor -= (h + BLOCK_GAP)

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
