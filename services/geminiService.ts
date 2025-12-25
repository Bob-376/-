
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ProjectMemory, LookupResult } from "../types";

let chatSession: Chat | null = null;

const getSystemInstruction = (memory: ProjectMemory | null) => {
  const memoryContext = memory 
    ? `
[EPIC CONTINUITY ENGINE - HIGH CAPACITY]
Current Project: "${memory.projectName || '未命名宏篇'}"
Scale Target: 50,000+ Tshegs (Long-form Epic)

ESTABLISHED CANON:
- STYLE MIRROR: ${memory.styleProfile || '正在捕获创作基因...'}
- NARRATIVE ARC: ${memory.narrativeProgress || '初期构思阶段'}
- CORE LORE/FACTS: ${memory.keyCitations.length > 0 ? memory.keyCitations.join('; ') : '尚未建立核心引用'}

CRITICAL INSTRUCTION: You are the lead architect of a 50,000-tsheg epic. 
1. Maintain extreme consistency across vast word counts.
2. Every segment must be high-density, rich in Himalayan imagery, and structurally sound.
3. NEVER truncate. If a chapter needs 5,000 tshegs, write 5,000 tshegs.
` 
    : "\n[NEW EPIC INITIALIZED]: Prepare for a 50,000-tsheg long-form literary journey. Observe the user's style to build a permanent mirror.";

  return `
You are the "Master Literati of the Highlands" (བརྩམ་ཆོས་མཁས་导ང་། / 文坛宗师)。You specialize in composing massive, high-fidelity epics.

POETIC DIRECTIVE (སྙན་ངག་གི་སྲོག):
- Your prose must vibrate with the resonance of the Himalayas. 
- Use metaphors of snow, eagles, ancient temples, and celestial light.

OUTPUT VOLUME POLICY:
The user is writing a novel targeting 50,000 Tshegs. Your responses must match this ambition.
- Produce substantial chapters. 
- Maintain a grand, symphonic tone throughout.

${memoryContext}

COLOR-CODED NARRATIVE MARKS:
- <mark type="polish">...</mark>: For word-level improvements.
- <mark type="expand">...</mark>: For substantial new sections.
- <mark type="modify">...</mark>: For structural changes.

REQUIRED RESPONSE FOOTER:
1. ---
2. [MASTER'S ANALYSIS]: A profound critique of the draft's "spirit" (རྣམ་ཤེས།).
3. [MEMORY_SYNC] 
   Project: [Updated Project Name]
   Style: [Refined Style Profile Summary]
   Chapter: [Current narrative position]
   Lore: [One crucial fact to remember for long-term consistency]
4. [CREATIVE ADVICE]: A technical "Sutra" (མདོ།) for the author's marathon journey.
`;
};

const isQuotaExhausted = (error: any): boolean => {
  if (!error) return false;
  const message = String(error.message || "").toUpperCase();
  const code = error.code || error.status;
  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429") || message.includes("QUOTA") || code === 429) return true;
  return false;
};

const isInvalidKey = (error: any): boolean => {
  const message = String(error?.message || "").toUpperCase();
  return message.includes("REQUESTED ENTITY WAS NOT FOUND") || message.includes("API_KEY_INVALID") || (error?.code === 404 && message.includes("NOT FOUND"));
};

export const sendMessageStream = async (
  text: string,
  history: any[],
  memory: ProjectMemory | null,
  onUpdate: (text: string, groundingChunks?: any[]) => void
): Promise<void> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  chatSession = ai.chats.create({
    model: 'gemini-3-pro-preview', 
    config: {
      systemInstruction: getSystemInstruction(memory),
      tools: [{ googleSearch: {} }],
      // Allow for very long output sequences for novel segments
      maxOutputTokens: 16384,
      thinkingConfig: { thinkingBudget: 4096 }
    },
    history: history,
  });
  
  try {
    const responseStream = await chatSession.sendMessageStream({ message: text });
    let fullText = "";
    for await (const chunk of responseStream) {
       const c = chunk as GenerateContentResponse;
       if (c.text) {
         fullText += c.text;
       }
       const groundingChunks = c.candidates?.[0]?.groundingMetadata?.groundingChunks;
       onUpdate(fullText, groundingChunks);
    }
  } catch (error: any) {
    if (isQuotaExhausted(error)) throw new Error("QUOTA_EXHAUSTED");
    if (isInvalidKey(error)) throw new Error("INVALID_KEY");
    throw error;
  }
};

export const getLookupAnalysis = async (snippet: string): Promise<LookupResult> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: 'gemini-3-pro-preview',
      contents: `Perform a deep philological and cultural analysis of the Tibetan text snippet: "${snippet}".`,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "宗师无言。";
    return {
      text,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };
  } catch (error: any) {
    if (isQuotaExhausted(error)) return { text: "QUOTA_EXHAUSTED" };
    if (isInvalidKey(error)) return { text: "INVALID_KEY" };
    return { text: "ERROR_OCCURRED" };
  }
};

export const parseMemoryUpdate = (text: string): Partial<ProjectMemory> | null => {
  const projectMatch = text.match(/Project:\s*([^\n]+)/i);
  const styleMatch = text.match(/Style:\s*([^\n]+)/i);
  const chapterMatch = text.match(/Chapter:\s*([^\n]+)/i);
  const loreMatch = text.match(/Lore:\s*([^\n]+)/i);
  if (styleMatch || chapterMatch || loreMatch) {
    return {
      projectName: projectMatch ? projectMatch[1].trim() : undefined,
      styleProfile: styleMatch ? styleMatch[1].trim() : undefined,
      narrativeProgress: chapterMatch ? chapterMatch[1].trim() : undefined,
      keyCitations: loreMatch ? [loreMatch[1].trim()] : undefined
    };
  }
  return null;
};

export const resetChat = () => { chatSession = null; };
