import axios from 'axios';

/**
 * Initiate video concatenation for a job
 * @param jobId The ID of the job to concatenate videos for
 */
export const concatenateJobVideos = async (jobId: string): Promise<any> => {
  try {
    // Use the Next.js API route instead of calling the backend directly
    const response = await axios.post('/api/concatenate', {
      job_id: jobId
    });
    return response.data;
  } catch (error) {
    console.error('Error starting video concatenation:', error);
    throw error;
  }
};

/**
 * Get the status of a video concatenation job
 * @param jobId The ID of the job to check status for
 */
export const getConcatenationStatus = async (jobId: string): Promise<any> => {
  try {
    // Use the Next.js API route instead of calling the backend directly
    const response = await axios.get(`/api/concatenate?job_id=${jobId}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching concatenation status:', error);
    throw error;
  }
}; 