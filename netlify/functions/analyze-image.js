export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  if (!apiKey) {
    return json({ error: "Missing GEMINI_API_KEY" }, 500);
  }

  try {
    const { imageBase64, mimeType } = JSON.parse(event.body || "{}");
    if (!imageBase64 || !mimeType) return json({ error: "Invalid image payload" }, 400);

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "你是专业图像提示词分析师。请根据图片生成稳定 JSON，字段必须为 title、tags、chinesePrompt、englishPrompt。tags 最多 3 个。不要输出 markdown，不要输出 JSON 以外的任何内容。"
                },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBase64
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.55,
            response_mime_type: "application/json"
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      return json({ error: "Gemini request failed" }, 502);
    }

    const payload = await geminiResponse.json();
    const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const parsed = safeParse(text);

    return json({
      title: String(parsed.title || "未命名 Prompt"),
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 3).map(String) : [],
      chinesePrompt: String(parsed.chinesePrompt || ""),
      englishPrompt: String(parsed.englishPrompt || "")
    });
  } catch {
    return json({ error: "Analyze failed" }, 500);
  }
};

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  };
}
