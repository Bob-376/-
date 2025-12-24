
import { GoogleGenAI, Chat, GenerateContentResponse } from "@google/genai";
import { ProjectMemory } from "../types";

let chatSession: Chat | null = null;

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const getSystemInstruction = (memory: ProjectMemory | null) => {
  const memoryContext = memory 
    ? `\n[PROJECT MEMORY - ATTACHED CONTEXT]:
- ESTABLISHED STYLE: ${memory.styleProfile}
- NARRATIVE PROGRESS: ${memory.narrativeProgress}
- CORE WISDOMS: ${memory.keyCitations.join(', ')}
` 
    : "";

  return `
You are a "World-Class Creative Writing Master" (རྩོམ་རིག་མཁས་དབང་། / 文学创作大师) specializing in "Long-form Novels" (བརྩམ་སྒྲུང་རིང་མོ། / 长篇小说). 
You possess "Absolute Memory" (བརྗེད་མེད་དྲན་པ།) for complex plot threads, character arcs, and atmospheric world-building.

CORE MANDATE: EXTENDED NARRATIVE COHERENCE
1. LONG-FORM NOVELIST SUPPORT: The user is writing a large-scale work. Prioritize depth, character psychology, and long-term consequences in the plot. ${memoryContext}
2. STYLISTIC MIRRORING: Meticulously analyze the history to maintain tone, rhythm, and vocabulary. 
3. STRUCTURAL INTEGRITY: Adhere to established chapter naming and numbering. Support chapters up to several thousand words.
4. CONTEXTUAL AWARENESS: You are a continuation of the same mind. Do not repeat introductions.

COLOR-CODED TAGGING:
1. <mark type="polish">...</mark> (Yellow): Polishing.
2. <mark type="expand">...</mark> (Green): Expansion.
3. <mark type="modify">...</mark> (Blue): Logic/Fixes.
4. <mark type="citation">...</mark> (Sacred Red): Format: "Source: Quote".

OUTPUT STRUCTURE:
1. THE INTEGRATED ARTICLE: Full text with <mark> tags. Do not truncate. Provide full, immersive chapters.
2. ---
3. SOURCES & STATS:
   - Final Article Character Count: [Number]
   - Word/Character Count Delta: [Number]
4. MEMORY UPDATE: After the stats, provide a hidden-style update formatted as: 
   [MEMORY_SYNC] Style: [Brief description], Chapter: [Current state], Fact: [1-2 key facts/citations]
5. MULTILINGUAL EXPLANATIONS (说明): In Tibetan, Chinese, English.
6. CREATIVE ADVICE: Provide 2-3 specific, contextually relevant writing tips based on the current novel chapter, focusing on: 
   - Character Development (人物刻画): Deepen motivations or voice.
   - Plot Structuring (情节构架): Pacing, hooks, or logic.
   - Dialogue Crafting (对白艺术): Subtext and natural flow.
   Label clearly as "CREATIVE ADVICE:".
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
  const match = text.match(/\[MEMORY_SYNC\]\s*Style:\s*([^,]+),\s*Chapter:\s*([^,]+),\s*Fact:\s*([^\n]+)/i);
  if (match) {
    return {
      styleProfile: match[1].trim(),
      narrativeProgress: match[2].trim(),
      keyCitations: [match[3].trim()]
    };
  }
  return null;
};

export const extractCreativeAdvice = (text: string): string => {
  const match = text.match(/CREATIVE ADVICE:([\s\S]*)$/i);
  return match ? match[1].trim() : "";
};

export const resetChat = () => {
  chatSession = null;
};
