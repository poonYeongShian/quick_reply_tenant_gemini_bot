// Opens the full dashboard in a new tab when the toolbar icon is clicked.
// (A popup is too small for this multi-tab dashboard, so a tab is used.)
chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html") });
});

// The floating content script cannot call the Gemini endpoint directly
// (page CSP / CORS). The service worker holds the host permission, so it
// performs the fetch on the content script's behalf and returns the text.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "GEMINI_GENERATE") {
    generateReply(msg.apiKey, msg.prompt)
      .then(text => sendResponse({ ok: true, text }))
      .catch(err => sendResponse({ ok: false, error: String((err && err.message) || err) }));
    return true; // keep the message channel open for the async response
  }
});

async function generateReply(apiKey, prompt) {
  if (!apiKey) throw new Error("No Gemini API key configured.");
  const url =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=" +
    encodeURIComponent(apiKey);
  const payload = { contents: [{ parts: [{ text: prompt }] }] };

  let delay = 800;
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error("Gemini HTTP " + res.status);
      const json = await res.json();
      const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Empty response from Gemini.");
      return text.trim();
    } catch (e) {
      lastErr = e;
      if (attempt < 3) {
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
      }
    }
  }
  throw lastErr;
}
