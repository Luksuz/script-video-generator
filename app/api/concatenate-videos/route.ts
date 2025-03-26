import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import { writeFile, mkdir, unlink } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"
import { v4 as uuidv4 } from "uuid"

const SERPAPI_KEY = process.env.SERPAPI_KEY

// Add these interfaces at the top of the file, after the imports
interface ImageResult {
  url: string
  width?: number
  height?: number
  thumbnail?: string
}

interface VideoResult {
  downloadUrl: string
  width?: number
  height?: number
  duration?: number
}

// Add this interface after the existing interfaces
interface ContentSection {
  type: 'image' | 'video'
  content: ImageResult | VideoResult
  duration: number
  sectionIndex: number // To help UI know which section this belongs to
}

// Add these new interfaces after the existing ones
interface MediaItem {
  type: 'image' | 'video'
  path: string
  duration?: number
  width?: number
  height?: number
}

// Add this interface after the existing interfaces
interface ContentSequenceItem {
  type: 'image' | 'video'
  contentId: string
  duration: number
  sectionIndex: number
}

// Add these helper functions for duration optimization
interface DurationRange {
  min: number
  max: number
  preferred?: number
}

function getDurationRanges(mediaList: MediaItem[]): DurationRange[] {
  return mediaList.map(item => {
    if (item.type === 'video') {
      // For videos, use the original duration as preferred, with a range of ±30%
      const duration = item.duration || 3
      return {
        min: Math.max(1, Math.floor(duration * 0.7)),
        max: Math.ceil(duration * 1.3),
        preferred: duration
      }
    } else {
      // For images, allow 2-6 seconds with no strong preference
      return {
        min: 2,
        max: 6
      }
    }
  })
}

function calculateDurationScore(durations: number[], ranges: DurationRange[]): number {
  let score = 0
  for (let i = 0; i < durations.length; i++) {
    const duration = durations[i]
    const range = ranges[i]
    
    // Penalize if outside min/max range
    if (duration < range.min) {
      score -= 1000 * (range.min - duration)
    }
    if (duration > range.max) {
      score -= 1000 * (duration - range.max)
    }
    
    // Prefer original duration for videos
    if (range.preferred) {
      score -= Math.abs(duration - range.preferred) * 10
    }
    
    // Prefer smoother transitions (less variance between adjacent durations)
    if (i > 0) {
      score -= Math.abs(duration - durations[i - 1]) * 5
    }
  }
  return score
}

function optimizeDurations(mediaList: MediaItem[], targetDuration: number): MediaItem[] {
  const ranges = getDurationRanges(mediaList)
  const n = mediaList.length
  
  if (n === 0) return mediaList
  
  // Initialize with proportional distribution
  let bestDurations = mediaList.map(item => item.duration || 3)
  const totalCurrent = bestDurations.reduce((sum, d) => sum + d, 0)
  const scaleFactor = targetDuration / totalCurrent
  bestDurations = bestDurations.map(d => Math.max(1, Math.floor(d * scaleFactor)))
  
  let bestScore = calculateDurationScore(bestDurations, ranges)
  let bestTotal = bestDurations.reduce((sum, d) => sum + d, 0)
  
  // Try different permutations using local search
  const maxIterations = 1000
  const maxNoImprovement = 100
  let noImprovement = 0
  
  for (let iter = 0; iter < maxIterations && noImprovement < maxNoImprovement; iter++) {
    // Make a random adjustment
    const newDurations = [...bestDurations]
    const i = Math.floor(Math.random() * n)
    const delta = Math.floor(Math.random() * 3) - 1 // -1, 0, or 1
    
    // Ensure we don't go below minimum duration
    if (newDurations[i] + delta >= ranges[i].min) {
      newDurations[i] += delta
      
      // Find another duration to adjust to maintain total
      const j = Math.floor(Math.random() * n)
      if (i !== j && newDurations[j] - delta >= ranges[j].min) {
        newDurations[j] -= delta
        
        const newTotal = newDurations.reduce((sum, d) => sum + d, 0)
        const newScore = calculateDurationScore(newDurations, ranges)
        
        // Accept if better score and total duration is closer or same
        if (newScore > bestScore && 
            Math.abs(newTotal - targetDuration) <= Math.abs(bestTotal - targetDuration)) {
          bestDurations = newDurations
          bestScore = newScore
          bestTotal = newTotal
          noImprovement = 0
        } else {
          noImprovement++
        }
      }
    }
  }
  
  // Handle any remaining difference in total duration
  const finalDiff = targetDuration - bestTotal
  if (finalDiff !== 0) {
    // Distribute the difference across all items while respecting minimums
    const perItem = Math.floor(finalDiff / n)
    let remaining = finalDiff
    
    for (let i = 0; i < n && remaining !== 0; i++) {
      const maxAdjust = Math.min(
        remaining, 
        remaining > 0 ? ranges[i].max - bestDurations[i] : bestDurations[i] - ranges[i].min
      )
      bestDurations[i] += maxAdjust
      remaining -= maxAdjust
    }
  }
  
  // Return adjusted media list
  return mediaList.map((item, i) => ({
    ...item,
    duration: bestDurations[i]
  }))
}

