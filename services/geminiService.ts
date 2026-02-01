import { GoogleGenAI, Type } from "@google/genai";
import type { ResourceType } from "../types";

const BOOKING_TASK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    groupName: { type: Type.STRING, description: "Tour group name or order ID" },
    startDate: { type: Type.STRING, description: "Start date (YYYY-MM-DD)" },
    endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
    paxCount: { type: Type.INTEGER, description: "Number of people" },
    guideLanguage: { type: Type.STRING, description: "Preferred guide language" },
    estimatedIncome: { type: Type.NUMBER, description: "Total estimated revenue (AED)" },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: "One of: Hotel, Restaurant, Attraction, Vehicle, Guide, Others",
          },
          description: { type: Type.STRING, description: "Details of the resource" },
          date: { type: Type.STRING, description: "Date of service (YYYY-MM-DD)" },
          time: { type: Type.STRING, description: "Start time (HH:MM)" },
          endTime: { type: Type.STRING, description: "End time (HH:MM)" },
          estimatedCost: { type: Type.NUMBER, description: "Estimated booking cost (AED)" },
          notes: { type: Type.STRING, description: "Specific requirements" },
        },
        required: ["type", "description", "date"],
      },
    },
  },
  required: ["groupName", "startDate", "endDate", "tasks"],
} as const;

type VisualAsset = { data: string; mimeType: string };

const getGeminiKey = (): string => {
  // ✅ 前端（Vite）正确读取方式：只会暴露 VITE_ 开头
  const key = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
  return (key || "").trim();
};

export const parseItinerary = async (text: string, visualAsset?: VisualAsset) => {
  const apiKey = getGeminiKey();
  if (!apiKey) {
    throw new Error(
      "Missing VITE_GEMINI_API_KEY. Please set it in Vercel Environment Variables and redeploy."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  const parts: any[] = [
    {
      text:
        `You are an expert UAE and Oman DMC operations manager. Parse itinerary data into a structured format.\n` +
        `- Extract all services (Hotels, Vehicles, Guides, etc.).\n` +
        `- Estimate realistic local AED costs if missing.\n` +
        `- Return ONLY valid JSON matching the provided schema.\n\n` +
        `Itinerary Content:\n${text || "See attached file."}`,
    },
  ];

  if (visualAsset) {
    parts.push({
      inlineData: {
        data: visualAsset.data,
        mimeType: visualAsset.mimeType,
      },
    });
  }

  try {
    const response = await ai.models.generateContent({
      // ✅ 用官方可用模型名（别用 gemini-3-pro-preview 这种很可能不存在的）
      model: "gemini-2.0-flash",
      contents: [{ role: "user", parts }],
      config: {
        responseMimeType: "application/json",
        responseSchema: BOOKING_TASK_SCHEMA,
      },
    });

    let jsonStr = response.text || "";

    // 有时仍会带 ```json
    if (jsonStr.includes("```")) {
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "");
    }

    if (!jsonStr.trim()) throw new Error("Empty response from Gemini.");

    return JSON.parse(jsonStr.trim());
  } catch (err: any) {
    // 让你在 Vercel / 浏览器控制台看到真实错误原因
    console.error("Gemini parse error:", err);
    throw err;
  }
};
