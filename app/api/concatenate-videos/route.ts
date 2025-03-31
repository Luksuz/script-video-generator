import { NextRequest, NextResponse } from "next/server"
import { spawn } from "child_process"
import { writeFile, mkdir, unlink, readFile, stat } from "fs/promises"
import { join } from "path"
import { existsSync } from "fs"
import { v4 as uuidv4 } from "uuid"

// --- Configuration --- (Inspired by Python script)
const TARGET_WIDTH = 854 // Keep 16:9 aspect ratio, smaller for web
const TARGET_HEIGHT = 480
const TARGET_FPS = 30
const TARGET_AUDIO_RATE = 44100 // 44.1kHz is common for web/consumer
const TARGET_AUDIO_CHANNELS = 2
const NORMALIZATION_CRF = "28" // Higher CRF = smaller file, lower quality (23-28 often good balance)
const NORMALIZATION_PRESET = "medium" // Slower presets = better compression (medium is good default)
const CONCATENATION_CRF = "28"
const CONCATENATION_PRESET = "fast" // Faster for the final step
const PIX_FMT = "yuv420p" // Crucial for compatibility
const AUDIO_CODEC = "aac"
const AUDIO_BITRATE = "128k"
// --- End Configuration ---

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
  originalIndex: number // Keep track of original order
  tempOutputPath?: string // Store the path of the normalized output
}

// Add this interface after the existing interfaces
interface ContentSequenceItem {
  type: 'image' | 'video'
  contentId: string
  duration: number // This will now come pre-calculated from process-script
  sectionIndex: number
}

// Add these helper functions for duration optimization
interface DurationRange {
  min: number
  max: number
  preferred?: number
}

// Add a type for the download task
interface DownloadTask {
  skip: boolean;
  index: number;
  type?: 'video' | 'image';
  contentId?: string;
  duration?: number;
  sectionIndex?: number;
  outputPath?: string;
  error?: string;
  item?: ContentSequenceItem;
}

// Add result value type
interface DownloadTaskResult {
  success: boolean;
  task: DownloadTask;
  error?: string;
  placeholderPath?: string;
}

// Add constants for API request delays
const VIDEO_API_DELAY_MS = 200; // 0.2 seconds delay between video API requests

// Helper to check if URL is likely to be downloadable
function isDownloadableUrl(url: string): boolean {
  const problematicDomains = [
    'instagram.com',
    'lookaside.instagram.com',
    'facebook.com',
    'fbcdn.net',
    'twitter.com',
    'twimg.com',
    'tiktok.com',
  ]
  
  try {
    const urlObj = new URL(url)
    return !problematicDomains.some(domain => urlObj.hostname.includes(domain))
  } catch {
    return false
  }
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

// Add function to convert SVG to PNG if needed
async function convertSvgToPng(svgPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-y",
      "-i", svgPath,
      "-vf", "scale=854:480:force_original_aspect_ratio=decrease",
      outputPath
    ];
    
    console.log(`Converting SVG to PNG: ffmpeg ${ffmpegArgs.join(' ')}`);
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    
    let errorOutput = "";
    ffmpeg.stderr.on("data", data => errorOutput += data.toString());
    
    ffmpeg.on("error", error => {
      reject(new Error(`Failed to convert SVG to PNG: ${error.message}`));
    });
    
    ffmpeg.on("close", code => {
      if (code === 0) {
        console.log(`Successfully converted SVG to PNG: ${svgPath} -> ${outputPath}`);
        resolve();
      } else {
        reject(new Error(`SVG to PNG conversion failed with code ${code}: ${errorOutput}`));
      }
    });
  });
}

