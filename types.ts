
export interface GroundingChunk {
  web?: {
    uri: string;
    title: string;
  };
}

export interface MediaItem {
  type: 'image' | 'video';
  data: string;
  mimeType: string;
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
  hasAudio?: boolean;
  mediaItems?: MediaItem[];
}

export interface LookupResult {
  text: string;
  groundingChunks?: GroundingChunk[];
}

export interface ProjectMemory {
  projectName: string;
  styleProfile: string;
  narrativeProgress: string;
  keyCitations: string[];
  lastUpdated: number;
}
