
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

export const parseItinerary = async (text: string, fileData?: { data: string, mimeType: string }) => {
  // Fix: Initialize GoogleGenAI inside the function to use the correct API key at call time.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const parts: any[] = [{ text: `Parse the following DMC tour itinerary and extract structured booking tasks including estimated financial values. 
      Location context: UAE and Oman.
      Currency: AED.
      Additional User Notes: ${text || "None"}` }];

    if (fileData) {
      parts.push({
        inlineData: {
          data: fileData.data,
          mimeType: fileData.mimeType
        }
      });
    }

    // Use gemini-3-pro-preview for complex text tasks.
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
        responseSchema: BOOKING_TASK_SCHEMA,
        systemInstruction: "You are a senior DMC operations manager. Extract precise booking details and estimate costs based on local UAE/Oman market rates if not specified. Dates must be in YYYY-MM-DD format. Categorize items that don't fit standard types as 'Others'."
      }
    });

    const responseText = response.text;
    if (!responseText) throw new Error("No response from AI");
    return JSON.parse(responseText.trim());
  } catch (error) {
    console.error("AI Parsing Error:", error);
    throw error;
  }
};