// Update verifyImageFile to handle SVG files
async function verifyImageFile(imagePath: string): Promise<void> {
  // Check if it's an SVG file (by extension or by examining the first few bytes)
  if (imagePath.toLowerCase().endsWith('.svg')) {
    console.log(`Detected SVG file: ${imagePath}`);
    const pngPath = imagePath.replace(/\.svg$/i, '.png');
    
    try {
      await convertSvgToPng(imagePath, pngPath);
      // Replace the original file with the converted PNG
      await unlink(imagePath);
      await writeFile(imagePath, await readFile(pngPath));
      await unlink(pngPath);
      console.log(`Replaced SVG with PNG: ${imagePath}`);
      return; // SVG successfully converted to PNG
    } catch (error: any) {
      console.error(`Failed to convert SVG to PNG: ${error.message}`);
      throw new Error(`Failed to convert SVG: ${error.message}`);
    }
  }
  
  return new Promise((resolve, reject) => {
    const ffprobeArgs = [
      "-v", "error",
      "-select_streams", "v:0",
      "-show_entries", "stream=width,height,codec_name",
      "-of", "json",
      imagePath
    ];
    
    console.log(`Verifying image file: ffprobe ${ffprobeArgs.join(' ')}`);
    const ffprobe = spawn("ffprobe", ffprobeArgs);
    
    let output = "";
    let errorOutput = "";
    
    ffprobe.stdout.on("data", (data) => output += data.toString());
    ffprobe.stderr.on("data", (data) => errorOutput += data.toString());
    
    ffprobe.on("error", (error) => {
      reject(new Error(`Image verification failed: ${error.message}`));
    });
    
    ffprobe.on("close", (code) => {
      if (code === 0) {
        try {
          const result = JSON.parse(output);
          if (result.streams && result.streams.length > 0) {
            const stream = result.streams[0];
            if (stream.width && stream.height) {
              console.log(`Image verified: ${imagePath} (${stream.width}x${stream.height}, codec: ${stream.codec_name})`);
              resolve();
              return;
            }
          }
          reject(new Error(`Invalid image: no valid dimensions found`));
        } catch (e: any) {
          reject(new Error(`Failed to parse ffprobe output: ${e.message}`));
        }
      } else {
        reject(new Error(`Image validation failed with code ${code}: ${errorOutput}`));
      }
    });
  });
}

// Update downloadContent to detect SVG files from the content-type header
async function downloadContent(url: string, outputPath: string, isVideo: boolean = false): Promise<void> {
  if (!isDownloadableUrl(url)) {
    throw new Error(`URL considered non-downloadable or from restricted domain: ${url}`)
  }

  // Add delay for video APIs to prevent rate limiting
  if (isVideo) {
    const isPixabay = url.includes('pixabay.com');
    const isPexels = url.includes('pexels.com');
    
    if (isPixabay || isPexels) {
      console.log(`Applying ${VIDEO_API_DELAY_MS}ms delay for ${isPixabay ? 'Pixabay' : 'Pexels'} video request`);
      await new Promise(resolve => setTimeout(resolve, VIDEO_API_DELAY_MS));
    }
  }

  // Check if URL ends with .svg
  const isSvg = url.toLowerCase().endsWith('.svg');
  
  // If it's an SVG, we need to handle it differently
  if (isSvg && !isVideo) {
    // Update output path to ensure it's saved as SVG initially
    const svgPath = outputPath.replace(/\.[^/.]+$/, '.svg');
    
    // Download the SVG first
    await downloadContentInternal(url, svgPath, isVideo);
    
    // Then convert to PNG and replace the original file
    try {
      const pngPath = svgPath.replace(/\.svg$/i, '.png');
      await convertSvgToPng(svgPath, pngPath);
      await writeFile(outputPath, await readFile(pngPath));
      await unlink(svgPath);
      await unlink(pngPath);
      console.log(`Successfully processed SVG from ${url} to ${outputPath}`);
    } catch (error: any) {
      throw new Error(`Failed to process SVG: ${error.message}`);
    }
    
    return;
  }
  
  // For non-SVG files, use the regular download process
  return downloadContentInternal(url, outputPath, isVideo);
}

