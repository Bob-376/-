
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

let chatSession: Chat | null = null;

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are a helpful, wise, and polite AI assistant fluent in Tibetan. 
Your primary goal is to assist users in the Tibetan language (Bod Skad).
If the user speaks Tibetan, reply in Tibetan.
If the user asks if you know Tibetan, confirm politely in Tibetan that you do.
Maintain a calm, respectful tone suitable for the culture.
`;

export const getChatSession = (): Chat => {
  if (!chatSession) {
    chatSession = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });
  }
  return chatSession;
};

export const sendMessageStream = async (
  text: string,
  onChunk: (text: string) => void
): Promise<void> => {
  const session = getChatSession();
  
  try {
    const responseStream = await session.sendMessageStream({ message: text });
    
    for await (const chunk of responseStream) {
       const c = chunk as GenerateContentResponse;
       if (c.text) {
         onChunk(c.text);
       }
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const resetChat = () => {
  chatSession = null;
};
