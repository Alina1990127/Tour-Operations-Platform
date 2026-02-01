import { GoogleGenAI, Type } from "@google/genai";

const BOOKING_TASK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    groupName: { type: Type.STRING, description: "Tour group name or order ID" },
    startDate: { type: Type.STRING, description: "Start date (YYYY-MM-DD)" },
    endDate: { type: Type.STRING, description: "End date (YYYY-MM-DD)" },
    paxCount: { type: Type.INTEGER, description: "Number of people" },
    guideLanguage: { type: Type.STRING, description: "Preferred guide language" },
    estimatedIncome: { type: Type.NUMBER, description: "Total estimated revenue from this group (in AED)" },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            description: "One of: Hotel, Restaurant, Attraction, Vehicle, Guide, Others",
          },
          description: { type: Type.STRING, description: "Details of the resource (e.g. Hotel name, Attraction name)" },
          date: { type: Type.STRING, description: "Date of service (YYYY-MM-DD)" },
          time: { type: Type.STRING, description: "Start time (HH:MM)" },
          endTime: { type: Type.STRING, description: "End time (HH:MM)" },
          estimatedCost: { type: Type.NUMBER, description: "Estimated booking cost for this task (in AED)" },
          notes: { type: Type.STRING, description: "Specific requirements (e.g. bed type, meal preference)" },
        },
        required: ["type", "description", "date"],
      },
    },
  },
  required: ["groupName", "startDate", "endDate", "tasks"],
} as const;

/**
 * Vite 前端项目：只能稳定从 import.meta.env 读取
 * 注意：变量名必须以 VITE_ 开头才会被注入到前端
 */
function getEnv(key: string): string {
  // 这里做一层保护，避免某些构建/测试环境报错
  try {
    const v = (import.meta as any)?.env?.[key];
    return typeof v === "string" ? v : "";
  } catch {
    return "";
  }
}

const apiKey = getEnv("VITE_API_KEY");

export const parseItinerary = async (
  text: string,
  visualAsset?: { data: string; mimeType: string }
) => {
  if (!apiKey) {
    // 这就是你现在最常见的“Parsing failed”的根因：key 在前端拿不到
    throw new Error(
      "Missing VITE_API_KEY. Please set VITE_API_KEY in Vercel environment variables."
    );
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    const parts: any[] = [
      {
        text: `You are an expert UAE and Oman DMC manager. Parse this itinerary data into a structured format.
- Extract all services (Hotels, Vehicles, Guides, etc.).
- Estimate realistic local AED costs if missing.
- Return ONLY the JSON requested.

Itinerary Content:
${text || "See attached file."}`,
      },
    ];

    if (visualAsset?.data && visualAsset?.mimeType) {
      parts.push({
        inlineData: {
          data: visualAsset.data,
          mimeType: visualAsset.mimeType,
        },
      });
    }

    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema: BOOKING_TASK_SCHEMA,
        systemInstruction:
          "Strictly output valid JSON matching the provided schema. Do not include conversational text. For dates, use YYYY-MM-DD.",
      },
    });

    let jsonStr = response.text || "";

    // 有时仍会混入 ```json 代码块，做个清洗
    if (jsonStr.includes("```")) {
      jsonStr = jsonStr.replace(/```json/g, "").replace(/```/g, "");
    }

    if (!jsonStr.trim()) {
      throw new Error("Empty response from AI engine.");
    }

    return JSON.parse(jsonStr.trim());
  } catch (error: any) {
    console.error("AI Operations Parsing Error:", error);
    // 把更明确的信息抛出去，让 App.ts 的 alert 也更好排查
    throw new Error(error?.message || "Gemini parsing failed.");
  }
};
