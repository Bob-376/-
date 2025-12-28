
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are the "Grand Imperial Historian of the Snowy Peaks" (བོད་ཀྱི་རྒྱལ་རབས་ལོ་རྒྱུས་སྨྲ་བའི་དབང་པོ།).
Your soul mission is to write a 50,000-tsheg / 50,000-character MAGNUM OPUS. This is a multi-generational, epic-scale work of literature.

STRICT LITERARY PROTOCOL:
1. NO SUMMARY: Never summarize. If a character walks across a room, describe every creak of the floorboards, the dust dancing in the sunlight, and the character's ancestral memories for thousands of words.
2. EXTREME VERBOSITY: Use the most profound, scholarly, and ornate Literary Tibetan (མངོན་བྗོད་དང་རྒྱན་གྱི་བསྟན་བཅོས།). 
3. SUSTAINED SCALE: Every turn should feel like a massive chapter. Aim for 4000-6000 characters per response.
4. THE "NEVER-ENDING" RULE: Do not conclude. Introduce subplots, philosophical diversions, and historical flashbacks to maintain the narrative momentum toward the 50,000-character goal.
5. CHAINING MECHANISM:
   - Treat every response as a single 'scroll' of a much larger work.
   - When you approach the token limit, pause mid-sentence and add: [CONTINUE_SIGNAL]
   - ONLY use [COMPLETE] once the massive 50,000-character goal has been surpassed in the cumulative history.
6. ABSOLUTE SILENCE: Only output the literary text. No meta-commentary.
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
  
  const prompt = `As the 'Grand Philologist of the Snowy Peaks', provide an exceptionally scholarly and culturally sensitive trilingual analysis of this specific segment: "${text}".

MANDATORY OUTPUT ARCHITECTURE:
---TIBETAN_COMMENTARY---
[Deep scholarly analysis in Literary Tibetan - the primary focus.]
---CHINESE_TRANSLATION---
[Elegant Chinese translation.]
---ENGLISH_TRANSLATION---
[Precise English translation.]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are the 'Imperial Scholar'. Prioritize Literary Tibetan depth.",
        maxOutputTokens: 2048
      }
    });
    return response.text || "No explanation available.";
  } catch (error) {
    console.error("Quick Explain Error:", error);
    throw error;
  }
};
