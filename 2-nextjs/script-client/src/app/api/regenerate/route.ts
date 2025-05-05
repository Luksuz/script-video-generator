import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Get the API base URL from the environment or use a default
const API_BASE_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.content_id || !data.job_id || !data.query) {
      return NextResponse.json(
        { error: 'Missing required fields: content_id, job_id, or query' },
        { status: 400 }
      );
    }
    
    // Call the backend API to regenerate the content
    const response = await axios.post(`${API_BASE_URL}/regenerate`, {
      content_id: data.content_id,
      job_id: data.job_id,
      query: data.query
    });
    
    // Return the response from the backend
    return NextResponse.json(response.data);
    
  } catch (error: any) {
    console.error('Error regenerating content:', error);
    
    // Handle different types of errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return NextResponse.json(
        { error: error.response.data.message || 'Failed to regenerate content' },
        { status: error.response.status }
      );
    } else if (error.request) {
      // The request was made but no response was received
      return NextResponse.json(
        { error: 'No response from server. Please try again later.' },
        { status: 503 }
      );
    } else {
      // Something happened in setting up the request that triggered an Error
      return NextResponse.json(
        { error: error.message || 'An unexpected error occurred' },
        { status: 500 }
      );
    }
  }
} 