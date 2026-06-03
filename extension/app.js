
        // Global environment token details
        const apiKey = ""; // Keep empty to satisfy environment runtime parameters

        // User parameters preloaded with provided variables
        let userConfig = {
            apiToken: "",
            airbnbUrl: "https://www.airbnb.co.uk/hosting/messages/2551990293"
        };

        // Application State Management
        let state = {
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
                    rules: "14 guests maximum. No smoking indoors. Must climb stairs (no elevator). No smoke alarm or carbon monoxide detector on-site. Fully equipped open kitchen with induction cooker, microwave, kettle, and tableware. Washing machine available. Air-conditioning in all rooms. Ceiling fans. TV in living area. Everything you need is a 3-minute walk away: self-service laundry, 7-Eleven, 24-hour shopping mall, and a variety of restaurants."
                }
            ],
            rules: [
                {
                    id: "rule-1",
                    name: "Wi-Fi Credentials Requested",
                    keywords: ["wifi", "wi-fi", "internet", "ssid", "password", "network", "connect"],
                    template: "Hello {guest_name}! 📶 Here are the high-speed Wi-Fi network credentials for your stay at {property_name}:\n\nSSID/Network Name: {wifi_name}\nPassword: {wifi_pass}\n\nLet me know if you can connect successfully! Have an excellent rest of your day."
                },
                {
                    id: "rule-2",
                    name: "Check-In Procedures",
                    keywords: ["checkin", "check-in", "getting in", "access", "entry", "lockbox", "key", "arrive", "arrival"],
                    template: "Hi {guest_name}! 👋 Regarding your check-in for {property_name}:\n\n🕒 Official check-in time starts at {check_in_time}.\n\n🔑 Entry Access Directions:\n{access_instructions}\n\nSafe travels, and feel free to message if you hit any bumps on your way!"
                },
                {
                    id: "rule-3",
                    name: "Parking Accommodations",
                    keywords: ["parking", "garage", "park", "car", "vehicle", "driveway"],
                    template: "Hi {guest_name}! Here are the parking coordinates and guidelines for {property_name}:\n\n🚗 Parking Details:\n{parking_details}\n\nHope this makes parking hassle-free!"
                },
                {
                    id: "rule-4",
                    name: "Check-Out Timing Details",
                    keywords: ["checkout", "check-out", "leave", "leaving", "departure", "departing"],
                    template: "Hi {guest_name}, hoping you had a wonderful stay! Just as a quick reminder, official checkout is at {check_out_time}.\n\nBefore heading out, we kindly request:\n1. Please switch off any air conditioning, lights, and heat systems.\n2. Ensure all trash is securely bagged and the doors are fully locked.\n\nThank you so much, and safe journey home!"
                }
            ],
            chatHistory: [
                // Populated during interactive live simulation play
            ],
            auditLogs: [],
            currentSimActive: null // Tracks current process step state
        };

        // System Telemetry Tracking Variables
        let totalAutoReplies = 0;
        let ruleMatches = 0;
        let aiGenerations = 0;
        let estimatedHoursSaved = 0.0;

        // Custom Scenarios Mapping Database
        const scenarioPresets = {
            wifi: "Hey, hope your morning is going well. We just unpacked and settled in. Could you please share the Wi-Fi details so we can get our tablets online for work? Thank you!",
            checkin: "Hi there! We are on our way and should be arriving in about 45 minutes. Remind me what the check-in code is and how we get through the front gate or entry? Appreciate it!",
            towels: "Hello, we are loving the location! Quick question: is there a closet with extra clean bath towels and maybe some spare hand soap? We brought a toddler and went through our starting stack fast.",
            checkout: "Hi host, our flight doesn't leave until 6 PM tomorrow. Is there any chance we can request a late check-out or at least store our bags until 2 PM? Please let me know what is possible.",
            noise_complaint: "Hello, my name is Arthur. I live in the apartment below you. Your guests are playing extremely loud bass music and screaming on the balcony. It is 11:30 PM. Please tell them to turn it down immediately or I will contact building security."
        };

        // Persist listings/rules/credentials so the floating Airbnb widget
        // (content script) can read the exact same property context + API key.
        const STORAGE_KEY = "hostautomate_state";
        function persistState() {
            try {
                if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                    chrome.storage.local.set({
                        [STORAGE_KEY]: {
                            listings: state.listings,
                            rules: state.rules,
                            userConfig: userConfig
                        }
                    });
                }
            } catch (e) {
                console.warn("persistState failed", e);
            }
        }

        function loadPersistedState() {
            return new Promise(resolve => {
                try {
                    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
                        chrome.storage.local.get(STORAGE_KEY, data => {
                            const saved = data && data[STORAGE_KEY];
                            if (saved) {
                                if (Array.isArray(saved.listings)) state.listings = saved.listings;
                                if (Array.isArray(saved.rules)) state.rules = saved.rules;
                                if (saved.userConfig) userConfig = saved.userConfig;
                            }
                            resolve();
                        });
                        return;
                    }
                } catch (e) {
                    console.warn("loadPersistedState failed", e);
                }
                resolve();
            });
        }

        // Application Start Init
        window.onload = async function() {
            // Hydrate from previously saved state (shared with floating widget)
            await loadPersistedState();
            renderListings();
            renderRules();
            populateSimulationSelectors();
            updateTelemetryDisplay();
            applyScenarioPreset();
            // Seed storage on first run so the widget has data immediately.
            persistState();
        };

        // UI Toast Alert Helper
        function showToast(message, type = "success") {
            const container = document.getElementById("toast-container");
            const toast = document.createElement("div");
            toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-xs font-semibold transition-all duration-300 transform translate-y-2 opacity-0 pointer-events-auto max-w-sm ${
                type === "success" 
                ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                : type === "error"
                ? "bg-rose-50 border-rose-200 text-rose-800"
                : "bg-indigo-50 border-indigo-200 text-indigo-800"
            }`;
            
            const icon = type === "success" 
                ? '<i class="fa-solid fa-circle-check text-emerald-500 text-sm"></i>' 
                : type === "error"
                ? '<i class="fa-solid fa-triangle-exclamation text-rose-500 text-sm"></i>'
                : '<i class="fa-solid fa-bell text-indigo-500 text-sm"></i>';

            toast.innerHTML = `${icon} <span>${message}</span>`;
            container.appendChild(toast);

            // Trigger animation
            setTimeout(() => {
                toast.classList.remove("translate-y-2", "opacity-0");
            }, 10);

            // Dismiss automatic logic
            setTimeout(() => {
                toast.classList.add("opacity-0", "translate-y-1");
                setTimeout(() => {
                    toast.remove();
                }, 300);
            }, 3500);
        }

        // Tab Swapping Controller
        function switchTab(tabId) {
            document.querySelectorAll(".tab-content").forEach(el => el.classList.add("hidden"));
            document.getElementById(`tab-content-${tabId}`).classList.remove("hidden");

            // Update Tab active styling classes
            document.querySelectorAll(".tab-btn").forEach(btn => {
                btn.className = "tab-btn flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all duration-150";
            });

            const activeBtn = document.getElementById(`btn-tab-${tabId}`);
            if (activeBtn) {
                activeBtn.className = "tab-btn flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 bg-brand-50 text-brand-600";
            }
        }

        // Populate listings to lists and selects
        function renderListings() {
            const grid = document.getElementById("listings-grid");
            const dashList = document.getElementById("dashboard-listings-list");
            grid.innerHTML = "";
            dashList.innerHTML = "";

            state.listings.forEach(listing => {
                // Main Grid Card
                const card = document.createElement("div");
                card.className = "bg-white border border-slate-200 rounded-3xl p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between";
                card.innerHTML = `
                    <div class="space-y-3">
                        <div class="flex items-start justify-between">
                            <div class="flex items-center gap-2.5">
                                <div class="w-9 h-9 rounded-xl bg-brand-50 flex items-center justify-center text-brand-500">
                                    <i class="fa-solid fa-house text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-bold text-slate-900 text-sm">${listing.name}</h4>
                                    <p class="text-[11px] text-slate-400 line-clamp-1"><i class="fa-solid fa-location-dot"></i> ${listing.address}</p>
                                </div>
                            </div>
                            <div class="flex gap-1.5">
                                <button onclick="openListingModal('${listing.id}')" title="Edit Property Info" class="text-slate-400 hover:text-slate-700 bg-slate-50 p-2 rounded-lg border border-slate-200/50 hover:bg-slate-100 transition-all">
                                    <i class="fa-solid fa-pen text-xs"></i>
                                </button>
                                <button onclick="deleteListing('${listing.id}')" title="Delete Property Context" class="text-slate-400 hover:text-brand-600 bg-slate-50 p-2 rounded-lg border border-slate-200/50 hover:bg-brand-50 transition-all">
                                    <i class="fa-solid fa-trash text-xs"></i>
                                </button>
                            </div>
                        </div>
                        <div class="grid grid-cols-2 gap-2 text-xs bg-slate-50 p-3 rounded-xl border border-slate-100">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">SSID Network</span>
                                <span class="font-mono text-slate-700 font-semibold select-all">${listing.wifiSSID}</span>
                            </div>
                            <div>
                                <span class="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">Wi-Fi Password</span>
                                <span class="font-mono text-slate-700 font-semibold select-all">${listing.wifiPass}</span>
                            </div>
                        </div>
                        <div class="text-xs space-y-1.5 pt-1">
                            <p class="text-slate-600"><span class="font-bold text-slate-800">Check-in:</span> ${listing.checkin} | <span class="font-bold text-slate-800">Check-out:</span> ${listing.checkout}</p>
                            <p class="text-slate-600 line-clamp-2"><span class="font-bold text-slate-800">Parking details:</span> ${listing.parking}</p>
                        </div>
                    </div>
                `;
                grid.appendChild(card);

                // Dashboard summary row
                const dRow = document.createElement("div");
                dRow.className = "flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-slate-100/50 transition-all";
                dRow.innerHTML = `
                    <div class="flex items-center gap-2.5">
                        <i class="fa-solid fa-circle-check text-emerald-500 text-xs"></i>
                        <span class="font-semibold text-slate-700 text-xs">${listing.name}</span>
                    </div>
                    <span class="text-[10px] font-bold text-slate-400 bg-white border border-slate-200 px-2 py-0.5 rounded-full uppercase tracking-wider">Context Configured</span>
                `;
                dashList.appendChild(dRow);
            });

            // Badges update
            document.getElementById("badge-listings-count").innerText = state.listings.length;
            populateSimulationSelectors();
        }

        // Render Rules Engine list
        function renderRules() {
            const listContainer = document.getElementById("rules-list-container");
            const dashRulesList = document.getElementById("dashboard-rules-list");
            listContainer.innerHTML = "";
            dashRulesList.innerHTML = "";

            state.rules.forEach(rule => {
                // Rule Card Item
                const card = document.createElement("div");
                card.className = "bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4";
                
                // Construct keyword badges
                const kBadges = rule.keywords.map(k => `<span class="bg-indigo-50 border border-indigo-100 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono">${k}</span>`).join(" ");

                card.innerHTML = `
                    <div class="space-y-2 flex-1">
                        <div class="flex items-center gap-2">
                            <span class="w-2.5 h-2.5 rounded-full bg-indigo-500"></span>
                            <h4 class="font-bold text-slate-900 text-sm">${rule.name}</h4>
                        </div>
                        <div class="flex items-center gap-1 flex-wrap">
                            <span class="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Matching Keywords:</span>
                            ${kBadges}
                        </div>
                        <div class="bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-mono text-xs text-slate-500 leading-normal line-clamp-2 select-all">
                            ${rule.template}
                        </div>
                    </div>
                    <div class="flex gap-2 shrink-0 self-end md:self-center">
                        <button onclick="openRuleModal('${rule.id}')" class="text-slate-500 hover:text-slate-800 hover:bg-slate-50 p-2 rounded-lg border border-slate-200 transition-all text-xs font-bold flex items-center gap-1">
                            <i class="fa-solid fa-pen"></i> Edit
                        </button>
                        <button onclick="deleteRule('${rule.id}')" class="text-slate-500 hover:text-brand-600 hover:bg-brand-50 p-2 rounded-lg border border-slate-200 transition-all text-xs font-bold flex items-center gap-1">
                            <i class="fa-solid fa-trash"></i> Delete
                        </button>
                    </div>
                `;
                listContainer.appendChild(card);

                // Dashboard rule display
                const dRow = document.createElement("div");
                dRow.className = "flex items-center justify-between p-2.5 bg-slate-50 rounded-lg border border-slate-100";
                dRow.innerHTML = `
                    <div class="flex items-center gap-2 text-xs">
                        <i class="fa-solid fa-bolt text-indigo-500 text-xs"></i>
                        <span class="font-medium text-slate-700">${rule.name}</span>
                    </div>
                    <span class="text-[9px] font-bold text-slate-500 font-mono">(${rule.keywords.length} keywords)</span>
                `;
                dashRulesList.appendChild(dRow);
            });

            document.getElementById("badge-rules-count").innerText = state.rules.length;
        }

        // Populate property dropdowns for simulator
        function populateSimulationSelectors() {
            const select = document.getElementById("sim-property-select");
            select.innerHTML = "";
            state.listings.forEach(listing => {
                const opt = document.createElement("option");
                opt.value = listing.id;
                opt.innerText = listing.name;
                select.appendChild(opt);
            });
        }

        // Sync predefined scenarios to message fields
        function applyScenarioPreset() {
            const sc = document.getElementById("sim-scenario-select").value;
            const textEl = document.getElementById("sim-guest-message");
            const nameEl = document.getElementById("sim-guest-name");
            const statusEl = document.getElementById("sim-guest-status");

            if (sc === "custom") {
                textEl.value = "";
                textEl.focus();
                return;
            }

            // Map standard presets
            textEl.value = scenarioPresets[sc];

            // Change name & status dynamically to make simulator realistic
            if (sc === "wifi") {
                nameEl.value = "Michael";
                statusEl.value = "Currently In House";
            } else if (sc === "checkin") {
                nameEl.value = "Sarah";
                statusEl.value = "Arriving Today";
            } else if (sc === "towels") {
                nameEl.value = "David";
                statusEl.value = "Currently In House";
            } else if (sc === "checkout") {
                nameEl.value = "Jessica";
                statusEl.value = "Checked Out";
            } else if (sc === "noise_complaint") {
                nameEl.value = "Arthur (Neighbor)";
                statusEl.value = "Currently In House";
            }
        }

        // Telemetry calculation and view refresh
        function updateTelemetryDisplay() {
            document.getElementById("stat-total-replies").innerText = totalAutoReplies;
            document.getElementById("badge-total-replies").innerText = totalAutoReplies;
            document.getElementById("stat-rule-matches").innerText = ruleMatches;
            document.getElementById("stat-ai-generations").innerText = aiGenerations;
            document.getElementById("stat-hours-saved").innerText = estimatedHoursSaved.toFixed(1) + "h";
        }


        /* ==================== ASSISTANT WORKFLOW TRIGGER LOGIC ==================== */

        async function triggerAutoReplySimulation() {
            const propertyId = document.getElementById("sim-property-select").value;
            const guestName = document.getElementById("sim-guest-name").value.trim();
            const guestStatus = document.getElementById("sim-guest-status").value;
            const rawMessage = document.getElementById("sim-guest-message").value.trim();

            if (!rawMessage) {
                showToast("Please write or select a guest message first!", "error");
                return;
            }

            // Get property context profile
            const property = state.listings.find(l => l.id === propertyId);
            if (!property) {
                showToast("Error retrieving property profile data.", "error");
                return;
            }

            // Prepare UI state triggers
            resetVisualPipeline();
            setPipelineStatus("Processing Intent", "indigo");

            // Update simulator header
            document.getElementById("sim-header-name").innerText = guestName;
            document.getElementById("sim-header-status").innerText = guestStatus;
            document.getElementById("sim-header-property").innerText = property.name;
            document.getElementById("sim-avatar-letter").innerText = guestName.charAt(0);

            // Print guest bubble in phone messenger UI
            appendChatBubble("guest", rawMessage, guestName);

            // STAGE 1: KEYWORD MATCH ROUTER
            setPipelineVisualStep(1, true, "Scanning Keywords...");
            await delay(1000);

            let matchedRule = null;
            const normalizedText = rawMessage.toLowerCase();
            
            for (let rule of state.rules) {
                const found = rule.keywords.some(keyword => normalizedText.includes(keyword.toLowerCase()));
                if (found) {
                    matchedRule = rule;
                    break;
                }
            }

            // STAGE 2: PREPARE CONTEXT & GENERATE RESPONSE
            setPipelineVisualStep(2, true, `Context assembled: ${property.name}`);
            await delay(1000);

            let finalizedReplyDraft = "";
            let triggerSource = "";

            if (matchedRule) {
                // RULE BASED MATCH FOUND
                setPipelineVisualStep(3, true, `Rule Trigger Match: "${matchedRule.name}"`);
                triggerSource = `Rule: ${matchedRule.name}`;
                
                // Interpolate variables
                finalizedReplyDraft = interpolateTemplate(matchedRule.template, property, guestName);
                
                setPipelineStatus("Completed via Trigger Rule", "emerald");
                displayDraftResponse(finalizedReplyDraft, triggerSource);
            } else {
                // NO DIRECT TRIGGER RULE - INITIATE AI RESPONSE via GEMINI API
                setPipelineVisualStep(3, true, "No rule match. Triggering Gemini AI...");
                setPipelineStatus("Consulting Gemini AI...", "indigo");
                triggerSource = "Gemini 2.5 AI Agent";

                try {
                    finalizedReplyDraft = await fetchAIResponseFromGemini(property, guestName, rawMessage);
                    setPipelineStatus("Gemini AI Generated Draft", "emerald");
                    displayDraftResponse(finalizedReplyDraft, triggerSource);
                } catch (err) {
                    console.error(err);
                    setPipelineStatus("Gemini AI API Error", "rose");
                    setPipelineVisualStep(3, false, "Gemini call failed. Providing standard co-host fallback.");
                    
                    // Fallback to polite manual intercept
                    finalizedReplyDraft = `Hi ${guestName}, thanks for reaching out! I've received your inquiry regarding "${rawMessage.substring(0, 30)}..." at ${property.name}. I am looking into this directly right now and will follow up with full details in just a moment!`;
                    displayDraftResponse(finalizedReplyDraft, "Fallback System Trigger");
                }
            }
        }

        // Replace custom template variables
        function interpolateTemplate(template, property, guestName) {
            return template
                .replace(/{guest_name}/g, guestName)
                .replace(/{property_name}/g, property.name)
                .replace(/{wifi_name}/g, property.wifiSSID)
                .replace(/{wifi_pass}/g, property.wifiPass)
                .replace(/{check_in_time}/g, property.checkin)
                .replace(/{check_out_time}/g, property.checkout)
                .replace(/{access_instructions}/g, property.instructions)
                .replace(/{parking_details}/g, property.parking);
        }

        // Visual helpers
        function setPipelineStatus(text, color) {
            const badge = document.getElementById("pipeline-status-badge");
            badge.innerText = text;
            badge.className = `text-[10px] font-mono px-2 py-0.5 rounded font-bold bg-${color}-500/10 text-${color}-400`;
        }

        function setPipelineVisualStep(stepNum, isSuccess, detailsText) {
            const dot = document.getElementById(`step-${stepNum}-dot`);
            const details = document.getElementById(`step-${stepNum}-details`);

            if (isSuccess) {
                dot.className = "w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-[10px] font-bold text-white transition-colors";
                dot.innerHTML = '<i class="fa-solid fa-check"></i>';
            } else {
                dot.className = "w-5 h-5 rounded-full bg-rose-500 flex items-center justify-center text-[10px] font-bold text-white transition-colors";
                dot.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            }
            details.innerText = detailsText;
        }

        // Copy mechanism using document.execCommand fallback to work reliably inside iframes
        function copyTextToClipboard(text) {
            const textarea = document.createElement("textarea");
            textarea.value = text;
            textarea.style.top = "0";
            textarea.style.left = "0";
            textarea.style.position = "fixed";
            document.body.appendChild(textarea);
            textarea.focus();
            textarea.select();
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    showToast("Reply auto-copied to clipboard! Ready to paste into Airbnb.", "success");
                } else {
                    showToast("Auto-copy failed. Please highlight and copy manual draft.", "error");
                }
            } catch (err) {
                console.error("Fallback copy failed", err);
            }
            document.body.removeChild(textarea);
        }

        function resetVisualPipeline() {
            for (let i = 1; i <= 3; i++) {
                const dot = document.getElementById(`step-${i}-dot`);
                const details = document.getElementById(`step-${i}-details`);
                dot.className = "w-5 h-5 rounded-full bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 transition-colors";
                dot.innerText = i;
            }
            document.getElementById("step-1-details").innerText = "Scans guest text for matching trigger keys.";
            document.getElementById("step-2-details").innerText = "Prepares context for the target property profile.";
            document.getElementById("step-3-details").innerText = "Invokes Gemini model or compiles trigger rule output.";
        }

        // Post the drafted output to intercept box for review
        function displayDraftResponse(draftText, sourceLabel) {
            const draftArea = document.getElementById("assistant-draft-textarea");
            const triggerBadge = document.getElementById("trigger-badge");
            
            draftArea.value = draftText;
            triggerBadge.innerText = `Source: ${sourceLabel}`;
            document.getElementById("draft-char-count").innerText = `${draftText.length} characters`;

            // Prompt success
            showToast("Bot generated reply draft. Ready to review and approve!", "info");
        }

        // Simulate Sending/Approving the response & Auto-Copy to Clipboard
        function approveAndSendAutoReply() {
            const draftArea = document.getElementById("assistant-draft-textarea");
            const finalMessage = draftArea.value.trim();
            const guestName = document.getElementById("sim-guest-name").value.trim();
            const propertyId = document.getElementById("sim-property-select").value;
            const property = state.listings.find(l => l.id === propertyId);
            const source = document.getElementById("trigger-badge").innerText;

            if (!finalMessage) {
                showToast("No draft content exists to approve.", "error");
                return;
            }

            // Copy output to user's physical clipboard so they can directly paste on Airbnb.
            copyTextToClipboard(finalMessage);

            // Append bot reply to phone screen
            appendChatBubble("bot", finalMessage, "Co-Host Assistant");

            // Clear draft box
            draftArea.value = "";
            document.getElementById("draft-char-count").innerText = "0 chars";
            document.getElementById("trigger-badge").innerText = "Source: None";

            // Track Statistics Telemetry
            totalAutoReplies++;
            if (source.includes("Rule")) {
                ruleMatches++;
            } else if (source.includes("Gemini")) {
                aiGenerations++;
            }
            estimatedHoursSaved += 0.25; // 15 mins saved per automated/AI message

            updateTelemetryDisplay();

            // Append live logging activity entry
            appendSystemAuditLog(property.name, source, finalMessage);
        }

        // Append visual text bubbles to phone simulator
        function appendChatBubble(sender, text, name) {
            const chatBox = document.getElementById("sim-chat-box");
            const bubbleWrap = document.createElement("div");
            
            if (sender === "guest") {
                bubbleWrap.className = "flex flex-col gap-1 items-start max-w-[85%] self-start";
                bubbleWrap.innerHTML = `
                    <span class="text-[10px] text-slate-400 font-bold ml-1">${name}</span>
                    <div class="bg-slate-200 text-slate-800 text-sm px-4 py-3 rounded-2xl rounded-tl-sm leading-relaxed shadow-sm">
                        ${text.replace(/\n/g, "<br>")}
                    </div>
                `;
            } else {
                bubbleWrap.className = "flex flex-col gap-1 items-end max-w-[85%] self-end";
                bubbleWrap.innerHTML = `
                    <span class="text-[10px] text-brand-500 font-bold mr-1 flex items-center gap-1">
                        <i class="fa-solid fa-robot"></i> ${name}
                    </span>
                    <div class="bg-brand-500 text-white text-sm px-4 py-3 rounded-2xl rounded-tr-sm leading-relaxed shadow-sm">
                        ${text.replace(/\n/g, "<br>")}
                    </div>
                `;
            }

            chatBox.appendChild(bubbleWrap);
            // Autoscroll
            chatBox.scrollTop = chatBox.scrollHeight;
        }

        function clearChatSimulator() {
            const chatBox = document.getElementById("sim-chat-box");
            chatBox.innerHTML = `
                <div class="self-center bg-slate-200/60 text-[11px] text-slate-600 px-3 py-1.5 rounded-full text-center max-w-sm">
                    Host Chat channel established. Choose an incoming query model on the left to simulate automated co-hosting.
                </div>
            `;
            document.getElementById("assistant-draft-textarea").value = "";
            document.getElementById("draft-char-count").innerText = "0 chars";
            document.getElementById("trigger-badge").innerText = "Source: None";
            resetVisualPipeline();
            setPipelineStatus("Awaiting Query", "slate");
            showToast("Simulation board reset.", "info");
        }


        /* ==================== GEMINI API INTEGRATION ==================== */

        async function fetchAIResponseFromGemini(property, guestName, messageText) {
            // Context payload details assembled for property
            const systemPrompt = `You are a world-class, professional, ultra-polite Airbnb Co-Host. 
Your tone is warm, professional, host-grade, and succinct. 
Your goal is to reply to the guest's message using the specific listing details provided in the Context below. 
Rules:
- Never make up information (e.g., wifi credentials, check-in instructions, parking, rules) that is not specified in the properties context.
- If you do not have information in the context to answer the guest's request (e.g. they ask about a broken TV or pool heater and it's not in the context rules), reply politely stating that you are looking into it and will notify the owner to get it sorted out immediately.
- Use the Guest's Name if available to personalize.
- Avoid writing essays. Keep it clear, friendly, and formatted nicely with paragraph breaks and bullet points if needed.`;

            const listingContext = `Listing Context Profile Details:
- Name of Property: ${property.name}
- Full Address Location: ${property.address}
- WiFi Network SSID: ${property.wifiSSID}
- WiFi Network Password: ${property.wifiPass}
- Standard Check-in Time: ${property.checkin}
- Standard Check-out Time: ${property.checkout}
- Entry Access Instructions: ${property.instructions}
- Parking Information: ${property.parking}
- General House Rules / Supplies / Extra Towels Locations: ${property.rules}`;

            const userQuery = `Guest Name: ${guestName}
Guest Incoming Message: "${messageText}"

Please draft the perfect Co-Host response using the context rules. Do not include any pre-text like "Here is your response:" or "Draft reply:". Start the reply directly.`;

            // Setup active API target credentials
            const activeKey = userConfig.apiToken || apiKey;
            if (!activeKey) {
                throw new Error("No operational API credentials supplied.");
            }

            // Prepare API call payload
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${activeKey}`;
            const payload = {
                contents: [{ 
                    parts: [{ text: `${systemPrompt}\n\n${listingContext}\n\n${userQuery}` }] 
                }]
            };

            // Call with exponential backoff strategy (up to 5 retries)
            let resultText = "";
            let delayTime = 1000;
            let success = false;

            for (let retry = 0; retry < 5; retry++) {
                try {
                    const response = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload)
                    });

                    if (!response.ok) {
                        throw new Error(`API returned HTTP status ${response.status}`);
                    }

                    const jsonResult = await response.json();
                    resultText = jsonResult.candidates?.[0]?.content?.parts?.[0]?.text;
                    if (resultText) {
                        success = true;
                        break;
                    } else {
                        throw new Error("Invalid response format or empty candidates content.");
                    }
                } catch (err) {
                    if (retry === 4) throw err; // propagate up on final fail
                    await delay(delayTime);
                    delayTime *= 2; // exponential step scaling
                }
            }

            return resultText;
        }

        // Simple delay helper
        function delay(ms) {
            return new Promise(resolve => setTimeout(resolve, ms));
        }


        /* ==================== AUDIT LOGS CONTROL ==================== */

        function appendSystemAuditLog(listingName, triggerSource, draftedReply) {
            const tableBody = document.getElementById("audit-logs-table-body");
            const dashActivityFeed = document.getElementById("dashboard-activity-feed");
            const now = new Date();
            const timeString = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            
            // Generate raw data entry
            const logEntry = {
                time: timeString,
                listing: listingName,
                trigger: triggerSource,
                draft: draftedReply
            };

            state.auditLogs.unshift(logEntry);

            // Re-render Activity dashboard
            if (state.auditLogs.length === 1) {
                dashActivityFeed.innerHTML = "";
            }

            // Create dashboard view table row
            const dashRow = document.createElement("tr");
            dashRow.className = "border-b border-slate-50 text-slate-600";
            dashRow.innerHTML = `
                <td class="py-2 font-mono text-[10px]">${timeString}</td>
                <td class="py-2 text-xs font-semibold text-slate-800">${listingName}</td>
                <td class="py-2 text-xs text-slate-500">${draftedReply.substring(0, 45)}...</td>
                <td class="py-2 text-center">
                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded ${triggerSource.includes('Rule') ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' : 'bg-pink-50 text-pink-700 border border-pink-100'}">
                        ${triggerSource}
                    </span>
                </td>
                <td class="py-2 text-right text-xs font-bold text-emerald-500">98.4% Match</td>
            `;
            if (dashActivityFeed.children.length >= 5) {
                dashActivityFeed.removeChild(dashActivityFeed.lastChild);
            }
            dashActivityFeed.insertBefore(dashRow, dashActivityFeed.firstChild);

            // Render Audit tab table
            renderAuditLogsTable();
        }

        function renderAuditLogsTable() {
            const container = document.getElementById("audit-logs-table-body");
            container.innerHTML = "";

            if (state.auditLogs.length === 0) {
                container.innerHTML = `
                    <tr>
                        <td colspan="5" class="p-8 text-center text-slate-400 font-sans">
                            <i class="fa-solid fa-hard-drive block text-3xl text-slate-200 mb-2"></i>
                            No logs recorded. Engage the chat simulator to watch automated workflows execute in real-time.
                        </td>
                    </tr>
                `;
                return;
            }

            state.auditLogs.forEach(log => {
                const tr = document.createElement("tr");
                tr.className = "hover:bg-slate-50/50";
                tr.innerHTML = `
                    <td class="p-4 text-slate-400">${log.time}</td>
                    <td class="p-4 font-semibold text-slate-800">${log.listing}</td>
                    <td class="p-4">
                        <span class="px-2 py-1 rounded text-[10px] font-bold ${log.trigger.includes('Rule') ? 'bg-indigo-100 text-indigo-800' : 'bg-pink-100 text-pink-800'}">
                            ${log.trigger}
                        </span>
                    </td>
                    <td class="p-4 max-w-xs truncate text-slate-500" title="${log.draft}">${log.draft}</td>
                    <td class="p-4 text-right text-slate-500 font-bold">Processed Successfully</td>
                `;
                container.appendChild(tr);
            });
        }

        function clearAuditLogs() {
            state.auditLogs = [];
            renderAuditLogsTable();
            document.getElementById("dashboard-activity-feed").innerHTML = `
                <tr>
                    <td colspan="5" class="py-8 text-center text-slate-400 text-xs">
                        <i class="fa-solid fa-circle-nodes block text-2xl text-slate-200 mb-2"></i>
                        No assistant activity captured yet. Use the Bot Playground to start simulating!
                    </td>
                </tr>
            `;
            showToast("Audit history log has been cleared.", "info");
        }


        /* ==================== MODAL CRUD & SETTINGS ACTIONS ==================== */

        // Integration Settings Controls
        function openSyncSettings() {
            document.getElementById("sync-api-key").value = userConfig.apiToken;
            document.getElementById("sync-airbnb-url").value = userConfig.airbnbUrl;
            document.getElementById("sync-settings-modal").classList.remove("hidden");
        }

        function closeSyncSettings() {
            document.getElementById("sync-settings-modal").classList.add("hidden");
        }

        function saveSyncSettings(e) {
            e.preventDefault();
            userConfig.apiToken = document.getElementById("sync-api-key").value.trim();
            userConfig.airbnbUrl = document.getElementById("sync-airbnb-url").value.trim();
            
            // Sync dynamic buttons/href targets
            document.getElementById("btn-open-airbnb").setAttribute("href", userConfig.airbnbUrl);
            
            persistState();
            closeSyncSettings();
            showToast("Integration credentials updated and synced successfully!", "success");
        }

        // Properties Context Profile Forms
        function openListingModal(id = "") {
            const title = document.getElementById("listing-modal-title");
            const form = document.getElementById("listing-form");
            form.reset();

            if (id) {
                title.innerText = "Edit Property Context Profile";
                const listing = state.listings.find(l => l.id === id);
                document.getElementById("listing-edit-id").value = listing.id;
                document.getElementById("list-name").value = listing.name;
                document.getElementById("list-address").value = listing.address;
                document.getElementById("list-wifi-ssid").value = listing.wifiSSID;
                document.getElementById("list-wifi-pass").value = listing.wifiPass;
                document.getElementById("list-checkin").value = listing.checkin;
                document.getElementById("list-checkout").value = listing.checkout;
                document.getElementById("list-instructions").value = listing.instructions;
                document.getElementById("list-parking").value = listing.parking;
                document.getElementById("list-rules").value = listing.rules;
            } else {
                title.innerText = "Create Property Context Profile";
                document.getElementById("listing-edit-id").value = "";
            }

            document.getElementById("listing-modal").classList.remove("hidden");
        }

        function closeListingModal() {
            document.getElementById("listing-modal").classList.add("hidden");
        }

        function saveListing(e) {
            e.preventDefault();
            const id = document.getElementById("listing-edit-id").value;
            
            const listingData = {
                id: id || `listing-${Date.now()}`,
                name: document.getElementById("list-name").value,
                address: document.getElementById("list-address").value,
                wifiSSID: document.getElementById("list-wifi-ssid").value,
                wifiPass: document.getElementById("list-wifi-pass").value,
                checkin: document.getElementById("list-checkin").value,
                checkout: document.getElementById("list-checkout").value,
                instructions: document.getElementById("list-instructions").value,
                parking: document.getElementById("list-parking").value,
                rules: document.getElementById("list-rules").value,
            };

            if (id) {
                const idx = state.listings.findIndex(l => l.id === id);
                state.listings[idx] = listingData;
                showToast("Property context assets successfully updated!");
            } else {
                state.listings.push(listingData);
                showToast("New property successfully registered to AI database!");
            }

            persistState();
            closeListingModal();
            renderListings();
        }

        // Rules Engine Forms
        function openRuleModal(id = "") {
            const title = document.getElementById("rule-modal-title");
            const form = document.getElementById("rule-form");
            form.reset();

            if (id) {
                title.innerText = "Edit Keyword Trigger Rule";
                const rule = state.rules.find(r => r.id === id);
                document.getElementById("rule-edit-id").value = rule.id;
                document.getElementById("rule-name").value = rule.name;
                document.getElementById("rule-keywords").value = rule.keywords.join(", ");
                document.getElementById("rule-template").value = rule.template;
            } else {
                title.innerText = "Create Keyword Trigger Rule";
                document.getElementById("rule-edit-id").value = "";
            }

            document.getElementById("rule-modal").classList.remove("hidden");
        }

        function closeRuleModal() {
            document.getElementById("rule-modal").classList.add("hidden");
        }

        function saveRule(e) {
            e.preventDefault();
            const id = document.getElementById("rule-edit-id").value;
            
            // Clean up keyword inputs
            const rawKeys = document.getElementById("rule-keywords").value;
            const keywordsArr = rawKeys.split(",").map(k => k.trim()).filter(k => k.length > 0);

            const ruleData = {
                id: id || `rule-${Date.now()}`,
                name: document.getElementById("rule-name").value,
                keywords: keywordsArr,
                template: document.getElementById("rule-template").value
            };

            if (id) {
                const idx = state.rules.findIndex(r => r.id === id);
                state.rules[idx] = ruleData;
                showToast("Automation trigger rule updated.");
            } else {
                state.rules.push(ruleData);
                showToast("New instant trigger keyword rule established!");
            }

            persistState();
            closeRuleModal();
            renderRules();
        }

    

/* ==================== CHROME EXTENSION EVENT WIRING ====================
   Manifest V3 extension pages block inline event handlers
   (onclick / onchange / onsubmit). This delegated dispatcher reads the
   original handler attribute at event time and invokes the matching global
   function. Because it listens on document, it also works for nodes that are
   rendered dynamically (listing cards, rule cards, etc.). */
(function () {
    function dispatchInline(code, event) {
        if (!code) return;
        var m = code.match(/^\s*([A-Za-z_$][\w$]*)\s*\((.*)\)\s*;?\s*$/);
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
