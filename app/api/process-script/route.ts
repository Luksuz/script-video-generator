import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

// API keys from environment variables
const PEXELS_API_KEY = process.env.PEXELS_API_KEY
const PIXABAY_API_KEY = process.env.PIXABAY_API_KEY
const SERPAPI_KEY = process.env.SERPAPI_API_KEY

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

// Function to search for images using SerpApi
async function searchImages(query: string, numImages: number = 5) {
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

// Function to search videos based on provider
async function searchVideos(query: string, provider: VideoProvider) {
  return provider === "pexels" ? searchPexelsVideos(query) : searchPixabayVideos(query)
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const mode = (formData.get("mode") as "images" | "videos" | "mixed") || "videos"
    const videosPerMinute = Number.parseInt(formData.get("videosPerMinute") as string) || 10
    const imagesPerMinute = Number.parseInt(formData.get("imagesPerMinute") as string) || 20
    const imageDurationMin = Number.parseFloat(formData.get("imageDurationMin") as string) || 2
    const imageDurationMax = Number.parseFloat(formData.get("imageDurationMax") as string) || 5
    const provider = (formData.get("provider") as VideoProvider) || "pexels"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Read file content
    const fileContent = await file.text()

    // Calculate audio duration
    const wordCount = fileContent.split(/\s+/).filter(Boolean).length
    const durationInMinutes = wordCount / 120 // 120 words per minute

    // Calculate content needs based on mode
    let totalVideosNeeded = 0
    let totalImagesNeeded = 0

    if (mode === "videos") {
      totalVideosNeeded = Math.ceil(durationInMinutes * videosPerMinute)
    } else if (mode === "images") {
      totalImagesNeeded = Math.ceil(durationInMinutes * imagesPerMinute)
    } else if (mode === "mixed") {
      totalVideosNeeded = Math.ceil(durationInMinutes * videosPerMinute)
      totalImagesNeeded = Math.ceil(durationInMinutes * imagesPerMinute)
    }

    // Split script into sentences
    const sentences = fileContent
      .replace(/([.!?])\s+/g, "$1|")
      .split("|")
      .map(s => s.trim())
      .filter(s => s.length > 0)

    // Generate content queries for each sentence
    const contentQueries = await Promise.all(
      sentences.map(async (sentence) => {
        const { text: query } = await generateText({
          model: openai("gpt-4o-mini"),
          prompt: `
            Create a short, specific search query for finding ${mode === "images" ? "an image" : "a video"} that matches this sentence (4 words max).
            The sentence might be a question, a reference to a scene name, a meme or similar, you have to provide a query
            that refers to general known objects, for example:

            "A stegosaurus rex roaming the savannah" -> "dinosaur in savannah"

            Sentence:
            "${sentence}"
            
            The query will be used to search for ${mode === "images" ? "images on Google Images" : `stock videos on ${provider === "pexels" ? "Pexels" : "Pixabay"}`}.
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

    // Search for content using selected API
    const contentResults = await Promise.all(
      contentQueries.map(async ({ sentence, query }) => {
        let videos: any[] = []
        let images: any[] = []
        let imageDurations: number[] = []

        if (mode === "videos" || mode === "mixed") {
          const videoResponse = await searchVideos(query, provider)
          videos = videoResponse.videos
        }

        if (mode === "images" || mode === "mixed") {
          const imageResponse = await searchImages(query)
          images = imageResponse
          // Generate random durations for images within the specified range
          imageDurations = images.map(() => 
            imageDurationMin + Math.random() * (imageDurationMax - imageDurationMin)
          )
        }

        return {
          sentence,
          query,
          videos,
          images,
          imageDurations
        }
      }),
    )

    // Store results for the results page
    processingResults = {
      wordCount,
      durationInMinutes,
      totalVideosNeeded,
      totalImagesNeeded,
      contentResults,
      provider,
      mode,
      settings: {
        videosPerMinute,
        imagesPerMinute,
        imageDurationRange: [imageDurationMin, imageDurationMax]
      }
    }

    return NextResponse.json(processingResults)
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

