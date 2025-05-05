import axios from 'axios';

// API base URL - can be configured from environment variables
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

// Create axios instance with default config
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Define provider type
export type ContentProvider = 'pexels' | 'pixabay' | 'minimax' | 'google' | 'openai-gpt-image';

// API endpoints
export const endpoints = {
  // Document processing (script to content)
  processScript: '/api/process-script',
  
  // Video concatenation
  concatenateVideos: '/api/concatenate-videos',
  
  // AI image generation
  generateAiImage: '/api/generate-ai-image',
  
  // Regenerate content
  regenerateContent: '/api/regenerate',
  
  // Video streaming
  getVideo: (sessionId: string, filename: string) => `/api/videos/${sessionId}/${filename}`,
};

// Types for API responses
export interface TaskResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  message: string;
}

export interface TaskStatusResponse {
  task_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  result?: any;
  error?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface VideoResult {
  id?: string;
  width?: number;
  height?: number;
  duration?: number;
  image?: string;
  downloadUrl: string;
  user?: string;
}

export interface ImageResult {
  url: string;
  width?: number;
  height?: number;
  thumbnail?: string;
  isAiGenerated?: boolean;
  source?: string;
}

export interface ContentSection {
  segment: string;
  query: string;
  videos: VideoResult[];
  images: ImageResult[];
  aiImages: any[];
  imageDurations: number[];
  segmentDuration: number;
  index: number;
}

export interface ContentSequenceItem {
  type: 'image' | 'video';
  contentId: string;
  duration: number;
  sectionIndex: number;
}

// API functions
export async function uploadScript(
  file: File,
  mode: 'videos' | 'images' | 'mixed',
  options: {
    videosPerMinute?: number;
    imagesPerMinute?: number;
    provider?: ContentProvider;
    theme?: string;
    generateAiImages?: boolean;
  } = {}
) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('mode', mode);
  
  if (options.videosPerMinute) {
    formData.append('videos_per_minute', options.videosPerMinute.toString());
  }
  
  if (options.imagesPerMinute) {
    formData.append('images_per_minute', options.imagesPerMinute.toString());
  }
  
  if (options.provider) {
    formData.append('provider', options.provider);
  }
  
  if (options.theme) {
    formData.append('theme', options.theme);
  }
  
  if (options.generateAiImages !== undefined) {
    formData.append('generate_ai_images', options.generateAiImages.toString());
  }
  
  const response = await apiClient.post<TaskResponse>(endpoints.processScript, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  
  return response.data;
}


export async function concatenateVideos(
  contentSequence: ContentSequenceItem[],
  videos: VideoResult[],
  images: ImageResult[]
) {
  const response = await apiClient.post<TaskResponse>(endpoints.concatenateVideos, {
    contentSequence,
    videos,
    images,
  });
  
  return response.data;
}


export async function regenerateContent(
  sectionIndex: number,
  customQuery: string,
  mode: 'videos' | 'images' | 'mixed',
  options: {
    provider?: ContentProvider;
    theme?: string;
    generateNewQuery?: boolean;
    generateAiImages?: boolean;
  } = {}
) {
  const response = await apiClient.post(endpoints.regenerateContent, {
    sectionIndex,
    customQuery,
    mode,
    ...options,
  });
  
  return response.data;
}

export async function generateAiImage(
  prompt: string,
  provider: ContentProvider,
  width: number = 1024,
  height: number = 1024
) {
  const response = await apiClient.post(endpoints.generateAiImage, {
    prompt,
    provider,
    width,
    height,
  });
  
  return response.data;
}

export default apiClient; 