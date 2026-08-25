(() => {
    "use strict";

    const DATA = window.CBRS_DATA;
    const MAP = window.EXPERIMENT_MAP;
    if (!DATA) {
        document.body.innerHTML = '<p style="padding:2rem;font-family:sans-serif">Missing data.js. Run <code>python build_data.py</code> inside the _ai folder.</p>';
        return;
    }

    const SVG_NS = "http://www.w3.org/2000/svg";
    const operations = MAP.operations;
    const experiments = MAP.experiments.filter(experiment => experiment.qualipoc);
    const colors = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00"];
    const state = {set: "A", location: "A", config: "A", parameter: "radio|SS-RSRP", selected: new Set(["C:0", "V:0"]), windows: [[0, null]], maxTime: 150, xLimits: [null, null]};
    const plot = {left: 74, right: 965, top: 26, bottom: 342};

    const parameterSelect = document.getElementById("parameterSelect");
    const operationGrid = document.getElementById("operationGrid");
    const cdfChart = document.getElementById("cdfChart");
    const timeChart = document.getElementById("timeChart");

    function el(name, attributes = {}, text = "") {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        if (text !== "") element.textContent = text;
        return element;
    }

    function populateParameters() {
        const groupLabels = {radio: "Radio", pdsch: "PDSCH", pusch: "PUSCH"};
        Object.entries(DATA.parameters).forEach(([source, parameters]) => {
            const group = document.createElement("optgroup");
            group.label = groupLabels[source];
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

    function collectionNumber(index) {
        const experiment = experiments.find(item => item.set === state.set && item.location === state.location && item.config === state.config);
        return String(experiment.start + index).padStart(3, "0");
    }

    function updateExperimentAvailability() {
        const updateGroup = (name, stateKey, values) => {
            const inputs = [...document.querySelectorAll(`input[name="${name}"]`)];
            inputs.forEach(input => input.disabled = !values.includes(input.value));
            if (!values.includes(state[stateKey])) state[stateKey] = values[0];
            inputs.forEach(input => input.checked = input.value === state[stateKey]);
        };
        updateGroup("set", "set", [...new Set(experiments.map(item => item.set))]);
        updateGroup("location", "location", [...new Set(experiments.filter(item => item.set === state.set).map(item => item.location))]);
        updateGroup("config", "config", [...new Set(experiments.filter(item => item.set === state.set && item.location === state.location).map(item => item.config))]);
    }

    function renderOperationGrid() {
        operationGrid.innerHTML = "";
        operations.forEach((operation, index) => {
            const row = document.createElement("div");
            row.className = "operation-grid operation-row";
            row.innerHTML = `
                <label class="operation-check"><input type="checkbox" data-key="C:${index}" ${state.selected.has(`C:${index}`) ? "checked" : ""}><span>${operation.n48}</span></label>
                <label class="operation-check n77"><span>${operation.n77}</span><input type="checkbox" data-key="V:${index}" ${state.selected.has(`V:${index}`) ? "checked" : ""}></label>`;
            operationGrid.appendChild(row);
        });

        operationGrid.querySelectorAll("input").forEach(input => input.addEventListener("change", event => {
            event.target.checked ? state.selected.add(event.target.dataset.key) : state.selected.delete(event.target.dataset.key);
            resetWindow();
        }));
    }

    function parameterInfo() {
        const [source, column] = state.parameter.split("|");
        return {source, column, ...DATA.parameters[source][column]};
    }

    function seriesLabel(prefix, index) {
        const operation = operations[index];
        return prefix === "C" ? `n48 ${operation.n48} under n77 ${operation.n77}` : `n77 ${operation.n77} under n48 ${operation.n48}`;
    }

    function selectedSeries() {
        const parameter = parameterInfo();
        return [...state.selected].sort((a, b) => Number(a.split(":")[1]) - Number(b.split(":")[1]) || a.localeCompare(b)).map((key, seriesIndex) => {
            const [prefix, rawIndex] = key.split(":");
            const index = Number(rawIndex);
            const collection = `${prefix}_${collectionNumber(index)}`;
            const points = DATA.data[parameter.source]?.[collection]?.[parameter.column] || [];
            return {key, prefix, index, collection, points, label: seriesLabel(prefix, index), color: colors[seriesIndex % colors.length], dashed: prefix === "V"};
        });
    }

    function pointSelected(point) {
        return state.windows.some(window => point[0] >= window[0] && point[0] <= window[1]);
    }

    function selectedValues(item) {
        return item.points.filter(pointSelected).map(point => point[1]);
    }

    function median(values) {
        if (!values.length) return NaN;
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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
        const span = max - min || 1;
        const rough = span / count;
        const power = 10 ** Math.floor(Math.log10(rough));
        const error = rough / power;
        const factor = error >= 7.5 ? 10 : error >= 3.5 ? 5 : error >= 1.5 ? 2 : 1;
        const step = factor * power;
        const first = Math.ceil(min / step) * step;
        const values = [];
        for (let value = first; value <= max + step * 0.01; value += step) values.push(value);
        return values;
    }

    function linePath(points, xScale, yScale) {
        if (!points.length) return "";
        return points.map((point, index) => `${index ? "L" : "M"}${xScale(point[0]).toFixed(2)},${yScale(point[1]).toFixed(2)}`).join(" ");
    }

    function drawAxes(svg, xDomain, yDomain, xLabel, yLabel, bottom = plot.bottom) {
        const xScale = value => plot.left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * (plot.right - plot.left);
        const yScale = value => bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * (bottom - plot.top);

        ticks(...xDomain).forEach(value => {
            const x = xScale(value);
            svg.appendChild(el("line", {x1: x, x2: x, y1: plot.top, y2: bottom, class: "grid-line"}));
            svg.appendChild(el("text", {x, y: bottom + 22, "text-anchor": "middle"}, formatNumber(value)));
        });
        ticks(...yDomain, 5).forEach(value => {
            const y = yScale(value);
            svg.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: y, y2: y, class: "grid-line"}));
            svg.appendChild(el("text", {x: plot.left - 12, y: y + 4, "text-anchor": "end"}, formatNumber(value)));
        });
        svg.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: bottom, y2: bottom, class: "axis-line"}));
        svg.appendChild(el("line", {x1: plot.left, x2: plot.left, y1: plot.top, y2: bottom, class: "axis-line"}));
        svg.appendChild(el("text", {x: (plot.left + plot.right) / 2, y: bottom + 58, class: "axis-title", "text-anchor": "middle"}, xLabel));
        const yTitle = el("text", {x: 18, y: (plot.top + bottom) / 2, class: "axis-title", "text-anchor": "middle", transform: `rotate(-90 18 ${(plot.top + bottom) / 2})`}, yLabel);
        svg.appendChild(yTitle);
        return {xScale, yScale};
    }

    function axisLabel() {
        const parameter = parameterInfo();
        return parameter.unit ? `${parameter.label} [${parameter.unit}]` : parameter.label;
    }

    function drawExperimentLabel(svg, y = plot.top + 9) {
        const label = `Set ${state.set} · Location ${state.location} · n48 TDD Config ${state.config}`;
        svg.appendChild(el("rect", {x: plot.left + 10, y, width: 280, height: 27, rx: 3, fill: "#fffdf8", stroke: "#d8d5cb", "fill-opacity": 0.93}));
        svg.appendChild(el("text", {x: plot.left + 21, y: y + 18, fill: "#152019", "font-weight": 750}, label));
    }

    function drawLegend(svg, series) {
        if (!series.length) return;
        const columns = Math.ceil(series.length / 9);
        const rows = Math.min(series.length, 9);
        const labels = series.map(item => {
            const values = selectedValues(item);
            return `${item.label} · median ${formatNumber(median(values))} · #${values.length}`;
        });
        const columnWidth = Math.min(350, Math.max(175, ...labels.map(label => label.length * 6.2 + 44)));
        const boxWidth = columns * columnWidth + 20;
        const boxHeight = rows * 21 + 17;
        const boxX = plot.left + 10;
        const boxY = plot.top + 45;
        svg.appendChild(el("rect", {x: boxX, y: boxY, width: boxWidth, height: boxHeight, rx: 4, fill: "#fffdf8", stroke: "#bfc4be", "fill-opacity": 0.94}));

        series.forEach((item, index) => {
            const column = Math.floor(index / 9);
            const row = index % 9;
            const x = boxX + 12 + column * columnWidth;
            const y = boxY + 19 + row * 21;
            svg.appendChild(el("line", {x1: x, x2: x + 24, y1: y - 4, y2: y - 4, stroke: item.color, "stroke-width": 3, "stroke-dasharray": item.dashed ? "7 4" : "none"}));
            svg.appendChild(el("text", {x: x + 32, y, fill: "#28322c", "font-size": 11}, labels[index]));
        });
    }

    function renderCDF(series) {
        cdfChart.innerHTML = "";
        const prepared = series.map(item => {
            const values = selectedValues(item).sort((a, b) => a - b);
            const points = values.map((value, index) => [value, values.length === 1 ? 1 : index / (values.length - 1)]);
            return {...item, values, cdfPoints: points};
        });
        const allValues = prepared.flatMap(item => item.values);
        const autoDomain = niceDomain(allValues);
        const xDomain = [state.xLimits[0] ?? autoDomain[0], state.xLimits[1] ?? autoDomain[1]];
        document.getElementById("cdfXMin").placeholder = formatNumber(autoDomain[0]);
        document.getElementById("cdfXMax").placeholder = formatNumber(autoDomain[1]);
        const scales = drawAxes(cdfChart, xDomain, [0, 1], axisLabel(), "CDF");
        const clip = el("clipPath", {id: "cdfPlotClip"});
        clip.appendChild(el("rect", {x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top}));
        const definitions = el("defs");
        definitions.appendChild(clip);
        cdfChart.appendChild(definitions);

        prepared.forEach(item => {
            if (!item.cdfPoints.length) return;
            cdfChart.appendChild(el("path", {d: linePath(item.cdfPoints, scales.xScale, scales.yScale), class: "series-line", stroke: item.color, "stroke-dasharray": item.dashed ? "8 5" : "none", "clip-path": "url(#cdfPlotClip)"}));
        });
        if (!allValues.length) cdfChart.appendChild(el("text", {x: 520, y: 180, class: "empty-state"}, "No samples in this window"));
        drawExperimentLabel(cdfChart, plot.bottom - 37);
        drawLegend(cdfChart, prepared);
    }

    function renderTime(series) {
        timeChart.innerHTML = "";
        const allValues = series.flatMap(item => item.points.map(point => point[1]));
        const yDomain = niceDomain(allValues);
        const xDomain = [0, state.maxTime || 150];
        const scales = drawAxes(timeChart, xDomain, yDomain, "Elapsed time [s]", axisLabel());

        series.forEach(item => {
            if (!item.points.length) return;
            timeChart.appendChild(el("path", {d: linePath(item.points, scales.xScale, scales.yScale), class: "series-line", stroke: item.color, "stroke-dasharray": item.dashed ? "8 5" : "none"}));
        });
        if (!allValues.length) timeChart.appendChild(el("text", {x: 520, y: 180, class: "empty-state"}, "No data for the selected series"));

        state.windows.forEach((window, index) => {
            const startX = scales.xScale(window[0]);
            const endX = scales.xScale(window[1]);
            const windowClass = index ? " window-2" : "";
            timeChart.appendChild(el("rect", {x: startX, y: plot.top, width: Math.max(1, endX - startX), height: plot.bottom - plot.top, class: `selection-window${windowClass}`, "data-drag": "move", "data-window": index}));
            timeChart.appendChild(el("line", {x1: startX, x2: startX, y1: plot.top, y2: plot.bottom, class: `selection-handle${windowClass}`, "data-drag": "start", "data-window": index}));
            timeChart.appendChild(el("line", {x1: endX, x2: endX, y1: plot.top, y2: plot.bottom, class: `selection-handle${windowClass}`, "data-drag": "end", "data-window": index}));
            timeChart.appendChild(el("circle", {cx: startX, cy: plot.top + 13, r: 4, class: `selection-grip${windowClass}`}));
            timeChart.appendChild(el("circle", {cx: endX, cy: plot.top + 13, r: 4, class: `selection-grip${windowClass}`}));
        });
        drawExperimentLabel(timeChart);
        attachBrushEvents();
    }

    function updateLabels() {
        const parameter = parameterInfo();
        document.getElementById("experimentLabel").textContent = `Set ${state.set} · Location ${state.location} · Config ${state.config}`;
        document.getElementById("parameterTitle").textContent = parameter.label;
        document.getElementById("parameterNote").textContent = parameter.unit ? `Displayed in ${parameter.unit}` : "Unitless measurement";
        const ranges = state.windows.map((window, index) => `${index + 1}: ${window[0].toFixed(1)}–${window[1].toFixed(1)} s`);
        document.getElementById("windowReadout").textContent = `${state.windows.length > 1 ? "Windows" : "Window"} ${ranges.join(" + ")}`;
        document.getElementById("windowRanges").textContent = ranges.map(range => `Window ${range}`).join("  ·  ");
        document.getElementById("addWindow").disabled = state.windows.length > 1;
        document.getElementById("removeWindow").disabled = state.windows.length === 1;
    }

    function render() {
        const series = selectedSeries();
        const maxTime = Math.max(0, ...series.flatMap(item => item.points.map(point => point[0])));
        state.maxTime = Math.max(1, Math.ceil(maxTime || 150));
        state.windows = state.windows.map(window => {
            const end = window[1] === null ? state.maxTime : Math.min(window[1], state.maxTime);
            return [Math.min(window[0], Math.max(0, end - 0.5)), end];
        });
        updateLabels();
        renderCDF(series);
        renderTime(series);
    }

    function resetWindow() {
        state.windows = [[0, null]];
        render();
    }

    function addWindow() {
        if (state.windows.length > 1) return;
        if (state.windows[0][0] === 0 && state.windows[0][1] === state.maxTime) state.windows[0] = [0, state.maxTime * 0.4];
        state.windows.push([state.maxTime * 0.6, state.maxTime]);
        render();
    }

    function removeWindow() {
        if (state.windows.length === 1) return;
        state.windows.pop();
        render();
    }

    function applyXLimits() {
        const minInput = document.getElementById("cdfXMin");
        const maxInput = document.getElementById("cdfXMax");
        const min = minInput.value === "" ? null : Number(minInput.value);
        const max = maxInput.value === "" ? null : Number(maxInput.value);
        const series = selectedSeries();
        const values = series.flatMap(selectedValues);
        const autoDomain = niceDomain(values);
        if ((min ?? autoDomain[0]) >= (max ?? autoDomain[1])) {
            maxInput.setCustomValidity("X max must be greater than X min.");
            maxInput.reportValidity();
            return;
        }
        maxInput.setCustomValidity("");
        state.xLimits = [min, max];
        renderCDF(series);
    }

    function saveCdfPng() {
        const pngWidth = Math.max(600, Math.min(3000, Number(document.getElementById("cdfPngWidth").value) || 1200));
        const pngHeight = Math.round(pngWidth * 410 / 1000);
        const clone = cdfChart.cloneNode(true);
        clone.setAttribute("xmlns", SVG_NS);
        clone.setAttribute("width", pngWidth);
        clone.setAttribute("height", pngHeight);
        const style = document.createElementNS(SVG_NS, "style");
        style.textContent = `text{fill:#59635d;font-family:Arial,sans-serif;font-size:12px}.axis-title{fill:#152019;font-size:14px;font-weight:700}.grid-line{stroke:#dedbd2;stroke-dasharray:4 5}.axis-line{stroke:#7a837d}.series-line{fill:none;stroke-width:2.3;stroke-linejoin:round;stroke-linecap:round}.empty-state{fill:#89918c;font-family:Georgia,serif;font-size:18px;text-anchor:middle}`;
        clone.prepend(style);
        const blob = new Blob([new XMLSerializer().serializeToString(clone)], {type: "image/svg+xml;charset=utf-8"});
        const url = URL.createObjectURL(blob);
        const image = new Image();
        image.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = pngWidth;
            canvas.height = pngHeight;
            const context = canvas.getContext("2d");
            context.fillStyle = "#fffdf8";
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            const link = document.createElement("a");
            link.download = `cdf-set${state.set}-location${state.location}-config${state.config}.png`;
            link.href = canvas.toDataURL("image/png");
            link.click();
            URL.revokeObjectURL(url);
        };
        image.src = url;
    }

    function pointerTime(event) {
        const bounds = timeChart.getBoundingClientRect();
        const svgX = (event.clientX - bounds.left) / bounds.width * 1000;
        return Math.max(0, Math.min(state.maxTime, (svgX - plot.left) / (plot.right - plot.left) * state.maxTime));
    }

    function attachBrushEvents() {
        timeChart.querySelectorAll("[data-drag]").forEach(target => target.addEventListener("pointerdown", event => {
            event.preventDefault();
            const mode = event.target.dataset.drag;
            const windowIndex = Number(event.target.dataset.window);
            const origin = pointerTime(event);
            const initial = [...state.windows[windowIndex]];
            const width = initial[1] - initial[0];
            event.target.setPointerCapture(event.pointerId);

            const move = moveEvent => {
                const current = pointerTime(moveEvent);
                const activeWindow = state.windows[windowIndex];
                if (mode === "start") activeWindow[0] = Math.min(current, activeWindow[1] - 0.5);
                if (mode === "end") activeWindow[1] = Math.max(current, activeWindow[0] + 0.5);
                if (mode === "move") {
                    const delta = current - origin;
                    let start = initial[0] + delta;
                    start = Math.max(0, Math.min(state.maxTime - width, start));
                    state.windows[windowIndex] = [start, start + width];
                }
                render();
            };
            const up = () => {
                window.removeEventListener("pointermove", move);
                window.removeEventListener("pointerup", up);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", up);
        }));
    }

    document.querySelectorAll('input[name="set"]').forEach(input => input.addEventListener("change", event => {
        state.set = event.target.value;
        updateExperimentAvailability();
        renderOperationGrid();
        resetWindow();
    }));
    document.querySelectorAll('input[name="location"]').forEach(input => input.addEventListener("change", event => {
        state.location = event.target.value;
        updateExperimentAvailability();
        renderOperationGrid();
        resetWindow();
    }));
    document.querySelectorAll('input[name="config"]').forEach(input => input.addEventListener("change", event => {
        state.config = event.target.value;
        renderOperationGrid();
        resetWindow();
    }));
    parameterSelect.addEventListener("change", event => {
        state.parameter = event.target.value;
        state.xLimits = [null, null];
        document.getElementById("cdfXMin").value = "";
        document.getElementById("cdfXMax").value = "";
        resetWindow();
    });
    document.getElementById("selectAll").addEventListener("click", () => {
        state.selected = new Set(operations.flatMap((_, index) => [`C:${index}`, `V:${index}`]));
        renderOperationGrid();
        resetWindow();
    });
    document.getElementById("clearAll").addEventListener("click", () => {
        state.selected.clear();
        renderOperationGrid();
        resetWindow();
    });
    document.getElementById("resetWindow").addEventListener("click", resetWindow);
    document.getElementById("addWindow").addEventListener("click", addWindow);
    document.getElementById("removeWindow").addEventListener("click", removeWindow);
    document.getElementById("applyXLimits").addEventListener("click", applyXLimits);
    document.getElementById("autoXLimits").addEventListener("click", () => {
        state.xLimits = [null, null];
        document.getElementById("cdfXMin").value = "";
        document.getElementById("cdfXMax").value = "";
        document.getElementById("cdfXMax").setCustomValidity("");
        renderCDF(selectedSeries());
    });
    document.getElementById("saveCdfPng").addEventListener("click", saveCdfPng);

    populateParameters();
    updateExperimentAvailability();
    renderOperationGrid();
    render();
})();
