/* ============================================================================
 * HostAutomate — Airbnb Messaging floating co-pilot (content script)
 * Injected on Airbnb hosting pages
 *
 *  - Auto-reads the currently open conversation thread from the page DOM.
 *  - Detects the latest guest message.
 *  - Asks Gemini (via the background service worker) to draft a reply IN THE
 *    SAME LANGUAGE the guest wrote in, using the saved property context.
 *  - Lets the host copy the draft or insert it straight into Airbnb's box.
 *
 * Airbnb's markup is obfuscated and changes often, so message extraction is
 * heuristic + best-effort, with a manual paste fallback that always works.
 * ==========================================================================*/
(function () {
    "use strict";

    if (window.__hostAutomateInjected) return;
    window.__hostAutomateInjected = true;

    console.log("%c[HostAutomate]%c Messaging co-pilot injected. Current URL: " + window.location.href, "color: #FF5A5F; font-weight: bold; background: #fee2e2; padding: 3px 6px; border-radius: 4px;", "color: inherit;");

    const STORAGE_KEY = "hostautomate_state";
    const NOISE_RE = /^(read by|translation|translated|show original|booker|enquiry sent|invite sent|today|yesterday|automatically translated)/i;

    // Built-in defaults so the widget works on the Airbnb page WITHOUT ever
    // opening the dashboard. The dashboard, if used, overrides these via storage.
    const DEFAULTS = {
        userConfig: {
            apiToken: ""
        },
        listings: [
            {
                id: "listing-1",
                name: "OntheWay 4-bedroom Loft @14pax Kota Kinabalu, Sabah",
                address: "Penampang, Kota Kinabalu, Sabah, Malaysia (~5 min from KK International Airport, ~15 min to KK city centre)",
                wifiSSID: "",
                wifiPass: "",
                checkin: "3:00 PM",
                checkout: "11:00 AM",
                instructions: "Self check-in via keypad. Check-in details will be provided on your arrival day via Airbnb chat. Please check messages regularly for updates.",
                parking: "Free parking on premises — 4 parking spaces available for guests.",
                rules: "14 guests maximum. No smoking indoors. Must climb stairs (no elevator). Fully equipped open kitchen with induction cooker, microwave, kettle, and tableware. Washing machine available. Air-conditioning in all rooms. Ceiling fans. TV in living area. Everything you need is a 3-minute walk away: self-service laundry, 7-Eleven, 24-hour shopping mall, and a variety of restaurants."
            }
        ]
    };

    let panelEl = null;
    let guestInput = null;
    let draftInput = null;
    let propertySelect = null;
    let statusEl = null;
    let lastAutoFilled = "";

    /* ----------------------------- storage ------------------------------ */
    function getStored() {
        return new Promise(resolve => {
            try {
                chrome.storage.local.get(STORAGE_KEY, data => {
                    const saved = (data && data[STORAGE_KEY]) || {};
                    // Merge with built-in defaults so the widget always has a
                    // property + API key even if the dashboard was never opened.
                    const listings = (saved.listings && saved.listings.length)
                        ? saved.listings : DEFAULTS.listings;
                    const userConfig = saved.userConfig && saved.userConfig.apiToken
                        ? saved.userConfig : DEFAULTS.userConfig;
                    resolve({ listings, userConfig });
                });
            } catch (e) {
                resolve({ listings: DEFAULTS.listings, userConfig: DEFAULTS.userConfig });
            }
        });
    }

    /* -------------------- conversation DOM extraction ------------------- */
    function findComposer() {
        const sels = [
            'textarea[aria-label*="message" i]',
            'textarea[placeholder*="message" i]',
            'div[contenteditable="true"][aria-label*="message" i]',
            'div[contenteditable="true"]',
            "textarea"
        ];
        for (const s of sels) {
            const el = document.querySelector(s);
            if (el) return el;
        }
        return null;
    }

    function getScrollContainer(el) {
        let node = el ? el.parentElement : null;
        while (node && node !== document.body) {
            const s = getComputedStyle(node);
            if (/(auto|scroll)/.test(s.overflowY) && node.scrollHeight > node.clientHeight + 20) {
                return node;
            }
            node = node.parentElement;
        }
        // fallback: pick the tallest scrollable element on the page
        let best = null;
        document.querySelectorAll("div").forEach(d => {
            const s = getComputedStyle(d);
            if (/(auto|scroll)/.test(s.overflowY) && d.scrollHeight > d.clientHeight + 40) {
                if (!best || d.clientHeight > best.clientHeight) best = d;
            }
        });
        return best;
    }

    function extractConversation() {
        const composer = findComposer();
        const region = getScrollContainer(composer) || document.body;
        const rect = region.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;

        const msgs = [];
        region.querySelectorAll("div, span, p").forEach(el => {
            // Want leaf-ish bubbles only (no nested block children with their own text).
            if (el.querySelector("div, p, button, a, textarea, img")) return;
            const text = (el.innerText || "").trim();
            if (!text || text.length < 2 || text.length > 1500) return;
            if (/^\d{1,2}:\d{2}(\s?[ap]m)?$/i.test(text)) return; // timestamps
            if (NOISE_RE.test(text)) return;
            const r = el.getBoundingClientRect();
            if (r.width < 12 || r.height < 8) return;
            if (r.bottom < rect.top || r.top > rect.bottom) return; // outside view region
            const mid = r.left + r.width / 2;
            const sender = mid < centerX ? "guest" : "host";
            msgs.push({ text, sender, top: r.top });
        });

        msgs.sort((a, b) => a.top - b.top);
        // collapse consecutive duplicates
        const cleaned = [];
        for (const m of msgs) {
            if (cleaned.length && cleaned[cleaned.length - 1].text === m.text) continue;
            cleaned.push(m);
        }
        const guests = cleaned.filter(m => m.sender === "guest");
        return {
            all: cleaned,
            latestGuest: guests.length ? guests[guests.length - 1].text : ""
        };
    }

    function insertIntoComposer(text) {
        const el = findComposer();
        if (!el) return false;
        el.focus();
        if (el.tagName === "TEXTAREA") {
            const setter = Object.getOwnPropertyDescriptor(
                window.HTMLTextAreaElement.prototype, "value"
            ).set;
            setter.call(el, text);
            el.dispatchEvent(new Event("input", { bubbles: true }));
        } else {
            // contenteditable (Draft.js / Lexical) — execCommand is most reliable
            try {
                document.execCommand("selectAll", false, null);
                document.execCommand("insertText", false, text);
            } catch (e) {
                el.textContent = text;
                el.dispatchEvent(new InputEvent("input", { bubbles: true }));
            }
        }
        return true;
    }

    /* ----------------------------- prompt ------------------------------- */
    function buildPrompt(property, guestMessage) {
        const p = property || {};
        const ctx = `Listing Context Profile Details:
- Name of Property: ${p.name || "(not provided)"}
- Full Address Location: ${p.address || "(not provided)"}
- WiFi Network SSID: ${p.wifiSSID || "(not provided)"}
- WiFi Network Password: ${p.wifiPass || "(not provided)"}
- Standard Check-in Time: ${p.checkin || "(not provided)"}
- Standard Check-out Time: ${p.checkout || "(not provided)"}
- Entry Access Instructions: ${p.instructions || "(not provided)"}
- Parking Information: ${p.parking || "(not provided)"}
- General House Rules / Supplies: ${p.rules || "(not provided)"}`;

        const system = `You are a world-class, warm, professional Airbnb Co-Host.
LANGUAGE RULE (critical): Detect the language the guest used in their message and write your ENTIRE reply in that SAME language and script (e.g. if the guest wrote in Chinese, reply in Chinese; if Malay, reply in Malay; if English, reply in English). Match their tone and level of politeness.
Other rules:
- Never invent information (wifi, codes, parking, rules) that is not in the context. If a field says "(not provided)", do not guess it; instead say you will confirm and follow up shortly.
- Personalise with the guest's name only if it is obvious from their message.
- Be concise, friendly and clearly formatted. No preamble like "Here is your reply:" — start the message directly.`;

        const user = `Guest's incoming message: "${guestMessage}"

Draft the perfect co-host reply now, in the guest's own language.`;

        return `${system}\n\n${ctx}\n\n${user}`;
    }

    /* ------------------------------- UI -------------------------------- */
    function setStatus(text, kind) {
        if (!statusEl) return;
        statusEl.textContent = text || "";
        statusEl.className = "ha-status" + (kind ? " ha-status-" + kind : "");
    }

    async function populateProperties() {
        const stored = await getStored();
        const listings = stored.listings || [];
        propertySelect.innerHTML = "";
        if (!listings.length) {
            const opt = document.createElement("option");
            opt.textContent = "No properties — open dashboard first";
            opt.value = "";
            propertySelect.appendChild(opt);
            return;
        }
        listings.forEach(l => {
            const opt = document.createElement("option");
            opt.value = l.id;
            opt.textContent = l.name;
            propertySelect.appendChild(opt);
        });
    }

    function syncLatest(manual) {
        const { latestGuest } = extractConversation();
        if (latestGuest) {
            // Only overwrite if the host hasn't typed their own correction.
            if (manual || !guestInput.value || guestInput.value === lastAutoFilled) {
                guestInput.value = latestGuest;
                lastAutoFilled = latestGuest;
                setStatus("Synced latest guest message ✓", "ok");
            }
        } else if (manual) {
            setStatus("Couldn't auto-read a guest message — paste it manually.", "warn");
        }
    }

    async function rephrase() {
        const stored = await getStored();
        const cfg = stored.userConfig || {};
        const apiKey = cfg.apiToken;
        if (!apiKey) {
            setStatus("No Gemini API key. Set it in the dashboard → Sync & API Settings.", "warn");
            return;
        }
        const currentDraft = draftInput.value.trim();
        if (!currentDraft) {
            setStatus("Nothing to rephrase — write or generate a draft first.", "warn");
            return;
        }
        const prompt = `You are a professional writing assistant. Improve and rephrase the following Airbnb host reply. Fix any grammar or spelling mistakes, make it sound warmer and more professional, and keep the same language and meaning. Do NOT add preamble like "Here is the improved version:" — output only the improved message directly.\n\nOriginal message:\n"${currentDraft}"`;

        setStatus("Improving your reply…", "busy");
        chrome.runtime.sendMessage({ type: "GEMINI_GENERATE", apiKey, prompt }, resp => {
            if (chrome.runtime.lastError) {
                setStatus("Error: " + chrome.runtime.lastError.message, "warn");
                return;
            }
            if (resp && resp.ok) {
                draftInput.value = resp.text;
                setStatus("Rephrased ✓ — review the improved version.", "ok");
            } else {
                setStatus("Failed: " + ((resp && resp.error) || "unknown error"), "warn");
            }
        });
    }

    async function generate() {
        const stored = await getStored();
        const cfg = stored.userConfig || {};
        const apiKey = cfg.apiToken;
        if (!apiKey) {
            setStatus("No Gemini API key. Set it in the dashboard → Sync & API Settings.", "warn");
            return;
        }
        const guestMessage = guestInput.value.trim();
        if (!guestMessage) {
            setStatus("No guest message to reply to.", "warn");
            return;
        }
        const listings = stored.listings || [];
        const property = listings.find(l => l.id === propertySelect.value) || listings[0];
        const prompt = buildPrompt(property, guestMessage);

        setStatus("Generating reply in guest's language…", "busy");
        chrome.runtime.sendMessage({ type: "GEMINI_GENERATE", apiKey, prompt }, resp => {
            if (chrome.runtime.lastError) {
                setStatus("Error: " + chrome.runtime.lastError.message, "warn");
                return;
            }
            if (resp && resp.ok) {
                draftInput.value = resp.text;
                setStatus("Draft ready ✓ — review, then Insert or Copy.", "ok");
            } else {
                setStatus("Failed: " + ((resp && resp.error) || "unknown error"), "warn");
            }
        });
    }

    function buildPanel() {
        const launcher = document.createElement("button");
        launcher.className = "ha-launcher";
        launcher.title = "HostAutomate co-pilot";
        launcher.innerHTML = "🤖";
        document.body.appendChild(launcher);

        panelEl = document.createElement("div");
        panelEl.className = "ha-panel ha-hidden";
        panelEl.innerHTML = `
            <div class="ha-head">
                <span class="ha-title">🤖 HostAutomate <small>auto-reply</small></span>
                <button class="ha-x" title="Close">&times;</button>
            </div>
            <div class="ha-body">
                <label class="ha-label">Property context</label>
                <select class="ha-select ha-property"></select>

                <div class="ha-row">
                    <label class="ha-label">Guest's latest message</label>
                    <button class="ha-link ha-sync">↻ Sync from page</button>
                </div>
                <textarea class="ha-ta ha-guest" rows="3" placeholder="Auto-read from the open Airbnb thread, or paste here…"></textarea>

                <button class="ha-btn ha-generate">✨ Draft reply (auto-language)</button>

                <label class="ha-label">Suggested reply</label>
                <textarea class="ha-ta ha-draft" rows="6" placeholder="The AI draft appears here…"></textarea>

                <button class="ha-btn ha-ghost ha-rephrase">🔄 Improve & Rephrase</button>

                <div class="ha-actions">
                    <button class="ha-btn ha-insert">⤵ Insert into Airbnb box</button>
                    <button class="ha-btn ha-ghost ha-copy">⧉ Copy</button>
                </div>
                <div class="ha-status"></div>
            </div>
        `;
        document.body.appendChild(panelEl);

        guestInput = panelEl.querySelector(".ha-guest");
        draftInput = panelEl.querySelector(".ha-draft");
        propertySelect = panelEl.querySelector(".ha-property");
        statusEl = panelEl.querySelector(".ha-status");

        const open = () => {
            panelEl.classList.remove("ha-hidden");
            launcher.classList.add("ha-launcher-active");
            populateProperties();
            syncLatest(false);
        };
        const close = () => {
            panelEl.classList.add("ha-hidden");
            launcher.classList.remove("ha-launcher-active");
        };

        launcher.addEventListener("click", () => {
            panelEl.classList.contains("ha-hidden") ? open() : close();
        });
        panelEl.querySelector(".ha-x").addEventListener("click", close);
        panelEl.querySelector(".ha-sync").addEventListener("click", () => syncLatest(true));
        panelEl.querySelector(".ha-generate").addEventListener("click", generate);
        panelEl.querySelector(".ha-rephrase").addEventListener("click", rephrase);
        panelEl.querySelector(".ha-insert").addEventListener("click", () => {
            if (!draftInput.value.trim()) { setStatus("Nothing to insert yet.", "warn"); return; }
            insertIntoComposer(draftInput.value)
                ? setStatus("Inserted into Airbnb message box ✓", "ok")
                : setStatus("Couldn't find the message box — use Copy instead.", "warn");
        });
        panelEl.querySelector(".ha-copy").addEventListener("click", () => {
            navigator.clipboard.writeText(draftInput.value).then(
                () => setStatus("Copied ✓", "ok"),
                () => setStatus("Copy failed.", "warn")
            );
        });

        // Auto-sync when the open thread changes (debounced), only while panel is open.
        let t = null;
        const observer = new MutationObserver(() => {
            if (!panelEl || panelEl.classList.contains("ha-hidden")) return;
            clearTimeout(t);
            t = setTimeout(() => syncLatest(false), 600);
        });
        observer.observe(document.body, { childList: true, subtree: true, characterData: true });

        // If currently on messages page, show immediately.
        if (/\/hosting\/messages/i.test(window.location.href)) {
            open();
        }
        console.log("[HostAutomate] Co-pilot widget injected on page.");
    }

    let currentUrl = "";
    function checkUrl() {
        if (window.location.href !== currentUrl) {
            currentUrl = window.location.href;
            const isMsgPage = /\/hosting\/messages/i.test(currentUrl);
            console.log("[HostAutomate] URL changed:", currentUrl, "| Is messages page:", isMsgPage);
            if (isMsgPage) {
                if (!panelEl) {
                    buildPanel();
                } else {
                    panelEl.classList.remove("ha-hidden");
                    const launcher = document.querySelector(".ha-launcher");
                    if (launcher) launcher.classList.add("ha-launcher-active");
                    populateProperties();
                    syncLatest(false);
                }
            } else {
                if (panelEl) {
                    panelEl.classList.add("ha-hidden");
                    const launcher = document.querySelector(".ha-launcher");
                    if (launcher) launcher.classList.remove("ha-launcher-active");
                }
            }
        }
    }

    function boot() {
        // Airbnb is a single-page app; wait until <body> exists, then run.
        if (document.body) {
            checkUrl();
            setInterval(checkUrl, 1000);
        } else {
            requestAnimationFrame(boot);
        }
    }
    boot();
})();
