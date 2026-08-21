# CBRS/C-band Adjacent Channel Measurements

This folder contains a standalone interactive dashboard for studying adjacent-channel effects between:

- n48 CBRS measurements, identified by collection names beginning with `C_`
- Verizon n77 C-band measurements, identified by collection names beginning with `V_`

The source measurements were collected with QualiPoc and are stored in three CSV files in the repository's `_data` folder:

- `nr_radio.csv`
- `nr_pdsch.csv`
- `nr_pusch.csv`

The dashboard does not read these CSVs at runtime. `data.js` contains a preprocessed copy of the measurements required by the dashboard, so the hosted page is entirely static.

## Experiment design

Measurements were collected at three locations using two n48 TDD configurations:

| Collections | Location | n48 configuration |
|---|---|---|
| `004–012` | A | A |
| `013–021` | B | A |
| `022–030` | C | A |
| `049–057` | A | B |
| `058–066` | B | B |
| `067–075` | C | B |

Every range contains nine experiments in this fixed order:

| Offset | n48 operation | n77 operation |
|---:|---|---|
| 0 | UL | idle |
| 1 | DL | idle |
| 2 | idle | UL |
| 3 | idle | DL |
| 4 | DL | UL |
| 5 | UL | DL |
| 6 | DL | DL |
| 7 | UL | UL |
| 8 | idle | idle |

For example, collection range `049–057` represents Location A with n48 Config B. Within that range, `049` is n48 UL with n77 idle, while `057` is idle on both systems.

## Filtering rules

- n48 data uses the corresponding `C_XXX` collection without a frequency filter.
- n77 data uses the corresponding `V_XXX` collection.
- All n77 rows are restricted to `Cell Type == "MCG PCell"` during preprocessing.
- The n77 MCG PCell rule is applied to Radio, PDSCH, and PUSCH data.
- Invalid timestamps and nonnumeric measurement values are excluded for the affected parameter.

## Available parameters

### Radio

- `SS-RSRP`
- `SS-RSRQ`
- `SS-SINR`

### PDSCH

- `5G NR Net PDSCH Throughput`, converted to Mbps by dividing by `1e3`
- `PDSCH BLER`
- `PDSCH Avg RBs per Slot`
- `PDSCH RBs`, displayed in thousands
- `MCS`, displayed as PDSCH MCS
- `Avg PDSCH Code Rate`

### PUSCH

- `5G NR Net PUSCH Throughput`, converted to Mbps by dividing by `1e3`
- `PUSCH Avg RBs per Slot`
- `PUSCH RBs`, displayed in thousands
- `MCS`, displayed as PUSCH MCS
- `PUSCH Tx Power`
- `DL Pathloss`

## Dashboard behavior

The left control panel selects the location, n48 TDD configuration, parameter, and individual n48/n77 operation measurements. Each checkbox selects one curve; the paired columns reflect the two systems' operations during the same experiment.

The dashboard contains two linked plots:

1. **Empirical CDF:** calculated from samples inside the current time window. Its legend reports the median and number of samples for each curve.
2. **Time domain:** displays each collection using elapsed time from the beginning of that collection. Measurements are approximately 150 seconds long.

The highlighted time-domain window controls the CDF. Drag the middle of the window to move it, drag either edge to change its width, or use **Reset window** to restore the full interval. This makes it possible to exclude erroneous portions of a DL or UL test before comparing distributions.

Selected curves cycle through five distinguishable colors. n77 curves are also dashed to help distinguish them from n48 curves when colors repeat.

## Files required for hosting

Only these files are needed to run the published dashboard:

- `index.html`
- `app.js`
- `styles.css`
- `data.js`

`README.md` documents the project. `build_data.py` is a local utility and is not required by the hosted page.

## Running locally

Open `index.html` directly in a browser. No web server, package installation, or internet connection is required.

## Rebuilding `data.js`

Run the following command from this folder using a Python environment with pandas installed:

```bash
python build_data.py
```

The script expects the original CSVs at the repository-level `_data` directory and rewrites `data.js`. Rebuilding is only necessary when the source CSVs or preprocessing rules change.

## GitHub Pages

The intended repository is:

```text
https://github.com/ndghoshlab/2026-ndCbrsCbandInterference
```

Publish GitHub Pages from the `main` branch and `/(root)`. Because the dashboard is inside a directory beginning with an underscore (`_ai`), keep an empty `.nojekyll` file at the repository root.

The published dashboard URL is expected to be:

```text
https://ndghoshlab.github.io/2026-ndCbrsCbandInterference/_ai/html_1v1.0.0/
```
