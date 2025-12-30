
import { GoogleGenAI, Chat, GenerateContentResponse, Modality } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are the "Grand Intelligent Retrieval Architect of the Snowy Peaks" (ཤེས་རིག་བཙལ་བཤེར་མ་ལག).
Your mission is to provide an UNPRECEDENTED, massive, and exhaustive scholarly exploration.

STRICT OPERATIONAL PROTOCOL FOR THE 50,000 HUMAN WORD MARATHON:
1. WORD COUNT METRIC:
   - Tibetan: Measured strictly in Tshegs (ཚེག).
   - Chinese: Measured strictly in individual Hanzi characters.
   - English: Measured in space-separated words.
   - TOTAL TARGET: 50,000 human-centric word units.

2. ANTI-SUMMARY RULE: Never summarize. Every response must be deep, expansive, and scholarly.
3. TURN-BASED TARGET: Aim for maximum possible length (8000+ tokens) in every response.
4. GRANULAR DECONSTRUCTION: Deconstruct concepts syllable-by-syllable.
5. CHAINING: Append [CONTINUE_SIGNAL] until the 50,000 human-word threshold is met. 
   ONLY append [COMPLETE] when the 50,000 human-word threshold is surpassed.
6. NO META-TALK: Output ONLY the scholarly text.
`;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const sendMessageToSession = async (
  text: string,
  history: any[],
  onUpdate: (text: string) => void,
  useSearch = true
): Promise<{text: string, grounding?: any[]}> => {
  const model = useSearch ? 'gemini-3-flash-preview' : 'gemini-3-pro-preview';
  const chat = ai.chats.create({
    model: model,
    config: { 
      systemInstruction: SYSTEM_INSTRUCTION,
      maxOutputTokens: 8192,
      thinkingConfig: { thinkingBudget: 4096 },
      temperature: 0.9,
      tools: useSearch ? [{ googleSearch: {} }] : []
    },
    history: history,
  });

  try {
    const responseStream = await chat.sendMessageStream({ message: text });
    let fullText = "";
    let grounding = null;

    for await (const chunk of responseStream) {
      const c = chunk as GenerateContentResponse;
      if (c.text) {
        fullText += c.text;
        onUpdate(fullText);
      }
      if (c.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        grounding = c.candidates[0].groundingMetadata.groundingChunks;
      }
    }
    return { text: fullText, grounding };
  } catch (error: any) {
    console.error("Gemini Error:", error);
    throw error;
  }
};

export const generateSpeech = async (text: string): Promise<Uint8Array> => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Read this Tibetan/mixed text naturally: ${text}` }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
      },
    },
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
        { text: "Transcribe this audio accurately. If it is Tibetan, use Tibetan script. If mixed, use mixed scripts." }
      ]
    }
  });
  return response.text || "";
};

export const analyzeVideo = async (base64Video: string, mimeType: string, prompt: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Video, mimeType } },
        { text: `Analyze this video for scholarly retrieval: ${prompt}` }
      ]
    }
  });
  return response.text || "";
};

export const quickExplain = async (text: string): Promise<string> => {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-lite-latest',
    contents: `Analyze this segment: "${text}". Provide Tibetan commentary, Chinese translation, and English academic context.`,
    config: {
      systemInstruction: "You are a master philologist. Be brief but academic.",
      maxOutputTokens: 1024,
      temperature: 0.1
    }
  });
  return response.text || "No analysis available.";
};