// Helper to check if URL is likely to be downloadable
function isDownloadableUrl(url: string): boolean {
  const problematicDomains = [
    'instagram.com',
    'lookaside.instagram.com',
    'facebook.com',
    'fbcdn.net',
    'twitter.com',
    'twimg.com'
  ]
  
  try {
    const urlObj = new URL(url)
    return !problematicDomains.some(domain => urlObj.hostname.includes(domain))
  } catch {
    return false
  }
}

// Helper to search for images using SerpApi
async function searchImages(query: string, numImages: number = 5) {
  if (!SERPAPI_KEY) {
    throw new Error("SerpApi key is not configured")
  }

  const response = await fetch(
    `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&num=${numImages * 2}&api_key=${SERPAPI_KEY}`
  )

  if (!response.ok) {
    throw new Error(`SerpApi error: ${response.statusText}`)
  }

  const data = await response.json()
  return data.images_results
    .filter((img: any) => isDownloadableUrl(img.original))
    .slice(0, numImages)
    .map((img: any) => ({
      url: img.original,
      width: img.original_width,
      height: img.original_height,
      thumbnail: img.thumbnail
    }))
}

// Helper to ensure dimensions are even numbers
function getEvenDimensions(width: number, height: number, maxWidth: number = 854): { width: number; height: number } {
  // Scale down if width exceeds maxWidth
  if (width > maxWidth) {
    height = Math.floor((height * maxWidth) / width)
    width = maxWidth
  }
  
  // Ensure both dimensions are even numbers
  width = Math.floor(width / 2) * 2
  height = Math.floor(height / 2) * 2
  
  return { width, height }
}