// Move the existing download functionality to an internal function
async function downloadContentInternal(url: string, outputPath: string, isVideo: boolean = false): Promise<void> {
  const retries = 2
  const retryDelay = 1500 // Increased delay

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Download retry attempt ${attempt} for ${url}`)
        await new Promise(resolve => setTimeout(resolve, retryDelay * attempt))
      }

      console.log(`Attempting download (${attempt + 1}/${retries + 1}): ${url} to ${outputPath}`)
      const response = await fetch(url, {
        headers: { // Use more generic headers
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36', // More modern UA
          'Accept': '*/*', // Accept anything
          'Accept-Language': 'en-US,en;q=0.9',
          'Referer': new URL(url).origin + '/', // Basic referer
          'Origin': new URL(url).origin // Add origin header to help with CORS
          // Avoid Sec-Fetch headers unless strictly needed, can cause issues
        },
        redirect: 'follow', // Follow redirects
        signal: AbortSignal.timeout(30000) // 30 second timeout per attempt
      })

      if (!response.ok) {
        const errorText = await response.text().catch(() => `Status ${response.status}`); // Try to get body text
        console.error(`Download attempt ${attempt + 1} failed for ${url}: ${response.status} ${response.statusText}. Response: ${errorText.substring(0, 200)}`);
        if (attempt === retries || response.status === 404 || response.status === 403) { // Fail fast on 404/403
             throw new Error(`Failed to download content after ${attempt + 1} attempts: ${response.status} ${response.statusText}`)
         }
        continue // Continue to next retry
      }

      const contentType = response.headers.get('content-type') ?? '';
      
      // Handle SVG content type detection
      const isSvgContent = contentType.includes('image/svg+xml');
      if (isSvgContent && !isVideo && !outputPath.toLowerCase().endsWith('.svg')) {
        console.log(`Detected SVG content type for ${url}`);
        // Let the SVG handler in the main function deal with this
        await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));
        return;
      }
      
      // Stricter content type validation
      if (isVideo && !contentType.startsWith('video/')) {
        console.warn(`Expected video content type but got '${contentType}' for ${url}`);
        // Only throw if it's definitely not a video
        if (contentType && !contentType.includes('octet-stream') && !contentType.includes('application/')) {
          throw new Error(`Invalid content type: expected video but got ${contentType}`);
        }
      } else if (!isVideo && !contentType.includes('image/')) {
        console.warn(`Expected image content type but got '${contentType}' for ${url}`);
        // Only throw if it's definitely not an image
        if (contentType && !contentType.includes('octet-stream') && !contentType.includes('application/')) {
          throw new Error(`Invalid content type: expected image but got ${contentType}`);
        }
      }

      const buffer = await response.arrayBuffer()
      if (buffer.byteLength === 0) {
        throw new Error("Downloaded file is empty.");
      }
      
      // Write the file
      await writeFile(outputPath, Buffer.from(buffer))
      console.log(`Successfully downloaded ${buffer.byteLength} bytes from ${url} to ${outputPath}`)
      
      // For images, verify the downloaded file is a valid image
      if (!isVideo) {
        try {
          await verifyImageFile(outputPath);
        } catch (verifyError: any) {
          console.error(`Downloaded image verification failed: ${verifyError.message}`);
          throw new Error(`Image verification failed: ${verifyError.message}`);
        }
      }
      
      return // Success
    } catch (error: any) {
      console.error(`Error during download attempt ${attempt + 1} for ${url}:`, error.message)
      if (error.name === 'TimeoutError') {
        console.error("Download timed out.");
      }
      if (attempt === retries) {
        // If final attempt failed, delete potentially corrupt partial file
        try { await unlink(outputPath); } catch { /* ignore error */ }
        throw new Error(`Failed to download ${url} after ${retries + 1} attempts. Last error: ${error.message}`);
      }
      // Wait before retrying after error
      await new Promise(resolve => setTimeout(resolve, retryDelay * (attempt + 1)));
    }
  }
  // Should not be reachable if logic is correct, but throws error just in case
  throw new Error(`Download failed unexpectedly for ${url}`);
}

// Helper to convert an image to video using FFmpeg
async function imageToVideo(
  imagePath: string,
  outputPath: string,
  duration: number
): Promise<void> {
  const { width: targetW, height: targetH } = getEvenDimensions(TARGET_WIDTH, TARGET_HEIGHT)

  return new Promise((resolve, reject) => {
    // Add extra probing and analysis for problematic images
    const ffmpegArgs = [
      "-y", // Overwrite output
      "-analyzeduration", "10000000", // Increase analysis duration
      "-probesize", "10000000", // Increase probe size
      // The issue is with the loop option - the correct order matters for this FFmpeg version
      "-f", "image2", // Force input format to image2
      "-loop", "1", // Loop the single image (moved after -f)
      "-framerate", "25", // Set input framerate
      "-i", imagePath,
      "-t", duration.toString(), // Duration for the output video
      // Complex filtergraph: scale, pad, set SAR, format pixels
      "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${TARGET_FPS}`,
      "-c:v", "libx264", // Video codec
      "-preset", NORMALIZATION_PRESET, // Encoding speed/compression trade-off
      "-crf", NORMALIZATION_CRF, // Constant Rate Factor (quality)
      "-tune", "stillimage", // Optimize for static image content
      "-pix_fmt", PIX_FMT, // Pixel format for compatibility
      "-movflags", "+faststart", // Optimize for web streaming
      "-an", // No audio track
      outputPath
    ]

    console.log(`FFmpeg imageToVideo command: ffmpeg ${ffmpegArgs.join(' ')}`) // Log command

    const ffmpeg = spawn("ffmpeg", ffmpegArgs)

    // Limit error output to prevent "Invalid string length" error
    const MAX_ERROR_LENGTH = 10000
    let errorOutput = ""
    
    ffmpeg.stderr.on("data", (data) => {
      const chunk = data.toString()
      // Only append if we won't exceed the max length
      if (errorOutput.length + chunk.length <= MAX_ERROR_LENGTH) {
        errorOutput += chunk
      } else if (errorOutput.length < MAX_ERROR_LENGTH) {
        // Add partial chunk up to the limit and indicate truncation
        errorOutput = errorOutput.substring(0, MAX_ERROR_LENGTH) + "\n...[output truncated]"
      }
    })

    ffmpeg.on("error", (error) => {
      console.error(`FFmpeg process error (imageToVideo): ${error.message}`)
      reject(new Error(`FFmpeg process error: ${error.message}\n${errorOutput}`))
    })

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        console.log(`Successfully converted image ${imagePath} to video ${outputPath}`)
        resolve()
      } else {
        console.error(`Image to video conversion failed for ${imagePath} with code ${code}`)
        reject(new Error(`Image to video conversion failed with code ${code}\nFFmpeg output:\n${errorOutput}`))
      }
    })
  })
}

