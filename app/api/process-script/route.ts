import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

// Import helpers instead of defining them inline
import { searchPexelsVideos, searchPixabayVideos, searchImages, generateAIImage, type VideoProvider } from "./helpers"

// In-memory storage for results (in a production app, use a database)
let processingResults: any = null

// Function to search videos based on provider
async function searchVideos(query: string, provider: VideoProvider) {
  return provider === "pexels" ? searchPexelsVideos(query) : searchPixabayVideos(query)
}

// Average speaking rate in words per minute
const WORDS_PER_MINUTE = 120

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
    const theme = formData.get("theme") as string || ""
    const generateAiImages = formData.get("generateAiImages") === "true"

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    // Read file content
    const fileContent = await file.text()

    // Calculate total word count
    const wordCount = fileContent.split(/\s+/).filter(Boolean).length
    
    // Calculate total audio duration (total script)
    const totalDurationInSeconds = (wordCount / WORDS_PER_MINUTE) * 60
    
    // Calculate segment duration and number of segments based on the selected mode
    let contentPerMinute: number;
    if (mode === "videos") {
      contentPerMinute = videosPerMinute;
    } else if (mode === "images") {
      contentPerMinute = imagesPerMinute;
    } else {
      // For mixed mode, use an average of both
      contentPerMinute = (videosPerMinute + imagesPerMinute) / 2;
    }
    
    // Calculate segment duration based on content per minute
    const segmentDurationInSeconds = 60 / contentPerMinute;
    const totalSegments = Math.ceil(totalDurationInSeconds / segmentDurationInSeconds);
    
    // Calculate words per segment
    const wordsPerSegment = Math.ceil(wordCount / totalSegments);
    
    // Calculate target duration for each segment (as specified: wordsPerSegment / 2)
    const targetSegmentDuration = wordsPerSegment / 2;

    // Split script into words and then create segments with approximately equal word counts
    const words = fileContent.split(/\s+/).filter(Boolean);
    const segments: string[] = [];
    
    for (let i = 0; i < words.length; i += wordsPerSegment) {
      const segment = words.slice(i, i + wordsPerSegment).join(" ");
      if (segment) segments.push(segment);
    }

    // Prepare the theme context for the prompt
    const themeContext = theme ? `This script is about: "${theme}". ` : "";

    // Generate content queries for each segment
    const contentQueries = await Promise.all(
      segments.map(async (segment) => {
        const { text: query } = await generateText({
          model: openai("gpt-4o-mini"),
          prompt: `
            ${themeContext}Create a short, specific search query for finding ${mode === "images" ? "an image" : "a video"} that matches this segment (4 words max).
            The segment might be a question, a reference to a scene name, a meme or similar, you have to provide a query
            that refers to general known objects, for example:

            "A stegosaurus rex roaming the savannah" -> "dinosaur in savannah"

            Segment:
            "${segment}"
            
            ${theme ? `Remember, the overall theme is: "${theme}".` : ""}
            
            The query will be used to search for ${mode === "images" ? "images on Google Images" : `stock videos on ${provider === "pexels" ? "Pexels" : "Pixabay"}`}.
            Return ONLY the search query, no explanations or quotes.
            Make it descriptive of the visual scene, not just repeating the words.
          `,
        })

        return {
          segment,
          query: query.trim(),
          duration: targetSegmentDuration,
        }
      }),
    )

    // Search for content using selected API
    const contentResults = await Promise.all(
      contentQueries.map(async ({ segment, query, duration }) => {
        let videos: any[] = []
        let images: any[] = []
        let aiImages: any[] = []
        let imageDurations: number[] = []

        if (mode === "videos" || mode === "mixed") {
          const videoResponse = await searchVideos(query, provider)
          videos = videoResponse.videos.map((v: any) => ({ ...v, targetDuration: duration }))
        }

        if (mode === "images" || mode === "mixed") {
          const imageResponse = await searchImages(query)
          images = imageResponse
          // Use the target duration for all images in this segment
          imageDurations = images.map(() => duration)
        }

        // Generate AI images if requested
        if (generateAiImages) {
          try {
            // Create a better prompt for AI image generation by using both the segment and search query
            let aiPrompt = "";
            
            // If the theme is provided, include it for context
            if (theme) {
              aiPrompt += `Theme: ${theme}. `;
            }
            
            // Add the segment for context
            aiPrompt += `Create a visual representation of: "${segment}". `;
            
            // Add the search query for more specific guidance
            aiPrompt += `Focus on: ${query}.`;
            
            const aiImage = await generateAIImage(aiPrompt);
            aiImages = [aiImage];
            
            // Add the AI image to regular images array so it can be displayed in the UI
            images.unshift({
              ...aiImage,
              isAiGenerated: true
            });
            
            // Add duration for the AI image
            imageDurations.unshift(duration);
            
            console.log(`Generated AI image for segment: "${segment.substring(0, 50)}..."`);
          } catch (error) {
            console.error(`Failed to generate AI image for segment: "${segment.substring(0, 50)}..."`, error);
            // Continue processing even if AI image generation fails
          }
        }

        return {
          segment,
          query,
          videos,
          images,
          aiImages,
          imageDurations,
          segmentDuration: duration
        }
      }),
    )

    // Store results for the results page
    processingResults = {
      wordCount,
      totalDurationInSeconds,
      totalSegments,
      wordsPerSegment,
      targetSegmentDuration,
      contentResults,
      provider,
      mode,
      theme,
      generateAiImages,
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

  const { totalDurationInSeconds, ...rest } = processingResults
  return NextResponse.json({ totalDurationInSeconds, ...rest })
}