// Helper to convert an image to video using FFmpeg
async function imageToVideo(
  imagePath: string,
  outputPath: string,
  duration: number,
  resolution: { width: number; height: number }
): Promise<void> {
  // Ensure dimensions are even numbers
  const { width, height } = getEvenDimensions(resolution.width, resolution.height)
  
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-y", // Overwrite output file if it exists
      "-loop", "1",
      "-i", imagePath,
      "-t", duration.toString(),
      "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,format=yuv420p,setsar=1:1`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-tune", "stillimage", // Optimize for still image input
      "-movflags", "+faststart", // Enable fast start for web playback
      "-pix_fmt", "yuv420p",
      "-an", // No audio
      "-sn", // No subtitles
      "-r", "30", // Set frame rate
      "-g", "30", // Set keyframe interval
      "-keyint_min", "30", // Minimum keyframe interval
      "-force_key_frames", "expr:gte(t,0)",
      outputPath
    ])

    let errorOutput = ""

    ffmpeg.stderr.on("data", (data) => {
      const message = data.toString()
      errorOutput += message
      console.log(`FFmpeg image conversion: ${message}`)
    })

    ffmpeg.on("error", (error) => {
      console.error("FFmpeg process error:", error)
      reject(new Error(`FFmpeg process error: ${error.message}\n${errorOutput}`))
    })

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Image to video conversion failed with code ${code}\nFFmpeg output: ${errorOutput}`))
      }
    })
  })
}

// Helper to download an image or video with retry logic
async function downloadContent(url: string, outputPath: string, isVideo: boolean = false): Promise<void> {
  // First check if the URL is downloadable
  if (!isDownloadableUrl(url)) {
    throw new Error(`URL from unsupported domain: ${url}`)
  }

  const retries = 2
  const retryDelay = 1000 // 1 second

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt} for ${url}`)
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
      }

      const response = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          'Accept': 'image/*, video/*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': 'https://www.google.com/',
          'Sec-Fetch-Dest': isVideo ? 'video' : 'image',
          'Sec-Fetch-Mode': 'no-cors',
          'Sec-Fetch-Site': 'cross-site'
        }
      })

      if (!response.ok) {
        console.error(`Download attempt ${attempt + 1} failed with status: ${response.status} ${response.statusText}`)
        if (attempt === retries) {
          throw new Error(`Failed to download content: ${response.status} ${response.statusText}`)
        }
        continue
      }

      const buffer = await response.arrayBuffer()
      await writeFile(outputPath, Buffer.from(buffer))
      console.log(`Successfully downloaded content to ${outputPath}`)
      return
    } catch (error) {
      console.error(`Error during download attempt ${attempt + 1}:`, error)
      if (attempt === retries) {
        throw error
      }
    }
  }
}

// Add this helper function after the existing helper functions
async function standardizeVideo(
  inputPath: string,
  outputPath: string,
  targetWidth: number = 854,
  targetHeight: number = 480
): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-i", inputPath,
      "-vf", `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1:1`,
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "23",
      "-pix_fmt", "yuv420p",
      "-r", "30",
      "-an",
      "-force_key_frames", "expr:gte(t,0)",
      outputPath
    ])

    ffmpeg.stderr.on("data", (data) => {
      console.log(`FFmpeg standardization: ${data}`)
    })

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve()
      } else {
        reject(new Error(`Video standardization failed with code ${code}`))
      }
    })
  })
}