// Add this helper function somewhere near the other helpers (e.g., after ensureEvenDimensions)
async function getVideoDuration(filePath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobeArgs = [
      "-v", "error", // Only show errors
      "-show_entries", "format=duration", // Get duration from format section
      "-of", "default=noprint_wrappers=1:nokey=1", // Output only the value
      filePath
    ];

    console.log(`Running ffprobe to get duration: ffprobe ${ffprobeArgs.join(' ')}`);
    const ffprobe = spawn("ffprobe", ffprobeArgs);

    const MAX_OUTPUT_LENGTH = 5000;
    let output = "";
    let errorOutput = "";
    
    ffprobe.stdout.on("data", (data) => {
      const chunk = data.toString();
      if (output.length + chunk.length <= MAX_OUTPUT_LENGTH) {
        output += chunk;
      } else if (output.length < MAX_OUTPUT_LENGTH) {
        output = output.substring(0, MAX_OUTPUT_LENGTH) + "\n...[output truncated]";
      }
    });
    
    ffprobe.stderr.on("data", (data) => {
      const chunk = data.toString();
      if (errorOutput.length + chunk.length <= MAX_OUTPUT_LENGTH) {
        errorOutput += chunk;
      } else if (errorOutput.length < MAX_OUTPUT_LENGTH) {
        errorOutput = errorOutput.substring(0, MAX_OUTPUT_LENGTH) + "\n...[output truncated]";
      }
    });

    ffprobe.on("error", (error) => {
        console.error(`ffprobe process error: ${error.message}`);
        reject(new Error(`ffprobe process error: ${error.message}\n${errorOutput}`));
    });

    ffprobe.on("close", (code) => {
      if (code === 0 && output.trim()) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
            console.error(`ffprobe could not parse duration from output: ${output}`);
            reject(new Error(`ffprobe could not parse duration from output: ${output}`));
        } else {
            console.log(`Detected duration for ${filePath}: ${duration} seconds`);
            resolve(duration);
        }
      } else {
        console.error(`ffprobe failed for ${filePath} with code ${code}. Error: ${errorOutput}`);
        reject(new Error(`ffprobe failed with code ${code}\nFFprobe output:\n${errorOutput}`));
      }
    });
  });
}

