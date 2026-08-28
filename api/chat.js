export default async function handler(req, res) {
  // אישור לפניות POST בלבד
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing GEMINI_API_KEY environment variable" });
  }

  const model = process.env.GEMINI_MODEL || "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  try {
    const { messages, system } = req.body || {};

    // המרת היסטוריית ההודעות למבנה של Gemini
    const contents = (messages || []).map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content || "" }]
    }));

    // בניית גוף הבקשה
    const payload = {
      contents: contents.length > 0 ? contents : [{ role: "user", parts: [{ text: "Hello" }] }]
    };

    if (system) {
      payload.systemInstruction = {
        parts: [{ text: system }]
      };
    }

    // שליחת הבקשה ל-Gemini API
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", data);
      return res.status(response.status).json({ 
        error: data.error?.message || "Failed to communicate with Gemini API" 
      });
    }

    const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || "לא התקבלה תשובה מהמודל.";
    return res.status(200).json({ text: replyText });

  } catch (err) {
    console.error("Server Error:", err);
    return res.status(500).json({ error: err.message || "Internal server error" });
  }
}
