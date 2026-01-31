
import { GoogleGenAI, Type } from "@google/genai";
import { ResourceType, TaskStatus } from "../types";

const BOOKING_TASK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    groupName: { type: Type.STRING, description: 'Tour group name or order ID' },
    startDate: { type: Type.STRING, description: 'Start date (YYYY-MM-DD)' },
    endDate: { type: Type.STRING, description: 'End date (YYYY-MM-DD)' },
    paxCount: { type: Type.INTEGER, description: 'Number of people' },
    guideLanguage: { type: Type.STRING, description: 'Preferred guide language' },
    estimatedIncome: { type: Type.NUMBER, description: 'Total estimated revenue from this group (in AED)' },
    tasks: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          type: { 
            type: Type.STRING, 
            description: 'One of: Hotel, Restaurant, Attraction, Vehicle, Guide, Others' 
          },
          description: { type: Type.STRING, description: 'Details of the resource (e.g. Hotel name, Attraction name)' },
          date: { type: Type.STRING, description: 'Date of service (YYYY-MM-DD)' },
          time: { type: Type.STRING, description: 'Start time (HH:MM)' },
          endTime: { type: Type.STRING, description: 'End time (HH:MM)' },
          estimatedCost: { type: Type.NUMBER, description: 'Estimated booking cost for this task (in AED)' },
          notes: { type: Type.STRING, description: 'Specific requirements (e.g. bed type, meal preference)' }
        },
        required: ['type', 'description', 'date']
      }
    }
  },
  required: ['groupName', 'startDate', 'endDate', 'tasks']
};

export const parseItinerary = async (text: string, visualAsset?: { data: string, mimeType: string }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  try {
    const parts: any[] = [{ text: `You are an expert UAE and Oman DMC manager. Parse this itinerary data into a structured format. 
      - Extract all services (Hotels, Vehicles, Guides, etc.).
      - Estimate realistic local AED costs if missing.
      - Return ONLY the JSON requested.
      
      Itinerary Content: ${text || "See attached visual."}` }];

    if (visualAsset) {
      parts.push({
        inlineData: {
          data: visualAsset.data,
          mimeType: visualAsset.mimeType
        }
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: BOOKING_TASK_SCHEMA,
        systemInstruction: "Strictly output valid JSON matching the provided schema. Do not include conversational text. For dates, use YYYY-MM-DD."
      }
    });

    let jsonStr = response.text || "";
    
    // Safety check for markdown code blocks that sometimes persist despite responseMimeType
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json/g, '').replace(/```/g, '');
    }

    if (!jsonStr.trim()) {
      throw new Error("Empty response from AI engine.");
    }

    return JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error("AI Operations Parsing Error:", error);
    throw error;
  }
};