// --- Refactored: standardizeVideo using config constants AND duration handling ---
async function standardizeVideo(
  inputPath: string,
  outputPath: string,
  targetDuration: number // Duration now comes directly from contentSequence
): Promise<void> {
   const { width: targetW, height: targetH } = getEvenDimensions(TARGET_WIDTH, TARGET_HEIGHT)

   // Get original duration first
   let originalDuration: number;
   try {
       originalDuration = await getVideoDuration(inputPath);
   } catch (error) {
       console.error(`Failed to get duration for ${inputPath}, skipping duration adjustment. Error:`, error);
       // Decide how to handle - maybe proceed without looping/cutting?
       // For now, we'll throw to indicate a processing failure for this item.
       throw new Error(`Failed to get video duration for ${inputPath}: ${error instanceof Error ? error.message : String(error)}`);
   }


   return new Promise((resolve, reject) => {
    const baseArgs = [
        "-y", // Overwrite output
        // Input options will be placed here conditionally
    ];

    const inputArgs: string[] = [];
    const outputArgs = [
        // Complex filtergraph remains the same
        "-vf", `scale=${targetW}:${targetH}:force_original_aspect_ratio=decrease,pad=${targetW}:${targetH}:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1,fps=${TARGET_FPS}`,
        "-c:v", "libx264", // Video codec
        "-preset", NORMALIZATION_PRESET,
        "-crf", NORMALIZATION_CRF,
        "-pix_fmt", PIX_FMT,
        "-c:a", AUDIO_CODEC, // Audio codec
        "-b:a", AUDIO_BITRATE, // Audio bitrate
        "-ar", TARGET_AUDIO_RATE.toString(), // Audio sample rate
        "-ac", TARGET_AUDIO_CHANNELS.toString(), // Audio channels
        // Duration limiting/cutting option will be placed here
        "-movflags", "+faststart",
        outputPath
    ];

    // --- Apply looping or cutting ---
    if (originalDuration < targetDuration) {
        // Need to loop
        console.log(`Looping video ${inputPath} (original: ${originalDuration}s) to target duration: ${targetDuration}s`);
        inputArgs.push("-stream_loop", "-1"); // Loop input infinitely
        inputArgs.push("-i", inputPath);
        // Add '-t' to output options to cut the loop at the target duration
        outputArgs.splice(outputArgs.length - 3, 0, "-t", targetDuration.toString()); // Insert before movflags
    } else {
        // Input is long enough or exactly matches, just cut if needed
        inputArgs.push("-i", inputPath);
        if (originalDuration > targetDuration) {
            console.log(`Cutting video ${inputPath} (original: ${originalDuration}s) to target duration: ${targetDuration}s`);
            // Add '-t' to output options
             outputArgs.splice(outputArgs.length - 3, 0, "-t", targetDuration.toString()); // Insert before movflags
        } else {
            console.log(`Video ${inputPath} duration (${originalDuration}s) matches target (${targetDuration}s). No cutting/looping needed.`);
            // No -t needed if durations match (or original is slightly longer due to float precision)
        }
    }

    const ffmpegArgs = [...baseArgs, ...inputArgs, ...outputArgs];

    console.log(`FFmpeg standardizeVideo command: ffmpeg ${ffmpegArgs.join(' ')}`) // Log command

    const ffmpeg = spawn("ffmpeg", ffmpegArgs)

    // Limit error output to prevent "Invalid string length" error
    const MAX_ERROR_LENGTH = 10000
    let errorOutput = ""
    
    ffmpeg.stderr.on("data", (data) => {
      const chunk = data.toString()
      // Only append if we won't exceed the max length
      if (errorOutput.length + chunk.length <= MAX_ERROR_LENGTH) {
        errorOutput += chunk
      } else if (errorOutput.length < MAX_ERROR_LENGTH) {
        // Add partial chunk up to the limit and indicate truncation
        errorOutput = errorOutput.substring(0, MAX_ERROR_LENGTH) + "\n...[output truncated]"
      }
    })

     ffmpeg.on("error", (error) => {
      console.error(`FFmpeg process error (standardizeVideo): ${error.message}`)
      reject(new Error(`FFmpeg process error: ${error.message}\n${errorOutput}`))
    })


    ffmpeg.on("close", (code) => {
      if (code === 0) {
        console.log(`Successfully standardized video ${inputPath} to ${outputPath} with duration ${targetDuration}s`)
        resolve()
      } else {
         console.error(`Video standardization failed for ${inputPath} with code ${code}`)
        reject(new Error(`Video standardization failed with code ${code}\nFFmpeg output:\n${errorOutput}`))
      }
    })
  })
}

