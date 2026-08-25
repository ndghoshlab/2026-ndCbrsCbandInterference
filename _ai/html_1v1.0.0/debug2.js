(() => {
    "use strict";

    const DATA = window.CBRS_DATA;
    const MAP = window.EXPERIMENT_MAP;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const operations = MAP.operations;
    const experiments = MAP.experiments.filter(experiment => experiment.qualipoc);
    const colors = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00"];
    const state = {parameter: "radio|SS-RSRP", entries: [], nextId: 1, xLimits: [null, null]};
    const plot = {left: 74, right: 965, top: 26, bottom: 355};
    const chart = document.getElementById("debug2Chart");
    const entryContainer = document.getElementById("debug2CurveEntries");
    const parameterSelect = document.getElementById("debug2Parameter");

    function el(name, attributes = {}, text = "") {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        if (text !== "") element.textContent = text;
        return element;
    }

    function createEntry(prefix = "C") {
        return {
            id: state.nextId++, label: "", prefix,
            sets: new Set(["A", "B"]), locations: new Set(["A", "B", "C"]), configs: new Set(["A", "B"]),
            operations: new Set(operations.map((_, index) => index))
        };
    }

    function populateParameters() {
        const labels = {radio: "Radio", pdsch: "PDSCH", pusch: "PUSCH"};
        Object.entries(DATA.parameters).forEach(([source, parameters]) => {
            const group = document.createElement("optgroup");
            group.label = labels[source];
            Object.entries(parameters).forEach(([column, metadata]) => {
                const option = document.createElement("option");
                option.value = `${source}|${column}`;
                option.textContent = metadata.label;
                group.appendChild(option);
            });
            parameterSelect.appendChild(group);
        });
        parameterSelect.value = state.parameter;
    }

    function parameterInfo() {
        const [source, column] = state.parameter.split("|");
        return {source, column, ...DATA.parameters[source][column]};
    }

    function escapeAttribute(value) {
        return value.replace(/[&"<>]/g, character => ({"&": "&amp;", '"': "&quot;", "<": "&lt;", ">": "&gt;"}[character]));
    }

    function checkboxes(type, values, selected, label = value => value) {
        return values.map(value => `<label><input type="checkbox" data-filter="${type}" value="${value}" ${selected.has(value) ? "checked" : ""}><span>${label(value)}</span></label>`).join("");
    }

    function renderEntries() {
        entryContainer.innerHTML = "";
        state.entries.forEach((entry, index) => {
            const card = document.createElement("article");
            card.className = "curve-entry";
            card.style.setProperty("--curve-color", colors[index % colors.length]);
            card.innerHTML = `
                <div class="curve-entry-head">
                    <strong>Curve ${index + 1}</strong>
                    <button type="button" data-action="remove">Remove</button>
                </div>
                <label class="field-label">Curve label</label>
                <input class="curve-label-input" data-field="label" value="${escapeAttribute(entry.label)}" placeholder="Optional custom label">
                <div class="curve-filter-row"><span>Band</span><select data-field="prefix"><option value="C" ${entry.prefix === "C" ? "selected" : ""}>n48</option><option value="V" ${entry.prefix === "V" ? "selected" : ""}>n77</option></select></div>
                <div class="curve-filter-row"><span>Sets</span><div class="mini-checks">${checkboxes("sets", ["A", "B"], entry.sets, value => `Set ${value}`)}</div></div>
                <div class="curve-filter-row"><span>Locations</span><div class="mini-checks">${checkboxes("locations", ["A", "B", "C"], entry.locations)}</div></div>
                <div class="curve-filter-row"><span>Configs</span><div class="mini-checks">${checkboxes("configs", ["A", "B"], entry.configs, value => `Config ${value}`)}</div></div>
                <div class="curve-operations-head"><span>Operation pairs</span><div><button type="button" data-action="all">All</button><button type="button" data-action="clear">Clear</button></div></div>
                <div class="curve-operation-grid">${checkboxes("operations", operations.map((_, operationIndex) => operationIndex), entry.operations, operationIndex => `${operations[operationIndex].n48}:${operations[operationIndex].n77}`)}</div>`;
            entryContainer.appendChild(card);

            card.querySelector('[data-field="label"]').addEventListener("input", event => {entry.label = event.target.value; renderChart();});
            card.querySelector('[data-field="prefix"]').addEventListener("change", event => {entry.prefix = event.target.value; renderChart();});
            card.querySelectorAll("[data-filter]").forEach(input => input.addEventListener("change", event => {
                const filter = entry[event.target.dataset.filter];
                const value = event.target.dataset.filter === "operations" ? Number(event.target.value) : event.target.value;
                event.target.checked ? filter.add(value) : filter.delete(value);
                renderChart();
            }));
            card.querySelector('[data-action="remove"]').addEventListener("click", () => {
                state.entries = state.entries.filter(item => item.id !== entry.id);
                renderEntries();
                renderChart();
            });
            card.querySelector('[data-action="all"]').addEventListener("click", () => {
                entry.operations = new Set(operations.map((_, operationIndex) => operationIndex));
                renderEntries();
                renderChart();
            });
            card.querySelector('[data-action="clear"]').addEventListener("click", () => {
                entry.operations.clear();
                renderEntries();
                renderChart();
            });
        });
    }

    function entrySeries(entry, index) {
        const parameter = parameterInfo();
        const values = [];
        experiments.filter(experiment => entry.sets.has(experiment.set) && entry.locations.has(experiment.location) && entry.configs.has(experiment.config)).forEach(experiment => {
            [...entry.operations].forEach(operationIndex => {
                const collection = `${entry.prefix}_${String(experiment.start + operationIndex).padStart(3, "0")}`;
                const points = DATA.data[parameter.source]?.[collection]?.[parameter.column] || [];
                if (points.length) {
                    values.push(...points.map(point => point[1]));
                }
            });
        });
        values.sort((a, b) => a - b);
        const label = entry.label.trim() || `Curve ${index + 1} · ${entry.prefix === "C" ? "n48" : "n77"}`;
        const points = values.map((value, valueIndex) => [value, values.length === 1 ? 1 : valueIndex / (values.length - 1)]);
        return {label, values, points, color: colors[index % colors.length]};
    }

    function median(values) {
        if (!values.length) return NaN;
        const middle = Math.floor(values.length / 2);
        return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "—";
        const absolute = Math.abs(value);
        if (absolute >= 1000) return value.toFixed(0);
        if (absolute >= 100) return value.toFixed(1);
        if (absolute >= 10) return value.toFixed(2);
        return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    function niceDomain(values) {
        if (!values.length) return [0, 1];
        let min = Math.min(...values), max = Math.max(...values);
        if (min === max) {
            const padding = Math.abs(min || 1) * 0.08;
            return [min - padding, max + padding];
        }
        const padding = (max - min) * 0.06;
        return [min - padding, max + padding];
    }

    function ticks(min, max, count = 6) {
        const rough = (max - min || 1) / count;
        const power = 10 ** Math.floor(Math.log10(rough));
        const error = rough / power;
        const step = (error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1) * power;
        const values = [];
        for (let value = Math.ceil(min / step) * step; value <= max + step * 0.01; value += step) values.push(value);
        return values;
    }

    function linePath(points, xScale, yScale) {
        return points.map((point, index) => `${index ? "L" : "M"}${xScale(point[0]).toFixed(2)},${yScale(point[1]).toFixed(2)}`).join(" ");
    }

    function drawAxes(xDomain, xLabel) {
        const xScale = value => plot.left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * (plot.right - plot.left);
        const yScale = value => plot.bottom - value * (plot.bottom - plot.top);
        ticks(...xDomain).forEach(value => {
            const x = xScale(value);
            chart.appendChild(el("line", {x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: "grid-line"}));
            chart.appendChild(el("text", {x, y: plot.bottom + 22, class: "axis-value", "text-anchor": "middle"}, formatNumber(value)));
        });
        ticks(0, 1, 5).forEach(value => {
            const y = yScale(value);
            chart.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: y, y2: y, class: "grid-line"}));
            chart.appendChild(el("text", {x: plot.left - 12, y: y + 4, class: "axis-value", "text-anchor": "end"}, formatNumber(value)));
        });
        chart.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: "axis-line"}));
        chart.appendChild(el("line", {x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, class: "axis-line"}));
        chart.appendChild(el("text", {x: (plot.left + plot.right) / 2, y: plot.bottom + 58, class: "axis-title", "text-anchor": "middle"}, xLabel));
        chart.appendChild(el("text", {x: 18, y: (plot.top + plot.bottom) / 2, class: "axis-title", "text-anchor": "middle", transform: `rotate(-90 18 ${(plot.top + plot.bottom) / 2})`}, "CDF"));
        return {xScale, yScale};
    }

    function drawLegend(series) {
        if (!series.length) return;
        const labels = series.map(item => `${item.label} · median ${formatNumber(median(item.values))} · #${item.values.length}`);
        const width = Math.min(560, Math.max(210, ...labels.map(label => label.length * 7.5 + 60)));
        const boxX = plot.left + 10, boxY = plot.top + 9, boxHeight = series.length * 27 + 18;
        chart.appendChild(el("rect", {x: boxX, y: boxY, width, height: boxHeight, rx: 4, fill: "#fffdf8", stroke: "#bfc4be", "fill-opacity": 0.94}));
        series.forEach((item, index) => {
            const y = boxY + 23 + index * 27;
            chart.appendChild(el("line", {x1: boxX + 12, x2: boxX + 38, y1: y - 4, y2: y - 4, stroke: item.color, "stroke-width": 3}));
            chart.appendChild(el("text", {x: boxX + 47, y, class: "legend-text"}, labels[index]));
        });
    }

    function renderChart() {
        chart.innerHTML = "";
        const parameter = parameterInfo();
        const series = state.entries.map(entrySeries);
        const allValues = series.flatMap(item => item.values);
        const autoDomain = niceDomain(allValues);
        const xDomain = [state.xLimits[0] ?? autoDomain[0], state.xLimits[1] ?? autoDomain[1]];
        document.getElementById("debug2XMin").placeholder = formatNumber(autoDomain[0]);
        document.getElementById("debug2XMax").placeholder = formatNumber(autoDomain[1]);
        document.getElementById("debug2ParameterTitle").textContent = parameter.label;
        const scales = drawAxes(xDomain, parameter.unit ? `${parameter.label} [${parameter.unit}]` : parameter.label);
        const clip = el("clipPath", {id: "debug2PlotClip"});
        clip.appendChild(el("rect", {x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top}));
        const definitions = el("defs");
        definitions.appendChild(clip);
        chart.appendChild(definitions);
        series.forEach(item => {
            if (item.points.length) chart.appendChild(el("path", {d: linePath(item.points, scales.xScale, scales.yScale), class: "series-line", stroke: item.color, "clip-path": "url(#debug2PlotClip)"}));
        });
        if (!allValues.length) chart.appendChild(el("text", {x: 520, y: 190, class: "empty-state"}, state.entries.length ? "No data for these curve filters" : "Add a curve to begin"));
        drawLegend(series);
    }

    function applyXLimits() {
        const minInput = document.getElementById("debug2XMin"), maxInput = document.getElementById("debug2XMax");
        const min = minInput.value === "" ? null : Number(minInput.value);
        const max = maxInput.value === "" ? null : Number(maxInput.value);
        const autoDomain = niceDomain(state.entries.map(entrySeries).flatMap(item => item.values));
        if ((min ?? autoDomain[0]) >= (max ?? autoDomain[1])) {
            maxInput.setCustomValidity("X max must be greater than X min.");
            maxInput.reportValidity();
            return;
        }
        maxInput.setCustomValidity("");
        state.xLimits = [min, max];
        renderChart();
    }

    function savePng() {
        const pngWidth = Math.max(600, Math.min(3000, Number(document.getElementById("debug2PngWidth").value) || 1200));
        const pngHeight = Math.round(pngWidth * 430 / 1000);
        const clone = chart.cloneNode(true);
        clone.setAttribute("xmlns", SVG_NS);
        clone.setAttribute("width", pngWidth);
        clone.setAttribute("height", pngHeight);
        const style = document.createElementNS(SVG_NS, "style");
        style.textContent = `text{fill:#59635d;font-family:Arial,sans-serif;font-size:15px}.axis-title{fill:#152019;font-size:18px;font-weight:700}.grid-line{stroke:#dedbd2;stroke-dasharray:4 5}.axis-line{stroke:#7a837d}.series-line{fill:none;stroke-width:2.3;stroke-linejoin:round;stroke-linecap:round}.empty-state{fill:#89918c;font-family:Georgia,serif;font-size:20px;text-anchor:middle}`;
        clone.prepend(style);
        const blob = new Blob([new XMLSerializer().serializeToString(clone)], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(blob), image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = pngWidth;
            canvas.height = pngHeight;
            const context = canvas.getContext("2d");
            context.fillStyle = "#fffdf8";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const link = document.createElement("a");
            link.download = "phy-debug2-cdf.png";
            link.href = canvas.toDataURL("image/png");
            link.click();
            URL.revokeObjectURL(url);
        };
        image.src = url;
    }

    document.getElementById("addDebug2Curve").addEventListener("click", () => {
        state.entries.push(createEntry(state.entries.length % 2 ? "V" : "C"));
        renderEntries();
        renderChart();
    });
    parameterSelect.addEventListener("change", event => {
        state.parameter = event.target.value;
        state.xLimits = [null, null];
        document.getElementById("debug2XMin").value = "";
        document.getElementById("debug2XMax").value = "";
        renderChart();
    });
    document.getElementById("applyDebug2XLimits").addEventListener("click", applyXLimits);
    document.getElementById("autoDebug2XLimits").addEventListener("click", () => {
        state.xLimits = [null, null];
        document.getElementById("debug2XMin").value = "";
        document.getElementById("debug2XMax").value = "";
        document.getElementById("debug2XMax").setCustomValidity("");
        renderChart();
    });
    document.getElementById("saveDebug2Png").addEventListener("click", savePng);

    populateParameters();
    state.entries.push(createEntry("C"));
    renderEntries();
    renderChart();
})();
