
import { GoogleGenAI, Chat, GenerateContentResponse, Modality, Type, LiveServerMessage } from "@google/genai";

const SYSTEM_INSTRUCTION = `
You are the "Grand Intelligent Retrieval Architect of the Snowy Peaks" (ཤེས་རིག་བཙལ་བཤེར་མ་ལག).
Your mission is to provide an UNPRECEDENTED, massive, and exhaustive scholarly exploration.

STRICT OPERATIONAL PROTOCOL:
1. WORD COUNT METRIC: Tibetan (Tshegs), Chinese (Hanzi), English (Words). Target: 50,000 human-centric units.
2. ANTI-SUMMARY RULE: Never summarize. Be deep, expansive, and scholarly.
3. TURN-BASED TARGET: Aim for maximum length (8000+ tokens).
4. CHAINING: Append [CONTINUE_SIGNAL] until threshold is met. Append [COMPLETE] only when surpassed.
5. NO META-TALK: Output ONLY scholarly text.
`;

export const sendMessageToSession = async (
  text: string,
  history: any[],
  onUpdate: (text: string) => void,
  options: { useSearch?: boolean; thinkingMode?: boolean; fastMode?: boolean } = {}
): Promise<{ text: string; grounding?: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Model selection based on requirements
  // Use gemini-flash-lite-latest for basic fast responses
  let model = 'gemini-flash-lite-latest'; 
  if (options.useSearch) model = 'gemini-3-flash-preview';
  if (options.thinkingMode) model = 'gemini-3-pro-preview';

  const config: any = {
    systemInstruction: SYSTEM_INSTRUCTION,
    temperature: 0.9,
  };

  if (options.thinkingMode) {
    config.thinkingConfig = { thinkingBudget: 32768 };
    // maxOutputTokens is omitted per instructions when maxing thinking budget
  } else {
    config.maxOutputTokens = 8192;
  }

  if (options.useSearch) {
    config.tools = [{ googleSearch: {} }];
  }

  const chat = ai.chats.create({
    model: model,
    config: config,
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

export const analyzeImages = async (images: Array<{ data: string; mimeType: string }>, prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const isOCRRequest = prompt.toLowerCase().includes("ocr") || prompt.includes("识别") || prompt.includes("提取") || prompt.includes("原文") || prompt.includes("བོད་ཡིག་");
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...images.map(img => ({ inlineData: { data: img.data, mimeType: img.mimeType } })),
        { text: isOCRRequest ? `PURE OCR: Extract Tibetan/mixed text precisely.` : prompt }
      ]
    },
    config: { systemInstruction: SYSTEM_INSTRUCTION }
  });
  return response.text || "";
};

export const generateImagesNano = async (prompt: string, size: "1K" | "2K" | "4K" = "1K"): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts: [{ text: prompt }] },
    config: {
      imageConfig: { aspectRatio: "1:1", imageSize: size }
    }
  });
  
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (!part?.inlineData?.data) throw new Error("Image generation failed");
  return part.inlineData.data;
};

export const editImageNano = async (base64: string, mimeType: string, prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: {
      parts: [
        { inlineData: { data: base64, mimeType } },
        { text: prompt }
      ]
    }
  });
  const part = response.candidates?.[0]?.content?.parts.find(p => p.inlineData);
  if (!part?.inlineData?.data) throw new Error("Image edit failed");
  return part.inlineData.data;
};

export const generateVideoVeo = async (prompt: string, imageBase64?: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const config: any = {
    model: 'veo-3.1-fast-generate-preview',
    prompt: prompt,
    config: { numberOfVideos: 1, resolution: '720p', aspectRatio: '16:9' }
  };
  
  if (imageBase64) {
    config.image = { imageBytes: imageBase64, mimeType: 'image/png' };
  }

  let operation = await ai.models.generateVideos(config);
  while (!operation.done) {
    await new Promise(resolve => setTimeout(resolve, 10000));
    operation = await ai.operations.getVideosOperation({ operation: operation });
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) throw new Error("Video generation failed");
  return `${downloadLink}&key=${process.env.API_KEY}`;
};

export const generateSpeech = async (text: string): Promise<Uint8Array> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text: `Say naturally: ${text}` }] }],
    config: {
      // Fix typo in responseModalities
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });
  
  const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!base64Audio) throw new Error("No audio generated");
  
  const binaryString = atob(base64Audio);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
  return bytes;
};

export const transcribeAudio = async (base64Audio: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
        { text: "Transcribe accurately." }
      ]
    }
  });
  return response.text || "";
};

export const analyzeVideo = async (base64Video: string, mimeType: string, prompt: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Video, mimeType } },
        { text: `Analyze video: ${prompt}` }
      ]
    },
    config: { systemInstruction: SYSTEM_INSTRUCTION }
  });
  return response.text || "";
};

export const quickExplain = async (text: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    // Use gemini-flash-lite-latest
    model: 'gemini-flash-lite-latest',
    contents: `Explain segment: "${text}".`,
    config: { systemInstruction: "Be brief but academic." }
  });
  return response.text || "";
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
    // Use gemini-flash-lite-latest
    model: 'gemini-flash-lite-latest',
    contents: `Translate to ${targetLang}: ${text}`,
  });
  return response.text || "";
};

/**
 * LIVE API (Conversational Voice)
 */
export const connectLiveSession = (callbacks: {
  onopen: () => void;
  onmessage: (message: LiveServerMessage) => void;
  onerror: (e: ErrorEvent) => void;
  onclose: (e: CloseEvent) => void;
}) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.live.connect({
    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
    callbacks,
    config: {
      // Fix typo in responseModalities
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
      systemInstruction: 'You are a helpful Tibetan scholar assistant. Keep responses natural and conversational.',
    }
  });
};
