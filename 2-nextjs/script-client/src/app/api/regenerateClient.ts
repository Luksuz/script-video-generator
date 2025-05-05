import { endpoints } from './apiClient';

interface RegenerateContentRequest {
  content_id: string;
  job_id: string;
  query: string;
}

export const regenerateContent = async (data: RegenerateContentRequest): Promise<any> => {
  try {
    // Use the Next.js API route instead of calling the backend directly
    const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL;
    const response = await fetch(`${NEXT_PUBLIC_API_URL}api/process-script/regenerate`, {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    return response.json();
  } catch (error) {
    console.error('Error regenerating content:', error);
    throw error;
  }
}; 