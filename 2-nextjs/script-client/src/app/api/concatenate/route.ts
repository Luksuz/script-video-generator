import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';

// Get the API base URL from the environment or use a default
const API_BASE_URL = process.env.BACKEND_API_URL || 'http://localhost:8000';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Validate required fields
    if (!data.job_id) {
      return NextResponse.json(
        { error: 'Missing required field: job_id' },
        { status: 400 }
      );
    }
    
    // Call the backend API to start video concatenation
    const response = await axios.post(`${API_BASE_URL}/api/concatenate-videos/from-job`, {
      job_id: data.job_id
    });
    
    // Return the response from the backend
    return NextResponse.json(response.data);
    
  } catch (error: any) {
    console.error('Error starting video concatenation:', error);
    
    // Handle different types of errors
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      return NextResponse.json(
        { error: error.response.data.message || 'Failed to start video concatenation' },
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

export async function GET(request: NextRequest) {
  try {
    // Extract job_id from the URL
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('job_id');
    
    if (!jobId) {
      return NextResponse.json(
        { error: 'Missing required parameter: job_id' },
        { status: 400 }
      );
    }
    
    // Call the backend API to get concatenation status
    const response = await axios.get(`${API_BASE_URL}/api/concatenate-videos/status/${jobId}`);
    
    // Return the response from the backend
    return NextResponse.json(response.data);
    
  } catch (error: any) {
    console.error('Error fetching concatenation status:', error);
    
    // Handle different types of errors
    if (error.response) {
      // If the API returns a 404, it means no concatenation job exists
      if (error.response.status === 404) {
        return NextResponse.json(
          { concatenated_video_status: null },
          { status: 200 }
        );
      }
      
      return NextResponse.json(
        { error: error.response.data.message || 'Failed to fetch concatenation status' },
        { status: error.response.status }
      );
    } else if (error.request) {
      return NextResponse.json(
        { error: 'No response from server. Please try again later.' },
        { status: 503 }
      );
    } else {
      return NextResponse.json(
        { error: error.message || 'An unexpected error occurred' },
        { status: 500 }
      );
    }
  }
} 