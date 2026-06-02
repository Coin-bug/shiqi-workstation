export const handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return json({}, 200);
  }

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

    const result = await analyzeWithRetry({ apiKey, model, imageBase64, mimeType });
    return json(result);
  } catch (error) {
    return json({ error: "Analyze failed", detail: String(error?.message || error || "") }, 500);
  }
};

async function analyzeWithRetry({ apiKey, model, imageBase64, mimeType }) {
  let lastError = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const payload = await requestGemini({ apiKey, model, imageBase64, mimeType, attempt });
      const text = payload?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const parsed = safeParse(text);
      const result = normalizeResult(parsed);
      if (!result.chinesePrompt && !result.englishPrompt) {
        throw new Error("empty analyze result");
      }
      return result;
    } catch (error) {
      lastError = error;
      if (attempt >= 3 || !shouldRetryGeminiError(error)) {
        throw error;
      }
      await wait(350 * attempt);
    }
  }

  throw lastError || new Error("Analyze failed");
}

async function requestGemini({ apiKey, model, imageBase64, mimeType, attempt }) {
  const controller = new AbortController();
  let didTimeout = false;
  const timeoutId = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, 40000);

  try {
    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text:
                    "你是专业图像提示词分析师。请严格输出 JSON 对象，字段必须为 title、tags、chinesePrompt、englishPrompt。title 为字符串；tags 为最多 3 个字符串数组；chinesePrompt 与 englishPrompt 必须是完整字符串。不要输出 markdown，不要输出 JSON 以外的任何内容。"
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
            temperature: attempt > 1 ? 0.35 : 0.55,
            response_mime_type: "application/json"
          }
        })
      }
    );

    if (!geminiResponse.ok) {
      const detail = await geminiResponse.text().catch(() => "");
      const error = new Error(`Gemini request failed: ${geminiResponse.status}${detail ? ` ${detail}` : ""}`);
      error.status = geminiResponse.status;
      throw error;
    }

    return await geminiResponse.json();
  } catch (error) {
    if (didTimeout) {
      const timeoutError = new Error("timeout");
      timeoutError.status = 408;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function safeParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : {};
  }
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.slice(0, 3).map((tag) => String(tag).trim()).filter(Boolean);
  }

  return String(tags || "")
    .split(/[;；,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 3);
}

function normalizeResult(parsed) {
  return {
    title: String(parsed?.title || "未命名 Prompt").trim() || "未命名 Prompt",
    tags: normalizeTags(parsed?.tags),
    chinesePrompt: String(parsed?.chinesePrompt || "").trim(),
    englishPrompt: String(parsed?.englishPrompt || "").trim()
  };
}

function shouldRetryGeminiError(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || "");
  if (status === 400 || status === 401 || status === 403) return false;
  return status === 429 || status >= 500 || message.includes("timeout") || message.includes("empty analyze result");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function json(body, status = 200) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type"
    },
    body: JSON.stringify(body)
  };
}
