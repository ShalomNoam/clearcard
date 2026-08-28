export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY" });
  }

  // שימוש בגרסת v1 היציבה עבור 1.5-flash
  const model = process.env.GEMINI_MODEL || "gemini-1.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;

  const { messages, system } = req.body || {};

  const contents = (messages || []).map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content || "" }]
  }));

  const payload = {
    contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "שלום" }] }]
  };

  if (system) {
    payload.systemInstruction = {
      parts: [{ text: system }]
    };
  }

  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (response.ok) {
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "לא התקבלה תשובה מהמודל.";
        return res.status(200).json({ text: replyText });
      }

      if (response.status === 503 && attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }

      console.error("Gemini Error:", data);
      return res.status(response.status).json({
        error: data.error?.message || `API error ${response.status}`
      });
    } catch (err) {
      lastError = err;
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
        continue;
      }
    }
  }

  return res.status(500).json({ error: lastError?.message || "Internal server error" });
}
