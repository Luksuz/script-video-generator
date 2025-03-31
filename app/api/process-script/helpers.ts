// API keys from environment variables
const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY
const SERPAPI_KEY = process.env.SERPAPI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

import OpenAI from "openai";

export type VideoProvider = "pexels" | "pixabay"

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

// Generate images using DALL-E 3
export async function generateAIImage(prompt: string) {
  try {
    const client = getOpenAIClient();
    
    // Enhanced prompt with better instructions
    const enhancedPrompt = `Create a high-quality, realistic image for a video presentation that depicts: ${prompt}. Make it visually appealing, well-composed, and suitable for a professional presentation. The image should be clean, clear, and focused on the main subject.`;
    
    console.log(`Generating AI image for prompt: "${prompt}"`);
    
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
  } catch (error) {
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