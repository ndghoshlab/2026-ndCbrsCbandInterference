# CBRS/C-band Adjacent Channel Measurements

This folder contains a standalone interactive dashboard for studying adjacent-channel effects between:

- n48 CBRS measurements, identified by collection names beginning with `C_`
- Verizon n77 C-band measurements, identified by collection names beginning with `V_`

The source measurements were collected with QualiPoc and are stored in three CSV files in the repository's `_data` folder:

- `nr_radio.csv`
- `nr_pdsch.csv`
- `nr_pusch.csv`

Spectrum-analyzer CSVs are stored in `_data/specan` for Set B collections `076–111`. The dashboard does not read any CSV at runtime. `data.js` contains the required QualiPoc measurements and `spectrum-data.js` contains precomputed spectrum statistics and band-power samples, so the hosted page is entirely static.

## Experiment design

Measurements are organized into two sets. Set A contains the original measurements at all three locations. Set B contains the newer repeat measurements at Locations B and C; Location A is unavailable and disabled in the dashboard when Set B is selected.

| Set | Collections | Location | n48 configuration |
|---|---|---|---|
| A | `004–012` | A | A |
| A | `013–021` | B | A |
| A | `022–030` | C | A |
| A | `049–057` | A | B |
| A | `058–066` | B | B |
| A | `067–075` | C | B |
| B | `076–084` | B | B |
| B | `085–093` | C | B |
| B | `094–102` | C | A |
| B | `103–111` | B | A |

`experiment-map.js` is the central mapping for collection range, set, location, configuration, data-source availability, and operation order. All tabs use this map to enable or disable filter choices; availability is not hardcoded into the HTML.

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

### PHY CDF

The left control panel selects the measurement set, location, n48 TDD configuration, parameter, and individual n48/n77 operation measurements. Each checkbox selects one curve; the paired columns reflect the two systems' operations during the same experiment. Location A is disabled for Set B because no Set B measurements were collected there.

The dashboard contains two linked plots:

1. **Empirical CDF:** calculated from samples inside the current time window. Its legend reports the median and number of samples for each curve.
2. **Time domain:** displays each collection using elapsed time from the beginning of that collection. Measurements are approximately 150 seconds long.

The CDF x-axis uses the automatic padded data range by default. Enter an optional minimum, maximum, or both and select **Apply limits** to override it; select **Auto** to restore automatic limits. **Save PNG** downloads the currently rendered CDF with its curves, legend, and experiment label.

The highlighted time-domain window controls the CDF. Drag the middle of the window to move it, drag either edge to change its width, or use **Reset window** to restore the full interval. This makes it possible to exclude erroneous portions of a DL or UL test before comparing distributions.

Selected curves cycle through five distinguishable colors. n77 curves are also dashed to help distinguish them from n48 curves when colors repeat.

### PHY Debug

The PHY Debug tab compares the two phones for the four experiments in which both systems were active simultaneously:

- n48 DL : n77 UL
- n48 UL : n77 DL
- n48 DL : n77 DL
- n48 UL : n77 UL

The two curves are aligned using their original measurement timestamps and displayed as elapsed time from the earliest selected series. For mixed-direction experiments, UL is plotted against the left y-axis and DL against the right y-axis. Same-direction experiments share one y-axis.

The PHY Debug tab provides direction-aware comparisons for throughput, average RBs per slot, and total RBs. It automatically reads the PUSCH column for UL and the corresponding PDSCH column for DL. PUSCH Tx Power is read from `nr_pusch.csv` for both DL and UL experiments. SS-RSRP, SS-RSRQ, and SS-SINR are read from `nr_radio.csv` and share one axis.

### Spectrum (Freq)

This tab is available only for the four Set B ranges. Filter availability is derived from `experiment-map.js`, so Set A and Location A are automatically disabled. Each selected operation plots a frequency-domain median or linear-power mean with one of four transparent envelopes: 10th–90th, 5th–95th, 1st–99th, or minimum–maximum.

The x-axis explicitly marks 3650, 3660, 3700, 3800, and 3810 MHz. Manual y-axis limits can override the automatic range, and the currently rendered chart can be downloaded as PNG. The analyzer files contain 401 points at 400 kHz spacing with 1 MHz RBW, so adjacent frequency points overlap and are correlated. All 36 files contain approximately 60 seconds and 1,379–1,391 swept traces.

### Spectrum (Power)

This tab calculates an empirical CDF from one estimated band-power value per swept trace for either n48 (3660–3700 MHz) or n77 (3700–3800 MHz). The selected percentile interval is shown as a transparent vertical range, while the selected mean or median is shown as a vertical summary marker and in the legend. Manual x-axis limits and PNG download are available.

The preprocessing converts every bucket from dBm to mW and approximates PSD by dividing by the nominal 1 MHz RBW. It then integrates across frequency using trapezoidal integration and converts the result back to dBm:

```text
p_i [mW] = 10^(P_i [dBm] / 10)
P_band [mW] ≈ integral(p(f) / RBW, df)
P_band [dBm] = 10 log10(P_band [mW])
```

Because the analyzer used positive-peak detection and swept different frequencies at different times, the result is labeled an estimated sweep-integrated band power, not instantaneous or standards-compliant channel power.

## Files required for hosting

Only these files are needed to run the published dashboard:

- `index.html`
- `app.js`
- `debug.js`
- `spectrum.js`
- `styles.css`
- `data.js`
- `spectrum-data.js`
- `experiment-map.js`

`README.md` documents the project. `build_data.py` and `build_spectrum_data.py` are local utilities and are not required by the hosted page.

## Running locally

Open `index.html` directly in a browser. No web server, package installation, or internet connection is required.

## Rebuilding `data.js`

Run the following command from this folder using a Python environment with pandas installed:

```bash
python build_data.py
```

The script expects the original CSVs at the repository-level `_data` directory and rewrites `data.js`. Rebuilding is only necessary when the source CSVs or preprocessing rules change.

To rebuild the spectrum bundle from `_data/specan`:

```bash
python build_spectrum_data.py
```

Both build scripts read collection ranges and availability from `experiment-map.js`.

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
