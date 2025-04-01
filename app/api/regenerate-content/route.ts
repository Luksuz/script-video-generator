import { type NextRequest, NextResponse } from "next/server"
import { generateText } from "ai"
import { openai } from "@ai-sdk/openai"

// Import API functions from the main script processing route
import { searchPexelsVideos, searchPixabayVideos, searchImages, generateAIImage } from "@/app/api/process-script/helpers"

type VideoProvider = "pexels" | "pixabay"

// Function to search videos based on provider
async function searchVideos(query: string, provider: VideoProvider) {
  return provider === "pexels" ? searchPexelsVideos(query) : searchPixabayVideos(query)
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { sectionIndex, customQuery, mode, provider, theme, generateNewQuery, generateAiImages } = body

    if (typeof sectionIndex !== 'number') {
      return NextResponse.json({ error: "Invalid section index" }, { status: 400 })
    }

    if (!['images', 'videos', 'mixed'].includes(mode)) {
      return NextResponse.json({ error: "Invalid mode" }, { status: 400 })
    }

    if (!['pexels', 'pixabay'].includes(provider)) {
      return NextResponse.json({ error: "Invalid provider" }, { status: 400 })
    }

    let searchQuery = customQuery

    // Generate new query based on custom input if requested
    if (generateNewQuery && customQuery && typeof customQuery === 'string') {
      const segment = customQuery.trim()
      
      // Prepare the theme context for the prompt
      const themeContext = theme ? `This script is about: "${theme}". ` : "";
      
      const { text: query } = await generateText({
        model: openai("gpt-4o-mini"),
        prompt: `
          ${themeContext}Create a short, specific search query for finding ${mode === "images" ? "an image" : "a video"} that matches this text (4 words max).
          The text might be a question, a reference to a scene name, a meme or similar, you have to provide a query
          that refers to general known objects.

          Text:
          "${segment}"
          
          ${theme ? `Remember, the overall theme is: "${theme}".` : ""}
          
          The query will be used to search for ${mode === "images" ? "images on Google Images" : `stock videos on ${provider === "pexels" ? "Pexels" : "Pixabay"}`}.
          Return ONLY the search query, no explanations or quotes.
          Make it descriptive of the visual scene, not just repeating the words.
        `,
      })
      
      searchQuery = query.trim()
    } else if (typeof customQuery === 'string') {
      // Sanitize the custom query
      searchQuery = customQuery.trim().substring(0, 100)
    } else {
      return NextResponse.json({ error: "Invalid custom query" }, { status: 400 })
    }

    console.log(`Regenerating content for section ${sectionIndex} with query: "${searchQuery}"`)

    // Generate content based on the selected mode
    let videos = []
    let images = []
    let aiImage = null

    if (mode === "videos" || mode === "mixed") {
      const videoResponse = await searchVideos(searchQuery, provider as VideoProvider)
      videos = videoResponse.videos
    }

    // Only search for regular images if AI generation is not enabled
    // or if we're in video-only mode (where images aren't used anyway)
    if ((mode === "images" || mode === "mixed") && !generateAiImages) {
      const imageResponse = await searchImages(searchQuery)
      images = imageResponse
    }

    // Generate an AI image if requested
    if (generateAiImages && (mode === "images" || mode === "mixed")) {
      try {
        // Create a better prompt for AI image generation
        let aiPrompt = "";
        
        // If the theme is provided, include it for context
        if (theme) {
          aiPrompt += `Theme: ${theme}. `;
        }
        
        // Add the custom query for context
        aiPrompt += `Create a visual representation of: "${customQuery}". `;
        
        // Add the search query for more specific guidance
        aiPrompt += `Focus on: ${searchQuery}.`;
        
        console.log(`Generating AI image for custom query: "${customQuery.substring(0, 50)}..."`);
        
        // Use the rate-limited image generation function
        aiImage = await generateAIImage(aiPrompt);
        
        // When AI images are enabled, we replace the image array entirely
        // rather than just adding the AI image at the beginning
        images = [{
          ...aiImage,
          isAiGenerated: true
        }];
        
        console.log(`Successfully generated AI image for custom query`);
      } catch (error) {
        console.error(`Failed to generate AI image for custom query:`, error);
        
        // If AI image generation fails, fall back to regular image search
        if (mode === "images" || mode === "mixed") {
          try {
            console.log(`Falling back to regular image search for query: "${searchQuery}"`);
            const imageResponse = await searchImages(searchQuery);
            images = imageResponse;
          } catch (searchError) {
            console.error(`Failed to fall back to image search:`, searchError);
            // Return empty array if both methods fail
            images = [];
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      sectionIndex,
      query: searchQuery,
      videos,
      images,
      aiImage
    })
  } catch (error) {
    console.error("Error regenerating content:", error)
    return NextResponse.json({ 
      error: "Failed to regenerate content", 
      details: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 })
  }
} 