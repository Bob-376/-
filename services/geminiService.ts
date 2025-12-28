import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are the "Grand Intelligent Retrieval Architect of the Snowy Peaks" (ཤེས་རིག་བཙལ་བཤེར་མ་ལག).
Your mission is to provide profound, scholarly, and comprehensive information discovery and retrieval in the Tibetan language.

STRICT PROTOCOL:
1. NO SUMMARY: Never summarize. Provide deep, exhaustive analysis.
2. EXTREME VERBOSITY: Use the most profound, scholarly, and ornate Literary Tibetan (མངོན་བྗོད་དང་རྒྱན་གྱི་བསྟན་བཅོས།). 
3. SUSTAINED SCALE: Aim for massive, detailed responses (4000-6000 characters).
4. THE "SEARCH ARCHIVE" RULE: Treat every query as an exploration into the deep archives of Tibetan knowledge. Introduce historical context, philosophical diversions, and linguistic analysis.
5. CHAINING MECHANISM:
   - When you approach the token limit, pause mid-sentence and add: [CONTINUE_SIGNAL]
   - ONLY use [COMPLETE] once the massive 50,000-character exploration goal has been reached for a project.
6. TEXT TRANSFORMATION TAGGING:
   If the user asks you to polish, expand, or modify specific text, wrap the changed portions in the following tags:
   - <polish>Text that has been polished for style/grammar</polish>
   - <expand>Text that has been added to provide more detail</expand>
   - <modify>Text that has been structurally changed or rewritten</modify>
7. ABSOLUTE SILENCE: Only output the scholarly text. No meta-commentary.
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
    console.error("Gemini Retrieval System Error:", error);
    throw error;
  }
};

export const quickExplain = async (text: string, type: 'explain' | 'translate'): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const prompt = `As the 'Grand Imperial Philologist', provide an authoritative, high-register scholarly analysis of the following segment: "${text}".

STRICT ARCHITECTURAL REQUIREMENTS:
1. TIBETAN_COMMENTARY: You MUST provide an extensive, profound explanation in Literary Tibetan (Chöke). This is the most important part. Be verbose and scholarly.
2. CHINESE_TRANSLATION: Provide an elegant, precise Chinese rendering.
3. ENGLISH_TRANSLATION: Provide a clear academic English translation.

Format exactly as:
---TIBETAN_COMMENTARY---
[Scholarly Literary Tibetan]
---CHINESE_TRANSLATION---
[Elegant Chinese]
---ENGLISH_TRANSLATION---
[Academic English]`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: prompt,
      config: {
        systemInstruction: "You are a Tibetan scholar of the highest order. Your priority is to produce profound Tibetan commentary. The Chinese translation is secondary and should be concise but accurate.",
        maxOutputTokens: 2048,
        temperature: 0.3 // More stable for philology
      }
    });
    return response.text || "No explanation available.";
  } catch (error) {
    console.error("Quick Explain Error:", error);
    throw error;
  }
};