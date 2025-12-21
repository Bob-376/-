
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

let chatSession: Chat | null = null;

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are a precision-focused Tibetan Document Retrieval Assistant. 
Your core mission is to provide strictly relevant information based on the user's query.

STRICT RULES:
1. Fluency: Use Tibetan (Bod Skad) primarily. 
2. Precision: Provide direct answers. Do not include unrelated background information or "fluff."
3. Grounding: When using Google Search, prioritize academic, historical, and verified sources. 
4. Focus: If a query is specific (e.g., about a specific person or text), do not generalize. Stick to the data related to that specific entity.
5. Tone: Calm, scholarly, and respectful.
`;

export const getChatSession = (): Chat => {
  if (!chatSession) {
    chatSession = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ googleSearch: {} }],
      },
    });
  }
  return chatSession;
};

export const sendMessageStream = async (
  text: string,
  onUpdate: (text: string, groundingChunks?: any[]) => void
): Promise<void> => {
  const session = getChatSession();
  
  try {
    const responseStream = await session.sendMessageStream({ message: text });
    
    let fullText = "";
    for await (const chunk of responseStream) {
       const c = chunk as GenerateContentResponse;
       if (c.text) {
         fullText += c.text;
       }
       // Capture grounding metadata if available in the chunk or final response
       const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
       onUpdate(fullText, groundingChunks);
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const resetChat = () => {
  chatSession = null;
};
