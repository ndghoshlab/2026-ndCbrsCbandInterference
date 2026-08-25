(() => {
    "use strict";

    const DATA = window.SPECTRUM_DATA;
    const MAP = window.EXPERIMENT_MAP;
    if (!DATA || !MAP) return;

    const SVG_NS = "http://www.w3.org/2000/svg";
    const colors = ["#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00"];
    const experiments = MAP.experiments.filter(experiment => experiment.spectrum);
    const operations = MAP.operations;
    const plot = {left: 74, right: 965, top: 26, bottom: 350};
    const freqState = {set: "B", location: "B", config: "B", center: "mean", envelope: "10-90", selected: new Set([0]), yLimits: [null, null]};
    const powerState = {set: "B", location: "B", config: "B", band: "n48", summary: "mean", interval: "10-90", selected: new Set([0]), xLimits: [null, null]};
    const freqChart = document.getElementById("spectrumFreqChart");
    const powerChart = document.getElementById("spectrumPowerChart");

    function el(name, attributes = {}, text = "") {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        if (text !== "") element.textContent = text;
        return element;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "—";
        const absolute = Math.abs(value);
        if (absolute >= 100) return value.toFixed(1);
        if (absolute >= 10) return value.toFixed(2);
        return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    function niceDomain(values) {
        if (!values.length) return [0, 1];
        const min = Math.min(...values), max = Math.max(...values);
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

    function quantile(sorted, percentile) {
        if (!sorted.length) return NaN;
        const position = (sorted.length - 1) * percentile / 100;
        const lower = Math.floor(position), upper = Math.ceil(position);
        return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
    }

    function summary(values, method) {
        if (!values.length) return NaN;
        if (method === "median") return quantile([...values].sort((a, b) => a - b), 50);
        const meanMw = values.reduce((total, value) => total + 10 ** (value / 10), 0) / values.length;
        return 10 * Math.log10(meanMw);
    }

    function linePath(points, xScale, yScale) {
        return points.map((point, index) => `${index ? "L" : "M"}${xScale(point[0]).toFixed(2)},${yScale(point[1]).toFixed(2)}`).join(" ");
    }

    function currentExperiment(state) {
        return experiments.find(item => item.set === state.set && item.location === state.location && item.config === state.config);
    }

    function collectionNumber(state, index) {
        return String(currentExperiment(state).start + index).padStart(3, "0");
    }

    function updateExperimentAvailability(prefix, state) {
        const updateGroup = (suffix, stateKey, values) => {
            const inputs = [...document.querySelectorAll(`input[name="${prefix}${suffix}"]`)];
            inputs.forEach(input => input.disabled = !values.includes(input.value));
            if (!values.includes(state[stateKey])) state[stateKey] = values[0];
            inputs.forEach(input => input.checked = input.value === state[stateKey]);
        };
        updateGroup("Set", "set", [...new Set(experiments.map(item => item.set))]);
        updateGroup("Location", "location", [...new Set(experiments.filter(item => item.set === state.set).map(item => item.location))]);
        updateGroup("Config", "config", [...new Set(experiments.filter(item => item.set === state.set && item.location === state.location).map(item => item.config))]);
    }

    function bindExperimentControls(prefix, state, render) {
        [["Set", "set"], ["Location", "location"], ["Config", "config"]].forEach(([suffix, stateKey]) => {
            document.querySelectorAll(`input[name="${prefix}${suffix}"]`).forEach(input => input.addEventListener("change", event => {
                state[stateKey] = event.target.value;
                updateExperimentAvailability(prefix, state);
                renderOperations(`${prefix}OperationGrid`, state, render);
                render();
            }));
        });
        updateExperimentAvailability(prefix, state);
    }

    function operationLabel(index) {
        const operation = operations[index];
        return `n48 ${operation.n48} : n77 ${operation.n77}`;
    }

    function renderOperations(gridId, state, render) {
        const grid = document.getElementById(gridId);
        grid.innerHTML = "";
        operations.forEach((operation, index) => {
            const row = document.createElement("div");
            row.className = "operation-grid operation-row";
            row.innerHTML = `<label class="operation-check"><input type="checkbox" data-index="${index}" ${state.selected.has(index) ? "checked" : ""}><span>${operation.n48}</span></label><span class="operation-part">${operation.n77}</span>`;
            grid.appendChild(row);
        });
        grid.querySelectorAll("input").forEach(input => input.addEventListener("change", event => {
            const index = Number(event.target.dataset.index);
            event.target.checked ? state.selected.add(index) : state.selected.delete(index);
            render();
        }));
    }

    function bindOperationActions(prefix, state, render) {
        document.getElementById(`${prefix}SelectAll`).addEventListener("click", () => {
            state.selected = new Set(operations.map((_, index) => index));
            renderOperations(`${prefix}OperationGrid`, state, render);
            render();
        });
        document.getElementById(`${prefix}ClearAll`).addEventListener("click", () => {
            state.selected.clear();
            renderOperations(`${prefix}OperationGrid`, state, render);
            render();
        });
    }

    function addClip(svg, id) {
        const clip = el("clipPath", {id});
        clip.appendChild(el("rect", {x: plot.left, y: plot.top, width: plot.right - plot.left, height: plot.bottom - plot.top}));
        const definitions = el("defs");
        definitions.appendChild(clip);
        svg.appendChild(definitions);
    }

    function drawYAxes(svg, yDomain, yLabel) {
        const yScale = value => plot.bottom - (value - yDomain[0]) / (yDomain[1] - yDomain[0]) * (plot.bottom - plot.top);
        ticks(...yDomain, 5).forEach(value => {
            const y = yScale(value);
            svg.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: y, y2: y, class: "grid-line"}));
            svg.appendChild(el("text", {x: plot.left - 12, y: y + 4, "text-anchor": "end"}, formatNumber(value)));
        });
        svg.appendChild(el("line", {x1: plot.left, x2: plot.left, y1: plot.top, y2: plot.bottom, class: "axis-line"}));
        svg.appendChild(el("text", {x: 18, y: (plot.top + plot.bottom) / 2, class: "axis-title", "text-anchor": "middle", transform: `rotate(-90 18 ${(plot.top + plot.bottom) / 2})`}, yLabel));
        return yScale;
    }

    function drawFrequencyXAxis(svg) {
        const xScale = value => plot.left + (value - 3650) / 160 * (plot.right - plot.left);
        [3650, 3660, 3700, 3800, 3810].forEach(value => {
            const x = xScale(value);
            svg.appendChild(el("line", {x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: [3660, 3700, 3800].includes(value) ? "band-edge" : "grid-line"}));
            svg.appendChild(el("text", {x, y: plot.bottom + 22, "text-anchor": "middle"}, value));
        });
        svg.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: "axis-line"}));
        svg.appendChild(el("text", {x: (plot.left + plot.right) / 2, y: plot.bottom + 58, class: "axis-title", "text-anchor": "middle"}, "Frequency [MHz]"));
        return xScale;
    }

    function drawCdfXAxis(svg, xDomain, xLabel) {
        const xScale = value => plot.left + (value - xDomain[0]) / (xDomain[1] - xDomain[0]) * (plot.right - plot.left);
        ticks(...xDomain).forEach(value => {
            const x = xScale(value);
            svg.appendChild(el("line", {x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: "grid-line"}));
            svg.appendChild(el("text", {x, y: plot.bottom + 22, "text-anchor": "middle"}, formatNumber(value)));
        });
        svg.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: "axis-line"}));
        svg.appendChild(el("text", {x: (plot.left + plot.right) / 2, y: plot.bottom + 58, class: "axis-title", "text-anchor": "middle"}, xLabel));
        return xScale;
    }

    function drawContext(svg, text, width) {
        svg.appendChild(el("rect", {x: plot.left + 10, y: plot.bottom - 37, width, height: 27, rx: 3, fill: "#fffdf8", stroke: "#d8d5cb", "fill-opacity": 0.93}));
        svg.appendChild(el("text", {x: plot.left + 21, y: plot.bottom - 19, fill: "#152019", "font-weight": 750}, text));
    }

    function drawLegend(svg, series, labelFunction) {
        if (!series.length) return;
        const labels = series.map(labelFunction);
        const width = Math.min(455, Math.max(180, ...labels.map(label => label.length * 7 + 59)));
        const boxHeight = series.length * 22 + 16;
        const boxX = plot.left + 10, boxY = plot.top + 9;
        svg.appendChild(el("rect", {x: boxX, y: boxY, width, height: boxHeight, rx: 4, fill: "#fffdf8", stroke: "#bfc4be", "fill-opacity": 0.94}));
        series.forEach((item, index) => {
            const y = boxY + 20 + index * 22;
            svg.appendChild(el("line", {x1: boxX + 12, x2: boxX + 38, y1: y - 4, y2: y - 4, stroke: item.color, "stroke-width": 3}));
            svg.appendChild(el("text", {x: boxX + 47, y}, labels[index]));
        });
    }

    function frequencySeries() {
        const [low, high] = freqState.envelope.split("-");
        return [...freqState.selected].sort((a, b) => a - b).map((index, seriesIndex) => {
            const collection = collectionNumber(freqState, index);
            const data = DATA.collections[collection];
            return {index, collection, data, center: data.frequency[freqState.center], lower: data.frequency[`p${low}`], upper: data.frequency[`p${high}`], color: colors[seriesIndex % colors.length]};
        });
    }

    function renderFrequency() {
        freqChart.innerHTML = "";
        const series = frequencySeries();
        const autoDomain = niceDomain(series.flatMap(item => [...item.lower, ...item.upper]));
        const yDomain = [freqState.yLimits[0] ?? autoDomain[0], freqState.yLimits[1] ?? autoDomain[1]];
        document.getElementById("freqYMin").placeholder = formatNumber(autoDomain[0]);
        document.getElementById("freqYMax").placeholder = formatNumber(autoDomain[1]);
        const xScale = drawFrequencyXAxis(freqChart);
        const yScale = drawYAxes(freqChart, yDomain, "Detected power [dBm]");
        addClip(freqChart, "frequencyPlotClip");

        series.forEach(item => {
            const upper = DATA.frequenciesMHz.map((frequency, index) => [frequency, item.upper[index]]);
            const lower = DATA.frequenciesMHz.map((frequency, index) => [frequency, item.lower[index]]).reverse();
            freqChart.appendChild(el("path", {d: `${linePath(upper, xScale, yScale)} ${linePath(lower, xScale, yScale).replace(/^M/, "L")} Z`, fill: item.color, "fill-opacity": 0.13, "clip-path": "url(#frequencyPlotClip)"}));
            const center = DATA.frequenciesMHz.map((frequency, index) => [frequency, item.center[index]]);
            freqChart.appendChild(el("path", {d: linePath(center, xScale, yScale), class: "series-line", stroke: item.color, "clip-path": "url(#frequencyPlotClip)"}));
        });
        if (!series.length) freqChart.appendChild(el("text", {x: 520, y: 185, class: "empty-state"}, "Select at least one operation"));
        const [low, high] = freqState.envelope.split("-");
        drawContext(freqChart, `Set ${freqState.set} · Location ${freqState.location} · Config ${freqState.config} · ${freqState.center} · ${low}–${high}%`, 405);
        drawLegend(freqChart, series, item => `${operationLabel(item.index)} · ${freqState.center}`);
        updateFrequencyLabels(series);
    }

    function updateFrequencyLabels(series) {
        document.getElementById("freqExperimentLabel").textContent = `Set ${freqState.set} · Location ${freqState.location} · Config ${freqState.config}`;
        const duration = series[0]?.data.meta.duration ?? DATA.collections[collectionNumber(freqState, 0)].meta.duration;
        document.getElementById("freqDurationLabel").textContent = `${duration.toFixed(1)} s recording`;
    }

    function powerSeries() {
        const [low, high] = powerState.interval.split("-").map(Number);
        return [...powerState.selected].sort((a, b) => a - b).map((index, seriesIndex) => {
            const collection = collectionNumber(powerState, index);
            const data = DATA.collections[collection];
            const values = [...data.bandPower[powerState.band]].sort((a, b) => a - b);
            const cdf = values.map((value, valueIndex) => [value, values.length === 1 ? 1 : valueIndex / (values.length - 1)]);
            return {index, collection, data, values, cdf, statistic: summary(values, powerState.summary), low: quantile(values, low), high: quantile(values, high), color: colors[seriesIndex % colors.length]};
        });
    }

    function renderPower() {
        powerChart.innerHTML = "";
        const series = powerSeries();
        const autoDomain = niceDomain(series.flatMap(item => item.values));
        const xDomain = [powerState.xLimits[0] ?? autoDomain[0], powerState.xLimits[1] ?? autoDomain[1]];
        document.getElementById("powerXMin").placeholder = formatNumber(autoDomain[0]);
        document.getElementById("powerXMax").placeholder = formatNumber(autoDomain[1]);
        const xScale = drawCdfXAxis(powerChart, xDomain, `Estimated ${powerState.band} band power [dBm]`);
        const yScale = drawYAxes(powerChart, [0, 1], "CDF");
        addClip(powerChart, "powerPlotClip");

        series.forEach(item => {
            powerChart.appendChild(el("rect", {x: xScale(item.low), y: plot.top, width: xScale(item.high) - xScale(item.low), height: plot.bottom - plot.top, fill: item.color, "fill-opacity": 0.055, "clip-path": "url(#powerPlotClip)"}));
            [item.low, item.high].forEach(value => powerChart.appendChild(el("line", {x1: xScale(value), x2: xScale(value), y1: plot.top, y2: plot.bottom, stroke: item.color, "stroke-opacity": 0.35, "stroke-dasharray": "5 5", "clip-path": "url(#powerPlotClip)"})));
            powerChart.appendChild(el("line", {x1: xScale(item.statistic), x2: xScale(item.statistic), y1: plot.top, y2: plot.bottom, stroke: item.color, "stroke-width": 1.5, "stroke-dasharray": "2 4", "clip-path": "url(#powerPlotClip)"}));
            powerChart.appendChild(el("path", {d: linePath(item.cdf, xScale, yScale), class: "series-line", stroke: item.color, "clip-path": "url(#powerPlotClip)"}));
        });
        if (!series.length) powerChart.appendChild(el("text", {x: 520, y: 185, class: "empty-state"}, "Select at least one operation"));
        const [low, high] = powerState.interval.split("-");
        drawContext(powerChart, `Set ${powerState.set} · Location ${powerState.location} · Config ${powerState.config} · ${powerState.band} · ${low}–${high}%`, 390);
        drawLegend(powerChart, series, item => `${operationLabel(item.index)} · ${powerState.summary} ${formatNumber(item.statistic)} · #${item.values.length}`);
        updatePowerLabels(series);
    }

    function updatePowerLabels(series) {
        document.getElementById("powerExperimentLabel").textContent = `Set ${powerState.set} · Location ${powerState.location} · Config ${powerState.config}`;
        document.getElementById("powerBandTitle").textContent = `${powerState.band} band-power CDF`;
        const duration = series[0]?.data.meta.duration ?? DATA.collections[collectionNumber(powerState, 0)].meta.duration;
        document.getElementById("powerDurationLabel").textContent = `${duration.toFixed(1)} s recording`;
    }

    function applyLimits(state, minId, maxId, values, render) {
        const minInput = document.getElementById(minId), maxInput = document.getElementById(maxId);
        const min = minInput.value === "" ? null : Number(minInput.value);
        const max = maxInput.value === "" ? null : Number(maxInput.value);
        const autoDomain = niceDomain(values);
        if ((min ?? autoDomain[0]) >= (max ?? autoDomain[1])) {
            maxInput.setCustomValidity("Maximum must be greater than minimum.");
            maxInput.reportValidity();
            return;
        }
        maxInput.setCustomValidity("");
        state[0] = min;
        state[1] = max;
        render();
    }

    function resetLimits(state, minId, maxId, render) {
        state[0] = null;
        state[1] = null;
        document.getElementById(minId).value = "";
        document.getElementById(maxId).value = "";
        document.getElementById(maxId).setCustomValidity("");
        render();
    }

    function savePng(svg, filename, widthId = null) {
        const pngWidth = widthId ? Math.max(600, Math.min(3000, Number(document.getElementById(widthId).value) || 1200)) : 2000;
        const pngHeight = Math.round(pngWidth * 430 / 1000);
        const clone = svg.cloneNode(true);
        clone.setAttribute("xmlns", SVG_NS);
        clone.setAttribute("width", pngWidth);
        clone.setAttribute("height", pngHeight);
        const style = document.createElementNS(SVG_NS, "style");
        style.textContent = `text{fill:#59635d;font-family:Arial,sans-serif;font-size:12px}.axis-title{fill:#152019;font-size:14px;font-weight:700}.grid-line{stroke:#dedbd2;stroke-dasharray:4 5}.band-edge{stroke:#787f7a;stroke-width:1.4}.axis-line{stroke:#7a837d}.series-line{fill:none;stroke-width:2.3;stroke-linejoin:round;stroke-linecap:round}.empty-state{fill:#89918c;font-family:Georgia,serif;font-size:18px;text-anchor:middle}`;
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
            link.download = filename;
            link.href = canvas.toDataURL("image/png");
            link.click();
            URL.revokeObjectURL(url);
        };
        image.src = url;
    }

    bindExperimentControls("freq", freqState, renderFrequency);
    bindExperimentControls("power", powerState, renderPower);
    renderOperations("freqOperationGrid", freqState, renderFrequency);
    renderOperations("powerOperationGrid", powerState, renderPower);
    bindOperationActions("freq", freqState, renderFrequency);
    bindOperationActions("power", powerState, renderPower);

    document.querySelectorAll('input[name="freqCenter"]').forEach(input => input.addEventListener("change", event => {freqState.center = event.target.value; renderFrequency();}));
    document.querySelectorAll('input[name="freqEnvelope"]').forEach(input => input.addEventListener("change", event => {freqState.envelope = event.target.value; renderFrequency();}));
    document.querySelectorAll('input[name="powerBand"]').forEach(input => input.addEventListener("change", event => {powerState.band = event.target.value; renderPower();}));
    document.querySelectorAll('input[name="powerSummary"]').forEach(input => input.addEventListener("change", event => {powerState.summary = event.target.value; renderPower();}));
    document.querySelectorAll('input[name="powerInterval"]').forEach(input => input.addEventListener("change", event => {powerState.interval = event.target.value; renderPower();}));
    document.getElementById("applyFreqYLimits").addEventListener("click", () => applyLimits(freqState.yLimits, "freqYMin", "freqYMax", frequencySeries().flatMap(item => [...item.lower, ...item.upper]), renderFrequency));
    document.getElementById("autoFreqYLimits").addEventListener("click", () => resetLimits(freqState.yLimits, "freqYMin", "freqYMax", renderFrequency));
    document.getElementById("saveFreqPng").addEventListener("click", () => savePng(freqChart, `spectrum-frequency-location${freqState.location}-config${freqState.config}.png`));
    document.getElementById("applyPowerXLimits").addEventListener("click", () => applyLimits(powerState.xLimits, "powerXMin", "powerXMax", powerSeries().flatMap(item => item.values), renderPower));
    document.getElementById("autoPowerXLimits").addEventListener("click", () => resetLimits(powerState.xLimits, "powerXMin", "powerXMax", renderPower));
    document.getElementById("savePowerPng").addEventListener("click", () => savePng(powerChart, `spectrum-power-${powerState.band}-location${powerState.location}-config${powerState.config}.png`, "powerPngWidth"));

    renderFrequency();
    renderPower();
})();
