import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

// Import helpers instead of defining them inline
import { searchPexelsVideos, searchPixabayVideos, searchImages, generateAIImage, type VideoProvider } from "./helpers"

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

    // First, prepare the content results with videos if needed
    const contentResults = await Promise.all(
      contentQueries.map(async ({ segment, query, duration }, index) => {
        let videos: any[] = []
        let images: any[] = []
        let aiImages: any[] = []
        let imageDurations: number[] = []

        // Always fetch videos if needed
        if (mode === "videos" || mode === "mixed") {
          const videoResponse = await searchVideos(query, provider)
          videos = videoResponse.videos.map((v: any) => ({ ...v, targetDuration: duration }))
        }

        // Only search for regular images if AI generation is not enabled
        // or if we're in video-only mode (where images aren't used anyway)
        if ((mode === "images" || mode === "mixed") && !generateAiImages) {
          const imageResponse = await searchImages(query)
          images = imageResponse
          // Use the target duration for all images in this segment
          imageDurations = images.map(() => duration)
        }

        // For AI images, we'll add placeholders that will be filled in later
        // This avoids overwhelming the OpenAI API with too many concurrent requests
        if (generateAiImages && (mode === "images" || mode === "mixed")) {
          // Add an empty placeholder for now
          images = [{
            url: "/placeholder.svg",
            width: 1024,
            height: 1024,
            thumbnail: "/placeholder.svg",
            isAiGenerated: true,
            isPlaceholder: true
          }]
          imageDurations = [duration]
        }

        return {
          segment,
          query,
          videos,
          images,
          aiImages,
          imageDurations,
          segmentDuration: duration,
          index // Keep track of the original index
        }
      }),
    )

    // If AI image generation is enabled, process it in a controlled manner
    if (generateAiImages && (mode === "images" || mode === "mixed")) {
      console.log(`Generating AI images for ${contentResults.length} segments with rate limiting...`);
      
      // Process segments in sequential order with rate limiting
      for (let i = 0; i < contentResults.length; i++) {
        const result = contentResults[i];
        const progress = `(${i + 1}/${contentResults.length})`; // Add progress counter
        
        try {
          // Create a better prompt for AI image generation
          let aiPrompt = "";
          
          // If the theme is provided, include it for context
          if (theme) {
            aiPrompt += `Theme: ${theme}. `;
          }
          
          // Add the segment for context
          aiPrompt += `Create a visual representation of: "${result.segment}". `;
          
          // Add the search query for more specific guidance
          aiPrompt += `Focus on: ${result.query}.`;
          
          // Log progress before starting generation
          console.log(`Generating AI image ${progress}... Prompt: \"${aiPrompt.substring(0, 80)}...\"`);
          
          // Generate the AI image with rate limiting built in
          const aiImage = await generateAIImage(aiPrompt);
          
          // Update the contentResults with the generated image
          result.aiImages = [aiImage];
          result.images = [{
            ...aiImage,
            isAiGenerated: true
          }];
          
          // Log success with progress
          console.log(`Successfully generated AI image ${progress}`);
        } catch (error) {
          // Log failure with progress
          console.error(`Failed to generate AI image ${progress}:`, error);
          
          // If AI image generation fails, fall back to regular image search
          try {
            const imageResponse = await searchImages(result.query)
            result.images = imageResponse
            result.imageDurations = imageResponse.map(() => result.segmentDuration)
          } catch (searchError) {
            console.error(`Failed to fall back to image search:`, searchError);
            // Keep the placeholder if both methods fail
          }
        }
      }
    }

    // Create the results object (remove the index we added temporarily)
    const processedResults = contentResults.map(({ index, ...rest }) => rest);
    
    const processingResults = {
      wordCount,
      totalDurationInSeconds,
      totalSegments,
      wordsPerSegment,
      targetSegmentDuration,
      contentResults: processedResults,
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