async function createMixedMediaVideo(mediaList: MediaItem[], outputPath: string): Promise<void> {
  const tempFiles: string[] = []
  const TARGET_WIDTH = 854
  const TARGET_HEIGHT = 480
  
  try {
    // Process each media item
    for (let i = 0; i < mediaList.length; i++) {
      const item = mediaList[i]
      const tempOutput = join(process.cwd(), "temp", `temp_${i}_converted.mp4`)
      tempFiles.push(tempOutput)
      
      if (item.type === 'image') {
        // Convert image to video with consistent dimensions and SAR
        await imageToVideo(
          item.path,
          tempOutput,
          item.duration || 3,
          {
            width: TARGET_WIDTH,
            height: TARGET_HEIGHT
          }
        )
      } else if (item.type === 'video') {
        // Standardize video format with consistent dimensions and SAR
        await standardizeVideo(item.path, tempOutput, TARGET_WIDTH, TARGET_HEIGHT)
      } else {
        throw new Error(`Unsupported media type: ${item.type}`)
      }
    }

    // Create filter complex for concatenation with SAR correction
    const filterInputs = tempFiles.map((_, i) => `[${i}:v]setsar=1:1[v${i}];`).join('')
    const concatInputs = tempFiles.map((_, i) => `[v${i}]`).join('')
    const filterComplex = `${filterInputs}${concatInputs}concat=n=${tempFiles.length}:v=1:a=0[outv]`

    // Build input arguments
    const inputArgs = tempFiles.reduce((args, file) => {
      args.push('-i', file)
      return args
    }, [] as string[])

    // Concatenate all files with consistent SAR
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", [
        ...inputArgs,
        "-filter_complex", filterComplex,
        "-map", "[outv]",
        "-c:v", "libx264",
        "-preset", "medium",
        "-crf", "23",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        outputPath
      ])

      ffmpeg.stderr.on("data", (data) => {
        console.log(`FFmpeg concatenation: ${data}`)
      })

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Concatenation failed with code ${code}`))
        }
      })
    })
  } finally {
    // Clean up temporary files
    await cleanupTempFiles(tempFiles)
  }
}

async function cleanupTempFiles(files: string[]): Promise<void> {
  for (const file of files) {
    try {
      if (existsSync(file)) {
        await unlink(file)
      }
    } catch (error) {
      console.error(`Error cleaning up file ${file}:`, error)
    }
  }
}

// Update the POST handler to use duration adjustment
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("Received request body:", body)

    const {
      mode = "videos",
      videos = [],
      images = [],
      imageDurations = [],
      imageQueries = [],
      totalDuration = 60,
      contentSequence = [] as ContentSequenceItem[]
    } = body

    // Create session directory
    const sessionId = uuidv4()
    const sessionDir = join(process.cwd(), "temp", sessionId)
    await mkdir(sessionDir, { recursive: true })

    // Create maps for quick lookup, filtering out problematic URLs
    const videoMap = new Map(
      videos
        .filter((v: VideoResult) => isDownloadableUrl(v.downloadUrl))
        .map((v: VideoResult) => [v.downloadUrl, v])
    )
    const imageMap = new Map(
      images
        .filter((i: ImageResult) => isDownloadableUrl(i.url))
        .map((i: ImageResult) => [i.url, i])
    )

    // Prepare media list based on content sequence
    const mediaList: MediaItem[] = []

    // Process content in the order specified by contentSequence
    for (const item of contentSequence) {
      if (item.type === 'video') {
        const video = videoMap.get(item.contentId) as VideoResult | undefined
        if (video?.downloadUrl) {
          const videoPath = join(sessionDir, `video_${mediaList.length}.mp4`)
          await downloadContent(video.downloadUrl, videoPath, true)
          mediaList.push({
            type: 'video',
            path: videoPath,
            width: video.width,
            height: video.height,
            duration: item.duration
          })
        }
      } else if (item.type === 'image') {
        const image = imageMap.get(item.contentId) as ImageResult | undefined
        if (image?.url) {
          const imagePath = join(sessionDir, `image_${mediaList.length}.jpg`)
          await downloadContent(image.url, imagePath)
          mediaList.push({
            type: 'image',
            path: imagePath,
            duration: item.duration,
            width: image.width,
            height: image.height
          })
        }
      }
    }

    // If no content sequence provided, fall back to default processing
    if (mediaList.length === 0) {
      // Process videos
      if (mode === "videos" || mode === "mixed") {
        for (const video of videos) {
          const videoPath = join(sessionDir, `video_${mediaList.length}.mp4`)
          await downloadContent(video.downloadUrl, videoPath, true)
          mediaList.push({
            type: 'video',
            path: videoPath,
            width: video.width,
            height: video.height,
            duration: video.duration || 3
          })
        }
      }

      // Process images
      if (mode === "images" || mode === "mixed") {
        let imageIndex = 0
        for (const image of images) {
          const imagePath = join(sessionDir, `image_${mediaList.length}.jpg`)
          await downloadContent(image.url, imagePath)
          mediaList.push({
            type: 'image',
            path: imagePath,
            duration: imageDurations[imageIndex] || 3,
            width: image.width,
            height: image.height
          })
          imageIndex++
        }
      }
    }

    // Replace the adjustDurationsToTarget call with optimizeDurations
    const adjustedMediaList = optimizeDurations(mediaList, totalDuration)

    // Create output path
    const outputPath = join(sessionDir, "output.mp4")

    // Create the mixed media video with adjusted durations
    await createMixedMediaVideo(adjustedMediaList, outputPath)

    return NextResponse.json({
      success: true,
      videoPath: `/api/videos/${sessionId}/output.mp4`,
      processedContent: adjustedMediaList.length,
      sequence: adjustedMediaList.map((item, index) => ({
        type: item.type,
        duration: item.duration,
        index
      }))
    })

  } catch (error) {
    console.error("Error processing content:", error)
    return NextResponse.json({
      error: "Failed to process content",
      details: error instanceof Error ? error.message : "Unknown error"
    }, { status: 500 })
  }
} 