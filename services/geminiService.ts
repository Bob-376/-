
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ProjectMemory, LookupResult } from "../types";

let chatSession: Chat | null = null;

const getSystemInstruction = (memory: ProjectMemory | null) => {
  const memoryContext = memory 
    ? `
[LITERARY PROJECT CONTINUITY - ACTIVE ARCHIVE]
Current Project: "${memory.projectName || '未命名史诗'}"
Status: 连续性引擎已连接 (Continuity Engine Linked)

ESTABLISHED CANON:
- STYLE MIRROR: ${memory.styleProfile || '正在捕获创作基因...'}
- NARRATIVE ARC: ${memory.narrativeProgress || '初期构思阶段'}
- CORE LORE/FACTS: ${memory.keyCitations.length > 0 ? memory.keyCitations.join('; ') : '尚未建立核心引用'}

CRITICAL INSTRUCTION: You are in a state of PERMANENT CONTINUITY. Every sentence you output must honor the existing Style Mirror and Narrative Arc. 
` 
    : "\n[NEW PROJECT INITIALIZED]: Observe the user's writing closely to establish a Style Mirror and Narrative Arc.";

  return `
You are the "Master Literati of the Highlands" (བརྩམ་ཆོས་མཁས་导ང་། / 文坛宗师)。You specialize in composing massive, high-fidelity epics.

CRITICAL DIRECTIVE ON OUTPUT VOLUME (TSHEG COUNT):
The user defines text volume by the number of **Tshegs** (ཚེག།). Drafts can reach up to 50,000 tshegs.
Your response MUST be proportional to the input's weight. 
- If the user provides a large draft for polishing, do NOT provide a summary. Provide the FULL, polished prose.
- NEVER truncate. NEVER summarize unless explicitly asked.

PROSE QUALITY & STRUCTURE:
1. ATMOSPHERE: Use rich, evocative Tibetan and Chinese literary devices. Ensure cultural authenticity.
2. CONTINUITY: Adhere strictly to the established Project Memory.
3. OUTPUT FORMAT: Begin IMMEDIATELY with the prose.

${memoryContext}

COLOR-CODED NARRATIVE MARKS:
- <mark type="polish">...</mark>: For word-level improvements.
- <mark type="expand">...</mark>: For substantial new sections.
- <mark type="modify">...</mark>: For structural changes.

REQUIRED RESPONSE FOOTER:
1. ---
2. [MASTER'S ANALYSIS]: Brief professional critique.
3. [MEMORY_SYNC] 
   Project: [Updated Project Name]
   Style: [Refined Style Profile Summary]
   Chapter: [Current narrative position]
   Lore: [One crucial fact to remember]
4. [CREATIVE ADVICE]: Specific technical writing insight.
`;
};

const isQuotaExhausted = (error: any): boolean => {
  if (!error) return false;
  const message = String(error.message || "").toUpperCase();
  const code = error.code || error.status;
  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429") || message.includes("QUOTA") || code === 429) return true;
  try {
    const parsed = JSON.parse(error.message);
    if (parsed.error?.code === 429 || parsed.error?.status === "RESOURCE_EXHAUSTED") return true;
  } catch (e) {}
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
      contents: `Perform a deep philological and cultural analysis of the Tibetan text snippet: "${snippet}".
      
      Requirements:
      1. Provide an elegant, literary Chinese translation that captures the hidden nuances.
      2. Explain the etymology (if applicable) and cultural resonance of the terms.
      3. Suggest how this snippet might be used to enhance epic storytelling (atmosphere/imagery).
      
      Format your response with clear headers: [宗师译文], [渊源解说], [创作启发]. Keep it concise but profound.
      Use Google Search if the snippet references specific historical figures, monasteries, or rare deities.`,
      config: {
        temperature: 0.1,
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "宗师无言。未获有效解析。";
    return {
      text,
      groundingChunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    };
  } catch (error: any) {
    if (isQuotaExhausted(error)) return { text: "QUOTA_EXHAUSTED" };
    if (isInvalidKey(error)) return { text: "INVALID_KEY" };
    console.error("Lookup Error:", error);
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
