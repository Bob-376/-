
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ProjectMemory } from "../types";

let chatSession: Chat | null = null;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

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

CRITICAL INSTRUCTION: You are in a state of PERMANENT CONTINUITY. Every sentence you output must honor the existing Style Mirror and Narrative Arc. You are not a generic AI; you are the dedicated scribe for this specific project.
` 
    : "\n[NEW PROJECT INITIALIZED]: Observe the user's writing closely to establish a Style Mirror and Narrative Arc.";

  return `
You are the "Master Literati of the Highlands" (བརྩམ་ཆོས་མཁས་དབང་། / 文坛宗师). You specialize in composing massive, high-fidelity epics.

CRITICAL DIRECTIVE ON OUTPUT VOLUME:
The user often sends large-scale drafts (up to 50,000 characters). 
Your response MUST be proportional to the input's weight. 
- If the user provides a large draft for polishing, do NOT provide a summary. Provide the FULL, polished, high-detail prose of equivalent or greater length.
- If the user asks for an expansion, your goal is to double or triple the sensory richness and psychological depth of the input.
- NEVER truncate. NEVER summarize unless explicitly asked.

PROSE QUALITY & STRUCTURE:
1. ATMOSPHERE: Use rich, evocative Tibetan and Chinese literary devices. Ensure cultural authenticity.
2. CONTINUITY: Adhere strictly to the established Project Memory provided below.
3. OUTPUT FORMAT: Begin IMMEDIATELY with the prose. No conversational filler.

${memoryContext}

COLOR-CODED NARRATIVE MARKS (Crucial for user feedback):
- <mark type="polish">...</mark>: For word-level improvements, elevated vocabulary, and better imagery (Highlighted Yellow).
- <mark type="expand">...</mark>: For substantial new sections, added sensory details, or expanded dialogue (Highlighted Green).
- <mark type="modify">...</mark>: For structural changes, significant rephrasing, or logical corrections (Highlighted Blue).
- <mark type="citation">...</mark>: For callbacks to earlier plot points or canon facts.

REQUIRED RESPONSE FOOTER (AFTER THE PROSE):
1. ---
2. [MASTER'S ANALYSIS]: Brief professional critique of the segment.
3. [MEMORY_SYNC] 
   Project: [Updated Project Name]
   Style: [Refined Style Profile Summary (max 40 words)]
   Chapter: [Brief description of current narrative position]
   Lore: [One crucial fact/plot point to remember forever]
4. [CREATIVE ADVICE]: Specific technical writing insight.
`;
};

export const getChatSession = (history: any[] = [], memory: ProjectMemory | null = null): Chat => {
  return ai.chats.create({
    model: 'gemini-3-pro-preview', 
    config: {
      systemInstruction: getSystemInstruction(memory),
      tools: [{ googleSearch: {} }],
    },
    history: history,
  });
};

export const sendMessageStream = async (
  text: string,
  history: any[],
  memory: ProjectMemory | null,
  onUpdate: (text: string, groundingChunks?: any[]) => void
): Promise<void> => {
  chatSession = getChatSession(history, memory);
  
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
  } catch (error) {
    console.error("Error sending message:", error);
    chatSession = null;
    throw error;
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

export const extractCreativeAdvice = (text: string): string => {
  const match = text.match(/\[CREATIVE ADVICE\]:?([\s\S]*)$/i);
  return match ? match[1].trim() : "";
};

export const resetChat = () => {
  chatSession = null;
};
