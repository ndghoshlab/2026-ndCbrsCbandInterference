(() => {
    const container = document.getElementById("infoContent");
    const escapeHtml = text => text.replace(/[&<>]/g, character => ({"&": "&amp;", "<": "&lt;", ">": "&gt;"}[character]));
    const inline = text => escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

    function renderMarkdown(markdown) {
        const lines = markdown.replace(/\r/g, "").split("\n");
        let html = "", listOpen = false;

        lines.forEach(line => {
            const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
            const heading = line.match(/^(#{1,3})\s+(.+)$/);
            const item = line.match(/^-\s+(.+)$/);
            const formula = line.match(/^>\s+(.+)$/);

            if (!item && listOpen) {html += "</ul>"; listOpen = false;}
            if (heading) html += `<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`;
            else if (image) html += `<figure><img src="../../${encodeURI(image[2])}" alt="${escapeHtml(image[1])}"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`;
            else if (item) {if (!listOpen) {html += "<ul>"; listOpen = true;} html += `<li>${inline(item[1])}</li>`;}
            else if (formula) html += `<div class="formula">${inline(formula[1])}</div>`;
            else if (line.trim()) html += `<p>${inline(line)}</p>`;
        });
        if (listOpen) html += "</ul>";
        container.innerHTML = html;
    }

    fetch("../../README.md", {cache: "no-cache"})
        .then(response => {if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.text();})
        .then(renderMarkdown)
        .catch(() => {container.innerHTML = "<p>README.md could not be loaded. Open this dashboard through GitHub Pages or a local web server.</p>";});
})();
