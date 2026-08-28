// api/chat.js
// Vercel Serverless Function (Node.js runtime).
// Proxies chat requests from the frontend to Google Gemini, so the
// GEMINI_API_KEY never has to be exposed in client-side code.
//
// Frontend sends:  { system: "<system prompt>", messages: [{role:'user'|'assistant', content:'...'}] }
// This function returns: { text: "<model reply>" }  on success
//                          { error: "<message>" }     on failure

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-3.1-flash-lite";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// Gemini returns 503 when the model is temporarily overloaded and 429 when
// a rate limit is hit - both are usually transient, so retry a few times
// with exponential backoff before giving up.
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 500;
const RETRYABLE_STATUSES = new Set([429, 503]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchGeminiWithRetry(url, options) {
  let geminiRes, data;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    geminiRes = await fetch(url, options);
    data = await geminiRes.json();

    if (!RETRYABLE_STATUSES.has(geminiRes.status) || attempt === MAX_ATTEMPTS) {
      return { geminiRes, data };
    }

    await sleep(RETRY_BASE_DELAY_MS * 2 ** (attempt - 1));
  }

  return { geminiRes, data };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "GEMINI_API_KEY is not configured on the server (Vercel > Settings > Environment Variables)." });
    return;
  }

  const { system, messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "'messages' array is required." });
    return;
  }

  // Translate the Anthropic-style {role:'user'|'assistant', content} shape
  // the frontend already uses into Gemini's {role:'user'|'model', parts:[{text}]} shape.
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: String(m.content || "") }],
  }));

  const body = {
    contents,
    generationConfig: { maxOutputTokens: 1000 },
  };
  if (system) {
    body.systemInstruction = { parts: [{ text: system }] };
  }

  try {
    // API key goes in the header, not the URL - a query-string key can end
    // up captured in Vercel's own request/observability logs.
    const { geminiRes, data } = await fetchGeminiWithRetry(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!geminiRes.ok) {
      let message;
      if (geminiRes.status === 503) {
        message = "Gemini is currently overloaded and did not recover after retrying. Please try again in a moment.";
      } else if (geminiRes.status === 429) {
        message = "Gemini rate limit reached and did not recover after retrying. Please try again in a moment.";
      } else {
        message = (data && data.error && data.error.message) || `Gemini API error (${geminiRes.status})`;
      }
      res.status(geminiRes.status).json({ error: message });
      return;
    }

    const candidate = data.candidates && data.candidates[0];

    if (!candidate) {
      res.status(502).json({ error: "No response candidate returned by Gemini." });
      return;
    }

    // Gemini blocks some responses on safety/recitation grounds instead of
    // erroring - surface that distinctly so the frontend can show something
    // sensible instead of crashing on an empty string.
    if (candidate.finishReason === "SAFETY" || candidate.finishReason === "RECITATION") {
      res.status(200).json({ text: "", blocked: true, reason: candidate.finishReason });
      return;
    }

    const text =
      (candidate.content &&
        candidate.content.parts &&
        candidate.content.parts.map((p) => p.text || "").join("")) ||
      "";

    res.status(200).json({ text });
  } catch (err) {
    console.error("Gemini request failed:", err);
    res.status(500).json({ error: "Failed to reach Gemini API." });
  }
};
