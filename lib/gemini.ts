import type { PromptDefinition } from "@/lib/types";

const DEFAULT_TIMEOUT_MS = 60_000;
const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
  error?: {
    message?: string;
  };
}

export function isGeminiConfigured() {
  return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
}

export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";
}

function withTimeout() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  return {
    signal: controller.signal,
    done: () => clearTimeout(timeoutId),
  };
}

async function callGemini(input: {
  prompt: PromptDefinition;
  contents: string;
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  maxOutputTokens?: number;
}) {
  if (!isGeminiConfigured()) {
    return null;
  }

  const timeout = withTimeout();
  const url = `${GEMINI_API_BASE_URL}/models/${input.prompt.model}:generateContent?key=${encodeURIComponent(
    getGeminiApiKey(),
  )}`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      signal: timeout.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: input.prompt.developerMessage }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input.contents }],
          },
        ],
        generationConfig: {
          responseMimeType: input.responseMimeType ?? "text/plain",
          temperature: input.temperature ?? 0.2,
          maxOutputTokens: input.maxOutputTokens,
        },
      }),
    });

    const payload = (await response.json()) as GeminiGenerateResponse;
    if (!response.ok) {
      throw new Error(payload.error?.message ?? `Gemini request failed: ${response.status}`);
    }

    const text = payload.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("")
      .trim();

    return text || null;
  } finally {
    timeout.done();
  }
}

export async function generateGeminiText(input: {
  prompt: PromptDefinition;
  contents: string;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  return callGemini({
    ...input,
    responseMimeType: "text/plain",
  });
}

export async function generateGeminiJson<T>(input: {
  prompt: PromptDefinition;
  contents: string;
  temperature?: number;
  maxOutputTokens?: number;
}) {
  const text = await callGemini({
    ...input,
    responseMimeType: "application/json",
    temperature: input.temperature ?? 0,
  });

  if (!text) {
    return null;
  }

  return JSON.parse(text) as T;
}
