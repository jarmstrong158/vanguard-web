# Label Maker

Generate a print-ready PDF of Avery labels from a simple pick-list in Excel.
Each label shows the **SKU**, a small **description** (auto looked-up, truncated
to fit), the **BIN** you type in, and a scannable **Code 39 barcode** of the SKU
— matching the `Picking_Labels` format.

- **8 labels per 8.5×11 sheet** (2 columns × 4 rows).
- Descriptions come from the master barcoding reference (~2,100 SKUs), so you
  never retype them.
- No barcode font to install — real Code 39 barcodes are drawn by `reportlab`.

## Files

| File | What it is |
|------|------------|
| `Barcoding_Label_Maker.xlsx` | The workbook you use. Has a **Print Labels** input tab + a **Reference** tab. |
| `make_labels.py` | Reads the input tab and writes `labels_to_print.pdf`. Self-installs what it needs. |
| `build_workbook.py` | Rebuilds `Barcoding_Label_Maker.xlsx` when the master SKU list changes. |
| `requirements.txt` | Python packages used (`openpyxl`, `reportlab`) — installed automatically. |
| `Make Labels.bat` | *(optional)* Windows double-click shortcut. Not required — you can run `make_labels.py` directly. |

## Sharing with coworkers

Only two files are needed: **`make_labels.py`** and **`Barcoding_Label_Maker.xlsx`**.
Both can be emailed (Gmail allows `.py` and `.xlsx`). Each coworker just needs
**Python 3** installed — the script installs `openpyxl`/`reportlab` itself on the
first run. No `.bat` to send.

## One-time setup

1. Install [Python 3](https://www.python.org/downloads/) (check **"Add Python to PATH"**).

That's the only setup. The first time `make_labels.py` runs, it auto-installs the
two packages it needs (`openpyxl`, `reportlab`) — needs internet that one time.

## Everyday use

1. Open **`Barcoding_Label_Maker.xlsx`** and go to the **Print Labels** tab.
2. In each of the 8 rows:
   - **SKU** — pick from the drop-down (only valid SKUs from the reference are
     allowed). The **Description** auto-fills next to it.
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

## Updating the SKU list

When the master barcoding workbook gets new SKUs, rebuild the file:

```
python build_workbook.py --source "Barcoding_121825.xlsx" --out "Barcoding_Label_Maker.xlsx"
```

(`--source` is your master workbook; it reads the hidden **List** / **Reference**
tabs.)