async function createMixedMediaVideo(mediaList: MediaItem[], outputPath: string): Promise<void> {
  const tempFiles: string[] = []
  
  try {
    // Process each media item
    for (let i = 0; i < mediaList.length; i++) {
      const item = mediaList[i]
      const tempOutput = join(process.cwd(), "temp", `temp_${i}_converted.mp4`)
      tempFiles.push(tempOutput)
      
      if (item.type === 'image') {
        // Convert image to video with consistent dimensions and SAR
        // Use the duration assigned to the image
        await imageToVideo(
          item.path,
          tempOutput,
          item.duration || 3 // Fallback if duration wasn't provided for some reason
        )
      } else if (item.type === 'video') {
        // Standardize video format, using the pre-calculated duration
        await standardizeVideo(item.path, tempOutput, item.duration || 5) // Fallback if duration missing
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

      // Limit error output to prevent "Invalid string length" error
      const MAX_ERROR_LENGTH = 10000
      let errorOutput = ""
      
      ffmpeg.stderr.on("data", (data) => {
        const chunk = data.toString()
        // Only append if we won't exceed the max length
        if (errorOutput.length + chunk.length <= MAX_ERROR_LENGTH) {
          errorOutput += chunk
        } else if (errorOutput.length < MAX_ERROR_LENGTH) {
          // Add partial chunk up to the limit and indicate truncation
          errorOutput = errorOutput.substring(0, MAX_ERROR_LENGTH) + "\n...[output truncated]"
        }
        // Still log the progress
        console.log(`FFmpeg concatenation: ${chunk.substring(0, 200)}${chunk.length > 200 ? '...' : ''}`)
      })

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          resolve()
        } else {
          reject(new Error(`Concatenation failed with code ${code}\nFFmpeg output:\n${errorOutput}`))
        }
      })

      ffmpeg.on("error", (error) => {
        console.error(`FFmpeg process error (createMixedMediaVideo): ${error.message}`)
        reject(new Error(`FFmpeg process error: ${error.message}\n${errorOutput}`))
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

// Update the POST handler to use batch downloading for images
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    console.log("Received request body:", body)

    const {
      totalDuration = 60,
      contentSequence = [] as ContentSequenceItem[] 
    } = body

    // Create session directory
    const sessionId = uuidv4()
    const sessionDir = join(process.cwd(), "temp", sessionId)
    await mkdir(sessionDir, { recursive: true })

    // Create maps for quick lookup, filtering out problematic URLs
    const videoMap = new Map(
      (body.videos || [])
        .filter((v: VideoResult) => v.downloadUrl && isDownloadableUrl(v.downloadUrl))
        .map((v: VideoResult) => [v.downloadUrl, v])
    )
    const imageMap = new Map(
      (body.images || [])
        .filter((i: ImageResult) => i.url && isDownloadableUrl(i.url))
        .map((i: ImageResult) => [i.url, i])
    )

    // Prepare for batch processing
    const BATCH_SIZE = 20;
    const BATCH_DELAY_MS = 3000; // 3 seconds
    
    // Organize content sequence into tasks with download info
    const downloadTasks = contentSequence.map((item: ContentSequenceItem, index: number): DownloadTask => {
      const { type, contentId, duration, sectionIndex } = item;
      
      if (!duration || duration <= 0) {
        console.warn(`Skipping item at index ${index} due to invalid duration: ${duration}`);
        return { 
          skip: true, 
          index, 
          error: `Invalid duration: ${duration}`,
          item
        };
      }
      
      if (type === 'video') {
        const videoPath = join(sessionDir, `video_${index}.mp4`);
        return {
          skip: false,
          index,
          type,
          contentId,
          duration,
          sectionIndex,
          outputPath: videoPath
        };
      } else if (type === 'image') {
        const imagePath = join(sessionDir, `image_${index}.jpg`);
        return {
          skip: false,
          index,
          type,
          contentId,
          duration,
          sectionIndex,
          outputPath: imagePath
        };
      } else {
        console.warn(`Unsupported content type '${type}' at index ${index}`);
        return {
          skip: true,
          index,
          error: `Unsupported content type: ${type}`,
          item
        };
      }
    });
    
    // Filter out tasks that should be skipped
    const validTasks = downloadTasks.filter((task: DownloadTask) => !task.skip);
    const skippedTasks = downloadTasks.filter((task: DownloadTask) => task.skip);
    
    // Process tasks in batches
    const mediaList: MediaItem[] = [];
    const failedItems: { index: number, error: string }[] = [];
    
    // Add failed items from initial validation
    skippedTasks.forEach((task: DownloadTask) => {
      failedItems.push({ index: task.index, error: task.error || 'Unknown error' });
    });
    
    // Process batches of tasks
    for (let i = 0; i < validTasks.length; i += BATCH_SIZE) {
      const batch = validTasks.slice(i, i + BATCH_SIZE);
      
      // Count Pixabay and Pexels videos in this batch for logging
      const pixabayCount = batch.filter((t: DownloadTask) => t.type === 'video' && t.contentId?.includes('pixabay.com')).length;
      const pexelsCount = batch.filter((t: DownloadTask) => t.type === 'video' && t.contentId?.includes('pexels.com')).length;
      
      console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1} with ${batch.length} items ` +
                  `(${pixabayCount} Pixabay videos, ${pexelsCount} Pexels videos)`);
      
      // Process each batch in parallel
      const batchResults = await Promise.allSettled(batch.map(async (task: DownloadTask) => {
        // Skip invalid tasks
        if (!task.contentId || !task.outputPath) {
          return {
            success: false,
            task,
            error: 'Missing contentId or outputPath'
          } as DownloadTaskResult;
        }
        
        try {
          await downloadContent(
            task.contentId, 
            task.outputPath, 
            task.type === 'video'
          );
          
          return {
            success: true,
            task
          } as DownloadTaskResult;
        } catch (error: any) {
          console.error(`Failed to download item at index ${task.index} (ID: ${task.contentId}):`, error.message);
          
          // Try to create a placeholder for failed items
          try {
            if (mediaList.length > 0) {
              const blackFramePath = join(sessionDir, `black_frame_${task.index}.jpg`);
              await createBlackFrame(blackFramePath, TARGET_WIDTH, TARGET_HEIGHT);
              
              return {
                success: false,
                task,
                error: error.message,
                placeholderPath: blackFramePath
              } as DownloadTaskResult;
            }
          } catch (placeholderError: any) {
            console.error(`Failed to create placeholder for item ${task.index}:`, placeholderError);
          }
          
          return {
            success: false,
            task,
            error: error.message
          } as DownloadTaskResult;
        }
      }));
      
      // Process results and add to mediaList
      batchResults.forEach((result, batchIndex) => {
        const task: DownloadTask = batch[batchIndex];
        
        if (result.status === 'fulfilled') {
          const value = result.value as DownloadTaskResult;
          
          if (value.success) {
            // Add successful download to mediaList
            mediaList.push({
              type: task.type as 'image' | 'video',
              path: task.outputPath!,
              duration: task.duration!,
              originalIndex: task.index
            });
          } else {
            // Add failed item with placeholder if available
            failedItems.push({ index: task.index, error: value.error || 'Unknown error' });
            
            if (value.placeholderPath) {
              mediaList.push({
                type: 'image', // Always use image type for placeholder
                path: value.placeholderPath,
                duration: task.duration!,
                originalIndex: task.index
              });
              console.log(`Added placeholder for failed item at index ${task.index}`);
            }
          }
        } else {
          // Handle promise rejection
          failedItems.push({ index: task.index, error: result.reason.message || 'Unknown error' });
        }
      });
      
      // Pause between batches if this isn't the last batch
      if (i + BATCH_SIZE < validTasks.length) {
        console.log(`Pausing for ${BATCH_DELAY_MS}ms before next batch...`);
        await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
      }
    }
    
    // Sort mediaList by originalIndex to maintain the correct order
    mediaList.sort((a, b) => a.originalIndex - b.originalIndex);

    // If mediaList is empty after processing, throw an error
    if (mediaList.length === 0) {
      throw new Error("No valid media items could be processed from the content sequence.");
    }

    // Create output path
    const outputPath = join(sessionDir, "output.mp4")

    // Create the mixed media video with adjusted durations
    await createMixedMediaVideo(mediaList, outputPath)

    // Calculate the actual total duration from the processed media
    const actualTotalDuration = mediaList.reduce((sum, item) => sum + (item.duration || 0), 0);

    return NextResponse.json({
      success: true,
      videoPath: `/api/videos/${sessionId}/output.mp4`,
      processedContent: mediaList.length,
      totalDuration: actualTotalDuration,
      failedItems: failedItems.length > 0 ? failedItems : undefined,
      sequence: mediaList.map((item, index) => ({
        type: item.type,
        duration: item.duration,
        originalIndex: item.originalIndex
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

// Function to create a black frame to use as a placeholder
async function createBlackFrame(outputPath: string, width: number, height: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegArgs = [
      "-y",
      "-f", "lavfi",
      "-i", `color=c=black:s=${width}x${height}:d=1`,
      "-frames:v", "1",
      outputPath
    ];
    
    console.log(`Creating black frame: ffmpeg ${ffmpegArgs.join(' ')}`);
    const ffmpeg = spawn("ffmpeg", ffmpegArgs);
    
    let errorOutput = "";
    ffmpeg.stderr.on("data", data => errorOutput += data.toString());
    
    ffmpeg.on("error", error => {
      reject(new Error(`Failed to create black frame: ${error.message}`));
    });
    
    ffmpeg.on("close", code => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Black frame creation failed with code ${code}: ${errorOutput}`));
      }
    });
  });
} 