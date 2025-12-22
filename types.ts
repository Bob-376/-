
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
  history?: string[]; // Array of previous message texts
  isStreaming?: boolean;
  timestamp: number;
  reactions?: Record<string, number>;
  groundingChunks?: GroundingChunk[];
  isPinned?: boolean;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
  error: string | null;
}
