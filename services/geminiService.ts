
import { GoogleGenAI, Type } from "@google/genai";
import { Category } from "../types";

export const generateJeopardyBoard = async (theme: string): Promise<Category[]> => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("API key is missing. Please provide VITE_GEMINI_API_KEY in .env");
  }
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Generate a full Jeopardy board for the theme: "${theme}". 
    Create exactly 5 categories. Each category must have exactly 5 questions with point values 200, 400, 600, 800, and 1000.
    The questions should be challenging but fun. 
    Ensure the "question" property is the prompt given to the player (the clue) and the "answer" is the expected response.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            questions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  value: { type: Type.NUMBER },
                  question: { type: Type.STRING },
                  answer: { type: Type.STRING }
                },
                required: ["value", "question", "answer"]
              }
            }
          },
          required: ["title", "questions"]
        }
      }
    }
  });

  const rawCategories = JSON.parse(response.text);

  // Transform to our Category structure with IDs
  return rawCategories.map((cat: any, cIdx: number) => ({
    title: cat.title,
    questions: cat.questions.map((q: any, qIdx: number) => ({
      ...q,
      id: `q-${cIdx}-${qIdx}`,
      isAnswered: false,
      category: cat.title
    }))
  }));
};
