// api/chat.js
// Vercel Serverless Function (Node.js runtime).
// Proxies chat requests from the frontend to Google Gemini, so the
// GEMINI_API_KEY never has to be exposed in client-side code.
//
// Frontend sends:  { system: "<system prompt>", messages: [{role:'user'|'assistant', content:'...'}] }
// This function returns: { text: "<model reply>" }  on success
//                          { error: "<message>" }     on failure
//
// Uses a direct fetch() call to the Gemini REST API (no extra dependency
// needed - Node 18+ on Vercel has global fetch). If you'd rather use the
// official SDK, swap the fetch block below for the @google/genai client
// (see the commented example at the bottom of this file).

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

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
    const geminiRes = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      const message = (data && data.error && data.error.message) || `Gemini API error (${geminiRes.status})`;
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

/* ---------------------------------------------------------------------
   Alternative: using the official @google/genai SDK instead of fetch().
   If you prefer this, run `npm install @google/genai`, add "type": "module"
   to package.json, and replace the handler above with something like:

   import { GoogleGenAI } from "@google/genai";

   export default async function handler(req, res) {
     if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });
     const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
     const { system, messages } = req.body || {};
     const contents = messages.map(m => ({
       role: m.role === "assistant" ? "model" : "user",
       parts: [{ text: m.content }]
     }));
     const response = await ai.models.generateContent({
       model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
       contents,
       config: { systemInstruction: system, maxOutputTokens: 1000 }
     });
     res.status(200).json({ text: response.text });
   }
--------------------------------------------------------------------- */
