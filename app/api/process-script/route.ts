import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

// API keys from environment variables
const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY

// In-memory storage for results (in a production app, use a database)
let processingResults: any = null

type VideoProvider = "pexels" | "pixabay"

// Implement Pexels API call
async function searchPexelsVideos(query: string) {
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
async function searchPixabayVideos(query: string) {
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

// Function to search videos based on provider
async function searchVideos(query: string, provider: VideoProvider) {
  return provider === "pexels" ? searchPexelsVideos(query) : searchPixabayVideos(query)
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const videosPerMinute = Number.parseInt(formData.get("videosPerMinute") as string) || 10
    const provider = (formData.get("provider") as VideoProvider) || "pexels"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Read file content
    const fileContent = await file.text()

    // Calculate audio duration
    const wordCount = fileContent.split(/\s+/).filter(Boolean).length
    const durationInMinutes = wordCount / 120 // 120 words per minute

    // Calculate how many sentences we need based on videos per minute
    const totalVideosNeeded = Math.ceil(durationInMinutes * videosPerMinute)

    // Manually split the script into sentences
    const sentences = fileContent
      .replace(/([.!?])\s+/g, "$1|")
      .split("|")
      .map(s => s.trim())
      .filter(s => s.length > 0)

    // Generate video search queries for each sentence
    const videoQueries = await Promise.all(
      sentences.map(async (sentence) => {
        const { text: query } = await generateText({
          model: openai("gpt-4o-mini"),
          prompt: `
            Create a short, specific search query for finding a video that matches this sentence:
            "${sentence}"
            
            The query will be used to search for stock videos on ${provider === "pexels" ? "Pexels" : "Pixabay"}.
            Return ONLY the search query, no explanations or quotes.
            Make it descriptive of the visual scene, not just repeating the words.
          `,
        })

        return {
          sentence,
          query: query.trim(),
        }
      }),
    )

    // Search for videos using selected API
    const videoResults = await Promise.all(
      videoQueries.map(async ({ sentence, query }) => {
        const response = await searchVideos(query, provider)
        return {
          sentence,
          query,
          videos: response.videos,
        }
      }),
    )

    // Store results for the results page
    processingResults = {
      wordCount,
      durationInMinutes,
      totalVideosNeeded,
      videoResults,
      provider,
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error processing script:", error)
    return NextResponse.json({ error: "Failed to process script" }, { status: 500 })
  }
}

export async function GET() {
  if (!processingResults) {
    return NextResponse.json({ error: "No results available" }, { status: 404 })
  }

  return NextResponse.json(processingResults)
}

