import { GoogleGenAI, Chat, GenerateContentResponse, Modality, Type, LiveServerMessage } from "@google/genai";
import { MediaItem } from '../types';

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

const OCR_SYSTEM_INSTRUCTION = `
You are a specialized Optical Character Recognition (OCR) engine for Tibetan (Uchen/Pecha), Chinese, and English.
Your SOLE purpose is to transcribe text from the image.

STRICT EXECUTION RULES:
1. OUTPUT RAW TEXT ONLY.
2. NO conversational fillers (e.g., "Here is the text", "The image contains").
3. NO descriptions of the image content (e.g., "This is a page from a sutra").
4. NO translations. Maintain the original language.
5. PRESERVE LAYOUT: Keep line breaks and paragraph structure as they appear.
6. TIBETAN PRECISION: Transcribe standard Unicode Tibetan exactly.
7. If the image contains mixed languages, transcribe all of them in order.
8. If NO text is found, return "NO_TEXT_FOUND".
`;

const cleanBase64 = (data: string) => {
  if (data.includes('base64,')) {
    return data.split('base64,')[1];
  }
  return data;
};

const isOCR = (text: string) => {
  const lower = text.toLowerCase();
  return lower.includes("ocr") || 
         text.includes("识别") || 
         text.includes("提取") || 
         text.includes("原文") || 
         text.includes("བོད་ཡིག་") || // Bod yig (Tibetan)
         text.includes("transcribe") ||
         text.includes("text from image") ||
         text.includes("read text") ||
         text.includes("文字") ||
         text.includes("what does it say");
};

export const sendMessageToSession = async (
  text: string,
  history: any[],
  onUpdate: (text: string) => void,
  options: { useSearch?: boolean; thinkingMode?: boolean; fastMode?: boolean; images?: MediaItem[] } = {}
): Promise<{ text: string; grounding?: any[] }> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  // Check for OCR intent
  const isOCRRequest = options.images && options.images.some(i => i.type === 'image') && isOCR(text);

  // Model selection based on requirements
  let model = 'gemini-flash-lite-latest'; 
  if (options.useSearch) model = 'gemini-3-flash-preview';
  if (options.thinkingMode) model = 'gemini-3-pro-preview';
  
  if (options.images && options.images.length > 0) {
    const hasAudio = options.images.some(i => i.type === 'audio');
    if (hasAudio) {
      // Audio processing requires a multimodal model like gemini-3-flash
      model = 'gemini-3-flash-preview';
    } else {
      // Use gemini-3-flash-preview for OCR as it follows instructions better than 2.5-flash-image
      model = isOCRRequest ? 'gemini-3-flash-preview' : 'gemini-2.5-flash-image';
    }
  }

  const config: any = {
    systemInstruction: isOCRRequest ? OCR_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION,
    temperature: isOCRRequest ? 0.0 : 0.9, // Zero temperature for deterministic OCR
  };

  if (options.thinkingMode) {
    config.thinkingConfig = { thinkingBudget: 32768 };
  } else {
    config.maxOutputTokens = 8192;
  }

  if (options.useSearch && !options.images && !isOCRRequest) {
    config.tools = [{ googleSearch: {} }];
  }

  const chat = ai.chats.create({
    model: model,
    config: config,
    history: isOCRRequest ? [] : history, // Stateless for OCR to avoid context pollution
  });

  try {
    let messageInput: string | any[] = text;
    
    if (options.images && options.images.length > 0) {
      const hasAudio = options.images.some(i => i.type === 'audio');
      let promptText = text;

      if (isOCRRequest) {
        promptText = `STRICT OCR TASK: Transcribe all text from this image exactly. Do not explain. Do not translate. \n\nUser Context: ${text}`;
      } else if (hasAudio) {
        promptText = `AUDIO TASK (AMDO DIALECT):
1. **FULL VERBATIM TRANSCRIPTION**: Listen to the ENTIRE audio file from beginning to end. This is likely Amdo Tibetan dialect. Transcribe the spoken content STRICTLY word-for-word into standard Tibetan script (Bod Yig).
   - CRITICAL: DO NOT SUMMARIZE.
   - CRITICAL: Ensure NO part of the audio is omitted.
2. **TRANSLATION**: Translate the full Tibetan transcription into clear and accurate Chinese (Hanzi).

Format:
[Tibetan Transcription]
<text>
[Chinese Translation]
<text>

${text ? `User Note: ${text}` : ''}`;
      } else if (!text) {
        promptText = "Analyze this content.";
      }

      messageInput = [
        ...options.images.map(img => ({
          inlineData: {
            data: cleanBase64(img.data),
            mimeType: img.mimeType
          }
        })),
        { text: promptText }
      ];
    }

    const responseStream = await chat.sendMessageStream({ message: messageInput });
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
  const isOCRRequest = isOCR(prompt);
  
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        ...images.map(img => ({ inlineData: { data: cleanBase64(img.data), mimeType: img.mimeType } })),
        { text: isOCRRequest ? `PURE OCR TASK: Please extract ALL text from the provided image(s) exactly as it appears. 
        If the text is Tibetan, transcribe it accurately in Unicode Tibetan. 
        If it is Chinese or English, transcribe it as well. 
        Do not translate unless asked. Do not summarize. Provide the raw text content.` : prompt }
      ]
    },
    config: { 
      systemInstruction: isOCRRequest ? OCR_SYSTEM_INSTRUCTION : SYSTEM_INSTRUCTION,
      temperature: isOCRRequest ? 0.0 : 0.9
    }
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
        { inlineData: { data: cleanBase64(base64), mimeType } },
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
    config.image = { imageBytes: cleanBase64(imageBase64), mimeType: 'image/png' };
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
        { inlineData: { data: cleanBase64(base64Audio), mimeType: 'audio/webm' } },
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
        { inlineData: { data: cleanBase64(base64Video), mimeType } },
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
    model: 'gemini-flash-lite-latest',
    contents: `Explain segment: "${text}".`,
    config: { systemInstruction: "Be brief but academic." }
  });
  return response.text || "";
};

export const translateText = async (text: string, targetLang: string): Promise<string> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const response = await ai.models.generateContent({
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
    model: 'gemini-2.5-flash-native-audio-preview-12-2025',
    callbacks,
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } },
      systemInstruction: 'You are a helpful Tibetan scholar assistant. Keep responses natural and conversational.',
    }
  });
};
