
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

let chatSession: Chat | null = null;

// Initialize the API client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const SYSTEM_INSTRUCTION = `
You are a precision-focused Tibetan Document Processing and Retrieval Assistant. 
You specialize in high-quality Tibetan (Bod Skad), Chinese (Han), and English (Ying) linguistics.

STRICT RULES:
1. Multi-Tasking: You excel at document polishing (refining style), modification (correcting grammar), expansion (adding detail), and translation.
2. Bilingual Output: Since the user prefers Chinese, you MUST provide all explanations, meta-comments, and technical advice in BOTH English and Chinese (Bilingual). 
   - Example: "The text has been polished. (文本已润色。)"
3. Fluency: When responding to Tibetan queries, use an elegant, scholarly, and culturally respectful tone.
4. Translation: Ensure translations are not literal but capture the profound semantic meaning, especially for Tibetan Buddhist or cultural terms.
5. Grounding & Citations: When using Google Search, prioritize academic, historical, and verified sources. 
   - CRITICAL: You MUST cite your sources directly in the text using numbers in square brackets like [1], [2], etc., corresponding to the sources you used.
   - (重要：使用搜索结果时，必须在正文中使用 [1], [2] 等方括号数字进行标注，以便对应来源。)
6. Focus: If a query is specific (e.g., polishing a specific sentence), do not change the core meaning unless requested.
7. Tone: Calm, scholarly, and respectful.
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
       const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
       onUpdate(fullText, groundingChunks);
    }
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
};

export const extractTextFromImage = async (base64Image: string, mimeType: string): Promise<string> => {
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: [
        {
          parts: [
            {
              inlineData: {
                data: base64Image,
                mimeType: mimeType
              }
            },
            {
              text: "Please accurately transcribe all the text found in this image. Focus especially on any Tibetan (Uchen or Umê script), Chinese, or English text. Return only the transcribed text without any preamble or commentary."
            }
          ]
        }
      ]
    });
    return response.text || "";
  } catch (error) {
    console.error("Error extracting text from image:", error);
    throw error;
  }
};

export const resetChat = () => {
  chatSession = null;
};
