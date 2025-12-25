
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are the "Grand Imperial Historian of the Tibetan Highlands" (བོད་ཀྱི་རྒྱལ་རབས་ལོ་རྒྱུས་སྨྲ་བའི་དབང་པོ།).
Your soul mission is to write a 50,000-tsheg / 50,000-character MAGNUM OPUS.

STRICT LITERARY PROTOCOL:
1. NO SUMMARY: Never summarize. If a character walks across a room, describe every creak of the floorboards, the dust dancing in the sunlight, and the character's ancestral memories for 2000+ words.
2. EXTREME VERBOSITY: Use the most profound, scholarly Tibetan (མངོན་བྗོད་དང་རྒྱན་གྱི་བསྟན་བཅོས།). Your goal is to be as detailed as humanly possible.
3. THE "NEVER-ENDING" RULE: Do not conclude the story. Even if the story feels like it's reaching a climax, introduce new subplots, detailed flashbacks, or philosophical diversions.
4. CHAINING MECHANISM:
   - Since the API has output limits per turn, you MUST treat every response as a single 'scroll' of a much larger work.
   - At the exact point where you feel you are approaching the output limit, pause mid-sentence and add the token: [CONTINUE_SIGNAL]
   - If you have truly reached the massive 50,000-character epic goal, only then use: [COMPLETE]
5. ABSOLUTE SILENCE: Do not explain your process. Only output the literary text of the epic.
6. VOLUME: Aim for at least 3000-5000 characters per response turn.
`;

async function withRetry<T>(
  fn: () => Promise<T>,
  retries = 3,
  delay = 2000
): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error?.message || "";
    const isQuotaError = 
      errorMsg.includes("429") || 
      errorMsg.includes("RESOURCE_EXHAUSTED") || 
      error?.status === "RESOURCE_EXHAUSTED";
    
    if (retries > 0 && isQuotaError) {
      console.warn(`Quota exceeded. Retrying in ${delay}ms... (${retries} retries left)`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }
    
    // Pass specific error messages up to the UI
    throw error;
  }
}

export const startNewChat = (history: any[]) => {
  // Always create a new instance right before use to ensure latest API Key
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      temperature: 0.9,
      topP: 0.95,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 4096 }
    },
    history: history,
  });
};

export const sendMessageToSession = async (
  text: string,
  history: any[],
  onUpdate: (text: string) => void
): Promise<string> => {
  // Always create a new instance and a new chat session with the full history 
  // to ensure the latest API Key is used and context is maintained.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: { 
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 4096 }
    },
    history: history,
  });

  try {
    const responseStream = await withRetry<any>(() => 
      chat.sendMessageStream({ message: text })
    );

    let fullText = "";
    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        fullText += c.text;
        onUpdate(fullText);
      }
    }
    return fullText;
  } catch (error: any) {
    console.error("Gemini Scribe Error:", error);
    throw error;
  }
};

export const quickExplain = async (text: string, type: 'explain' | 'translate'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = type === 'explain' 
    ? `You are an expert in Tibetan philology and cultural history. For the following text: "${text}", provide:
       1. A profound scholarly explanation in high literary Tibetan (མངོན་བརྗོད་དང་རིགས་ལམ་གྱི་ལམ་ནས་འགྲེལ་བཤད།), prioritizing linguistic depth and cultural nuance.
       2. An accurate, culturally sensitive, and elegant translation into Simplified Chinese that captures the philosophical or poetic spirit of the original.
       Structure your response with the Tibetan explanation FIRST. Use clear, respectful formatting.`
    : `Translate the following text into elegant, literary simplified Chinese: "${text}". Ensure the translation respects the cultural and sacred nuances of the Tibetan language. Provide a brief scholarly Tibetan synonym or contextual note in Tibetan if it aids in understanding the depth of the term.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a world-class scholar of Tibetan studies, a master philologist, and a culturally sensitive translator.",
        maxOutputTokens: 2048
      }
    });
    return response.text || "No explanation available.";
  } catch (error) {
    console.error("Quick Explain Error:", error);
    throw error;
  }
};

export const resetChat = () => {
  // Reset logic is now handled by re-instantiating in the functions above.
};
