
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  history?: string[]; 
  isStreaming?: boolean;
  timestamp: number;
  reactions?: Record<string, number>;
  groundingChunks?: GroundingChunk[];
  isPinned?: boolean;
}

export interface ProjectMemory {
  styleProfile: string;
  narrativeProgress: string;
  keyCitations: string[];
  lastUpdated: number;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
  memory: ProjectMemory | null;
}
