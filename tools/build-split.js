/*
 * One-time build helper.
 * Extracts the inline application <script> from extension/dashboard.html into
 * extension/app.js, appends a delegated event-wiring shim (Chrome MV3 pages
 * forbid inline onclick/onchange/onsubmit handlers), and rewrites the HTML to
 * load the external script file.
 */
const fs = require("fs");
const path = require("path");

const extDir = path.join(__dirname, "..", "extension");
const htmlPath = path.join(extDir, "dashboard.html");
const jsPath = path.join(extDir, "app.js");

let html = fs.readFileSync(htmlPath, "utf8");

const marker = "<!-- MAIN CORE APPLICATION JAVASCRIPT LOGIC -->";
const re = new RegExp(marker + "\\s*<script>([\\s\\S]*?)</script>");
const match = html.match(re);

if (!match) {
  console.error("Could not locate the inline application script block.");
  process.exit(1);
}

const innerJs = match[1].replace(/^\n/, "");

const shim = `

/* ==================== CHROME EXTENSION EVENT WIRING ====================
   Manifest V3 extension pages block inline event handlers
   (onclick / onchange / onsubmit). This delegated dispatcher reads the
   original handler attribute at event time and invokes the matching global
   function. Because it listens on document, it also works for nodes that are
   rendered dynamically (listing cards, rule cards, etc.). */
(function () {
    function dispatchInline(code, event) {
        if (!code) return;
        var m = code.match(/^\\s*([A-Za-z_$][\\w$]*)\\s*\\((.*)\\)\\s*;?\\s*$/);
        if (!m) return;
        var fn = window[m[1]];
        if (typeof fn !== "function") return;
        var argRaw = m[2].trim();
        var args = [];
        if (argRaw === "event") {
            args = [event];
        } else if (argRaw.length) {
            args = [argRaw.replace(/^['"]|['"]$/g, "")];
        }
        return fn.apply(window, args);
    }

    document.addEventListener("click", function (e) {
        var el = e.target.closest("[onclick]");
        if (el) dispatchInline(el.getAttribute("onclick"), e);
    });
    document.addEventListener("change", function (e) {
        var el = e.target.closest("[onchange]");
        if (el) dispatchInline(el.getAttribute("onchange"), e);
    });
    document.addEventListener("submit", function (e) {
        var el = e.target.closest("[onsubmit]");
        if (el) dispatchInline(el.getAttribute("onsubmit"), e);
    });
})();
`;

fs.writeFileSync(jsPath, innerJs + shim, "utf8");

html = html.replace(re, marker + '\n    <script src="app.js"></script>');
fs.writeFileSync(htmlPath, html, "utf8");

console.log("Wrote", jsPath, "(" + (innerJs.length) + " chars of app logic)");
console.log("Rewrote", htmlPath, "to load external app.js");
