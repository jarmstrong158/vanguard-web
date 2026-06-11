# Label Maker

Generate a print-ready PDF of Avery labels from a simple pick-list in Excel.
Each label shows the **SKU**, a small **description** (auto looked-up, truncated
to fit), the **BIN** you type in, and a scannable **Code 39 barcode** of the SKU
— matching the `Picking_Labels` format.

- **8 labels per 8.5×11 sheet** (2 columns × 4 rows).
- Descriptions come from the master barcoding reference (~2,100 SKUs), so you
  never retype them.
- **One updater keeps the SKU list current** from your newest local master
  barcoding file (see below).
- No barcode font to install — real Code 39 barcodes are drawn by `reportlab`.

## Two simple steps

| Run this... | ...when |
|-------------|---------|
| **`update_labels.py`** | New codes were added to the master (refreshes the drop-down + descriptions). Only when the master changes. |
| **`make_labels.py`** | You're ready to print (builds the PDF from the SKUs you picked). |

So the everyday flow is: **update → pick in Excel → print.**

## Files

| File | What it is |
|------|------------|
| `Barcoding_Label_Maker.xlsx` | The workbook you use. **Print Labels** input tab + a **Reference** tab. |
| `make_labels.py` | Reads your picks and writes `labels_to_print.pdf`. Self-installs what it needs. |
| `update_labels.py` | Refreshes the SKU drop-down + descriptions from your newest local master. |
| `build_workbook.py` | *(maintainer)* Creates the workbook from scratch from a master file. |
| `requirements.txt` | Python packages used (`openpyxl`, `reportlab`) — installed automatically. |
| `Make Labels.bat` | *(optional)* Windows double-click shortcut for `make_labels.py`. |

## One-time setup

1. Install [Python 3](https://www.python.org/downloads/) (check **"Add Python to PATH"**).

That's the only setup. The first time each script runs it auto-installs the
packages it needs — needs internet that one time.

## Keeping the SKU list up to date

When new codes are added to the master barcoding workbook (the file that gets
emailed around and saved on each PC):

1. Save the latest master somewhere normal (e.g. **Downloads**).
2. Run **`update_labels.py`** — double-click it, or `python update_labels.py`.
   It finds the newest local master, refreshes `Barcoding_Label_Maker.xlsx`, and
   reports what changed (e.g. `+3 new, -1 removed`). Your picks, bins, and
   formatting are left untouched.

Notes:
- It looks for an `.xlsx` whose name contains "barcod" (and otherwise looks like
  the master) in the script folder, Downloads, Desktop, Documents, and OneDrive,
  and picks the most recently modified one. The location is remembered in
  `master_location.txt`.
- If `Barcoding_Label_Maker.xlsx` is **open in Excel**, close it first — the file
  is locked while open. The original is never modified on a failed update.
- To point at a specific master: `python update_labels.py --master "C:\path\to\Barcoding.xlsx"`.

## Everyday use (printing)

1. Open **`Barcoding_Label_Maker.xlsx`** and go to the **Print Labels** tab.
2. In each of the 8 rows:
   - **SKU** — pick from the drop-down (only valid SKUs are allowed). The
     **Description** auto-fills next to it.
   - **Bin #** and **Letter** — type them in (e.g. `360` and `D` → `BIN: 360-D`).
   - Leave a row blank to skip it (fewer than 8 labels is fine).
3. **Save** the workbook.
4. Run **`make_labels.py`** — double-click it, or run `python make_labels.py`.
5. `labels_to_print.pdf` is created and opens — print it on your Avery sheet.

> Tip: print at **100% / Actual Size** (not "Fit to page") so the labels line up
> with the Avery stock.

## Adjusting the layout

If your label stock isn't quite 2×4, open `make_labels.py` and edit the geometry
constants near the top (`COLS`, `ROWS`, margins, gaps). The thin guide boxes
around each label can be removed by deleting the `c.rect(...)` line in
`draw_label` once you've dialed in the alignment.

## Sharing with coworkers

Email these three files (Gmail allows `.py` and `.xlsx`): **`Barcoding_Label_Maker.xlsx`**,
**`make_labels.py`**, and **`update_labels.py`**. Each coworker just needs
**Python 3** installed — the scripts install what they need on first run. No
`.bat` required.

## Rebuilding from scratch (maintainer only)

`update_labels.py` handles normal SKU changes. If you ever need to recreate the
workbook from scratch (e.g. starting over), build it from a master file:

```
python build_workbook.py --source "Barcoding_121825.xlsx" --out "Barcoding_Label_Maker.xlsx"
```

(`--source` is your master workbook; it reads the hidden **List** / **Reference**
tabs.)
