
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
    
    throw error;
  }
}

export const startNewChat = (history: any[]) => {
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
  
  const prompt = `You are a world-renowned philologist of the Tibetan Plateau. 
Analyze the provided segment: "${text}".

MANDATORY TRILINGUAL SCHOLARLY RESPONSE STRUCTURE:

---TIBETAN_COMMENTARY---
[Priority 1: Write an exhaustive, profound, and high-literary Tibetan commentary. Use honorifics and discuss the etymological and philosophical depth of the chosen words.]

---CHINESE_TRANSLATION---
[Priority 2: Provide an elegant, literary Simplified Chinese translation that captures the spiritual weight of the original.]

---ENGLISH_TRANSLATION---
[Priority 3: Provide a precise English translation with a brief note on grammatical or historical context.]

RULES:
- Start with the Tibetan section. It must be the most substantial.
- Do not use any other headers or conversational fillers.
- Adhere strictly to the markers for UI parsing.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are the 'Imperial Scholar'. Your communication is trilingual, always prioritizing the profound beauty of literary Tibetan above all else.",
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
