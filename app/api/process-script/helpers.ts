// API keys from environment variables
const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY
const SERPAPI_KEY = process.env.SERPAPI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

import OpenAI from "openai";

export type VideoProvider = "pexels" | "pixabay"

// Rate limiting settings
const RATE_LIMIT = {
  maxRequestsPerMinute: 7,
  requestInterval: 60000 / 7, // Milliseconds between requests (approx 8.6 seconds)
  backoffFactor: 1.5, // Exponential backoff factor
  maxRetries: 3, // Maximum number of retries
  lastRequestTime: 0, // Timestamp of the last request
}

// Initialize OpenAI client
let openaiClient: OpenAI | null = null;

// Helper function to get OpenAI client
function getOpenAIClient() {
  if (!openaiClient) {
    if (!OPENAI_API_KEY) {
      throw new Error("OpenAI API key is not configured");
    }
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Sleep function for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Generate images using DALL-E 3 with rate limiting
export async function generateAIImage(prompt: string, retryCount: number = 0) {
  try {
    const client = getOpenAIClient();
    
    // Enhanced prompt with better instructions
    const enhancedPrompt = `Create a high-quality, realistic image for a video presentation that depicts: ${prompt}. Make it visually appealing, well-composed, and suitable for a professional presentation. The image should be clean, clear, and focused on the main subject.`;
    
    // Calculate time since last request
    const now = Date.now();
    const timeSinceLastRequest = now - RATE_LIMIT.lastRequestTime;
    
    // If we need to wait to respect rate limit
    if (timeSinceLastRequest < RATE_LIMIT.requestInterval) {
      const waitTime = RATE_LIMIT.requestInterval - timeSinceLastRequest;
      console.log(`Rate limiting - waiting ${Math.round(waitTime / 1000)} seconds before next AI image request`);
      await sleep(waitTime);
    }
    
    // Update last request time
    RATE_LIMIT.lastRequestTime = Date.now();
    
    console.log(`Generating AI image for prompt: "${prompt.substring(0, 50)}..."`);
    
    const response = await client.images.generate({
      model: "dall-e-3",
      prompt: enhancedPrompt,
      n: 1,
      size: "1024x1024",
      style: "natural", // Use natural style for more realistic images
    });
    
    // Return the image URL and the revised prompt that DALL-E actually used
    return {
      url: response.data[0].url,
      width: 1024,
      height: 1024,
      revisedPrompt: response.data[0].revised_prompt,
      thumbnail: response.data[0].url, // Use the same URL as thumbnail
    };
  } catch (error: any) {
    // Check if it's a rate limit error
    const isRateLimit = error.status === 429 || 
                        (error.message && error.message.includes("rate limit")) ||
                        (error.error && error.error.message && error.error.message.includes("rate limit"));
    
    if (isRateLimit && retryCount < RATE_LIMIT.maxRetries) {
      // Calculate backoff time using exponential backoff
      const backoffTime = RATE_LIMIT.requestInterval * Math.pow(RATE_LIMIT.backoffFactor, retryCount);
      
      console.warn(`Rate limit hit for AI image generation. Retrying in ${Math.round(backoffTime / 1000)} seconds... (Attempt ${retryCount + 1}/${RATE_LIMIT.maxRetries})`);
      
      // Wait for backoff period
      await sleep(backoffTime);
      
      // Retry with incremented retry count
      return generateAIImage(prompt, retryCount + 1);
    }
    
    console.error("Error generating AI image:", error);
    throw new Error(`Failed to generate AI image: ${error instanceof Error ? error.message : "Unknown error"}`);
  }
}

// Implement Pexels API call
export async function searchPexelsVideos(query: string) {
  if (!PEXELS_API_KEY) {
    throw new Error("Pexels API key is not configured")
  }

  const response = await fetch(
    `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=5&orientation=landscape`,
    {
      headers: {
        Authorization: PEXELS_API_KEY,
      },
    }
  )

  if (!response.ok) {
    throw new Error(`Pexels API error: ${response.statusText}`)
  }

  const data = await response.json()
  return {
    page: data.page,
    per_page: data.per_page,
    total_results: data.total_results,
    videos: data.videos.map((video: any) => ({
      id: video.id,
      url: video.url,
      image: video.image,
      duration: video.duration,
      width: video.width,
      height: video.height,
      downloadUrl: video.video_files[0]?.link,
    })),
  }
}

// Implement Pixabay API call
export async function searchPixabayVideos(query: string) {
  if (!PIXABAY_API_KEY) {
    throw new Error("Pixabay API key is not configured")
  }

  const response = await fetch(
    `https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=${encodeURIComponent(query)}&per_page=5`,
  )

  if (!response.ok) {
    throw new Error(`Pixabay API error: ${response.statusText}`)
  }

  const data = await response.json()
  return {
    page: 1,
    per_page: 5,
    total_results: data.totalHits,
    videos: data.hits.map((video: any) => ({
      id: video.id,
      url: video.pageURL,
      image: video.videos.large.thumbnail || video.videos.medium.thumbnail,
      duration: video.duration,
      width: video.videos.large.width || video.videos.medium.width,
      height: video.videos.large.height || video.videos.medium.height,
      downloadUrl: video.videos.large.url || video.videos.medium.url,
    })),
  }
}

// Function to search for images using SerpApi
export async function searchImages(query: string, numImages: number = 5) {
  if (!SERPAPI_KEY) {
    throw new Error("SerpApi key is not configured")
  }

  const response = await fetch(
    `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=${numImages}&api_key=${SERPAPI_KEY}`
  )

  if (!response.ok) {
    throw new Error(`SerpApi error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.images_results.map((img: any) => ({
    url: img.original,
    width: img.original_width,
    height: img.original_height,
    thumbnail: img.thumbnail
  }))
} 