(() => {
    "use strict";

    const DATA = window.CBRS_DATA;
    const SVG_NS = "http://www.w3.org/2000/svg";
    const experimentStarts = {A: {A: 4, B: 49}, B: {A: 13, B: 58}, C: {A: 22, B: 67}};
    const operationPairs = {
        4: {n48: "DL", n77: "UL"},
        5: {n48: "UL", n77: "DL"},
        6: {n48: "DL", n77: "DL"},
        7: {n48: "UL", n77: "UL"}
    };
    const metrics = {
        throughput: {
            label: "Throughput", unit: "Mbps", kind: "directional",
            UL: {source: "pusch", column: "5G NR Net PUSCH Throughput"},
            DL: {source: "pdsch", column: "5G NR Net PDSCH Throughput"},
            note: "UL uses PUSCH throughput; DL uses PDSCH throughput."
        },
        avgRbs: {
            label: "Avg RBs per Slot", unit: "RB/slot", kind: "directional",
            UL: {source: "pusch", column: "PUSCH Avg RBs per Slot"},
            DL: {source: "pdsch", column: "PDSCH Avg RBs per Slot"},
            note: "UL uses PUSCH Avg RBs per Slot; DL uses PDSCH Avg RBs per Slot."
        },
        rbs: {
            label: "#RBs", unit: "k", kind: "directional",
            UL: {source: "pusch", column: "PUSCH RBs"},
            DL: {source: "pdsch", column: "PDSCH RBs"},
            note: "UL uses PUSCH RBs; DL uses PDSCH RBs. Values are shown in thousands."
        },
        txPower: {
            label: "PUSCH Tx Power", unit: "dBm", kind: "shared", source: "pusch", column: "PUSCH Tx Power",
            note: "PUSCH Tx Power is read from nr_pusch for both DL and UL experiments."
        },
        rsrp: {label: "SS-RSRP", unit: "dBm", kind: "shared", source: "radio", column: "SS-RSRP", note: "Radio values are read from nr_radio."},
        rsrq: {label: "SS-RSRQ", unit: "dB", kind: "shared", source: "radio", column: "SS-RSRQ", note: "Radio values are read from nr_radio."},
        sinr: {label: "SS-SINR", unit: "dB", kind: "shared", source: "radio", column: "SS-SINR", note: "Radio values are read from nr_radio."}
    };
    const colors = {C: "#009E73", V: "#D55E00"};
    const state = {location: "A", config: "A", operation: 4, metric: "throughput"};
    const chart = document.getElementById("debugChart");
    const plot = {left: 82, right: 1018, top: 28, bottom: 354};

    function el(name, attributes = {}, text = "") {
        const element = document.createElementNS(SVG_NS, name);
        Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
        if (text !== "") element.textContent = text;
        return element;
    }

    function formatNumber(value) {
        if (!Number.isFinite(value)) return "—";
        const absolute = Math.abs(value);
        if (absolute >= 1000) return value.toFixed(0);
        if (absolute >= 100) return value.toFixed(1);
        if (absolute >= 10) return value.toFixed(2);
        return value.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
    }

    function median(values) {
        if (!values.length) return NaN;
        const sorted = [...values].sort((a, b) => a - b);
        const middle = Math.floor(sorted.length / 2);
        return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

    function axisLabel(metric, direction = "") {
        const prefix = metric.kind === "directional" ? `${direction} ` : "";
        return `${prefix}${metric.label}${metric.unit ? ` [${metric.unit}]` : ""}`;
    }

    function selectedSeries() {
        const pair = operationPairs[state.operation];
        const metric = metrics[state.metric];
        const number = String(experimentStarts[state.location][state.config] + state.operation).padStart(3, "0");
        const definitions = [
            {prefix: "C", band: "n48", direction: pair.n48},
            {prefix: "V", band: "n77", direction: pair.n77}
        ];

        const series = definitions.map(definition => {
            const mapping = metric.kind === "directional" ? metric[definition.direction] : metric;
            const collection = `${definition.prefix}_${number}`;
            const collectionData = DATA.data[mapping.source]?.[collection] || {};
            const start = collectionData.__start || 0;
            const absolutePoints = (collectionData[mapping.column] || []).map(point => [start + point[0], point[1]]);
            const side = metric.kind === "directional" && pair.n48 !== pair.n77 && definition.direction === "DL" ? "right" : "left";
            return {...definition, collection, start, side, points: absolutePoints, color: colors[definition.prefix], dashed: definition.prefix === "V"};
        });

        const commonStart = Math.min(...series.filter(item => item.points.length).map(item => item.points[0][0]));
        series.forEach(item => item.points = item.points.map(point => [point[0] - commonStart, point[1]]));
        return series;
    }

    function drawXAxis(maxTime) {
        const xScale = value => plot.left + value / maxTime * (plot.right - plot.left);
        ticks(0, maxTime).forEach(value => {
            const x = xScale(value);
            chart.appendChild(el("line", {x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: "grid-line"}));
            chart.appendChild(el("text", {x, y: plot.bottom + 22, "text-anchor": "middle"}, formatNumber(value)));
        });
        chart.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: plot.bottom, y2: plot.bottom, class: "axis-line"}));
        chart.appendChild(el("text", {x: (plot.left + plot.right) / 2, y: plot.bottom + 58, class: "axis-title", "text-anchor": "middle"}, "Elapsed time [s]"));
        return xScale;
    }

    function drawYAxis(domain, label, side, drawGrid) {
        const x = side === "left" ? plot.left : plot.right;
        const textX = side === "left" ? x - 12 : x + 12;
        const anchor = side === "left" ? "end" : "start";
        const textClass = side === "left" ? "left-axis-text" : "right-axis-text";
        const yScale = value => plot.bottom - (value - domain[0]) / (domain[1] - domain[0]) * (plot.bottom - plot.top);

        ticks(...domain, 5).forEach(value => {
            const y = yScale(value);
            if (drawGrid) chart.appendChild(el("line", {x1: plot.left, x2: plot.right, y1: y, y2: y, class: "grid-line"}));
            chart.appendChild(el("text", {x: textX, y: y + 4, "text-anchor": anchor, class: textClass}, formatNumber(value)));
        });
        chart.appendChild(el("line", {x1: x, x2: x, y1: plot.top, y2: plot.bottom, class: "axis-line"}));
        const titleX = side === "left" ? 18 : 1082;
        chart.appendChild(el("text", {x: titleX, y: (plot.top + plot.bottom) / 2, class: `axis-title ${textClass}`, "text-anchor": "middle", transform: `rotate(${side === "left" ? -90 : 90} ${titleX} ${(plot.top + plot.bottom) / 2})`}, label));
        return yScale;
    }

    function drawContext(pair) {
        const text = `Location ${state.location} · n48 TDD Config ${state.config} · n48 ${pair.n48} : n77 ${pair.n77}`;
        chart.appendChild(el("rect", {x: plot.left + 11, y: plot.top + 10, width: 350, height: 28, rx: 3, fill: "#fffdf8", stroke: "#d8d5cb", "fill-opacity": 0.93}));
        chart.appendChild(el("text", {x: plot.left + 22, y: plot.top + 29, class: "debug-context"}, text));
    }

    function drawLegend(series) {
        const boxX = plot.right - 335;
        const boxY = plot.top + 10;
        chart.appendChild(el("rect", {x: boxX, y: boxY, width: 325, height: 58, rx: 4, fill: "#fffdf8", stroke: "#bfc4be", "fill-opacity": 0.94}));
        series.forEach((item, index) => {
            const y = boxY + 21 + index * 22;
            const values = item.points.map(point => point[1]);
            chart.appendChild(el("line", {x1: boxX + 12, x2: boxX + 38, y1: y - 4, y2: y - 4, stroke: item.color, "stroke-width": 3, "stroke-dasharray": item.dashed ? "7 4" : "none"}));
            chart.appendChild(el("text", {x: boxX + 47, y}, `${item.band} ${item.direction} · median ${formatNumber(median(values))} · #${values.length}`));
        });
    }

    function render() {
        chart.innerHTML = "";
        const pair = operationPairs[state.operation];
        const metric = metrics[state.metric];
        const series = selectedSeries();
        const maxTime = Math.max(1, Math.ceil(Math.max(0, ...series.flatMap(item => item.points.map(point => point[0])))));
        const leftSeries = series.filter(item => item.side === "left");
        const rightSeries = series.filter(item => item.side === "right");
        const leftDomain = niceDomain(leftSeries.flatMap(item => item.points.map(point => point[1])));
        const rightDomain = niceDomain(rightSeries.flatMap(item => item.points.map(point => point[1])));
        const xScale = drawXAxis(maxTime);
        const leftDirection = metric.kind === "directional" ? leftSeries[0]?.direction || "" : "";
        const leftScale = drawYAxis(leftDomain, axisLabel(metric, leftDirection), "left", true);
        const rightScale = rightSeries.length ? drawYAxis(rightDomain, axisLabel(metric, "DL"), "right", false) : null;

        series.forEach(item => {
            if (!item.points.length) return;
            chart.appendChild(el("path", {d: linePath(item.points, xScale, item.side === "right" ? rightScale : leftScale), class: "series-line", stroke: item.color, "stroke-dasharray": item.dashed ? "8 5" : "none"}));
        });
        if (!series.some(item => item.points.length)) chart.appendChild(el("text", {x: 550, y: 190, class: "empty-state"}, "No data for this selection"));
        drawContext(pair);
        drawLegend(series);

        document.getElementById("debugExperimentLabel").textContent = `Location ${state.location} · Config ${state.config}`;
        document.getElementById("debugParameterTitle").textContent = `${metric.label} · n48 ${pair.n48} : n77 ${pair.n77}`;
        document.getElementById("debugParameterNote").textContent = metric.note;
    }

    document.querySelectorAll(".tab-button").forEach(button => button.addEventListener("click", () => {
        document.querySelectorAll(".tab-button").forEach(item => item.classList.toggle("active", item === button));
        document.querySelectorAll(".tab-page").forEach(page => page.hidden = page.id !== button.dataset.tab);
        if (button.dataset.tab === "debugTab") render();
    }));
    document.querySelectorAll('input[name="debugLocation"]').forEach(input => input.addEventListener("change", event => {state.location = event.target.value; render();}));
    document.querySelectorAll('input[name="debugConfig"]').forEach(input => input.addEventListener("change", event => {state.config = event.target.value; render();}));
    document.getElementById("debugOperation").addEventListener("change", event => {state.operation = Number(event.target.value); render();});
    document.getElementById("debugParameter").addEventListener("change", event => {state.metric = event.target.value; render();});

    render();
})();
