"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Progress } from "@/components/ui/progress"

export default function Home() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [videosPerMinute, setVideosPerMinute] = useState<number>(10)
  const [imagesPerMinute, setImagesPerMinute] = useState<number>(20)
  const [imageDurationRange, setImageDurationRange] = useState<[number, number]>([2, 5])
  const [provider, setProvider] = useState<"pexels" | "pixabay">("pexels")
  const [mode, setMode] = useState<"images" | "videos" | "mixed" | "ai-images">("videos")
  const [theme, setTheme] = useState<string>("")
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)
  const [progressState, setProgressState] = useState<{ message: string; progress: number; total: number } | null>(null)
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Update image settings when AI images are selected
  useEffect(() => {
    if (mode === "ai-images") {
      // Lower the images per minute for AI images to avoid rate limiting
      setImagesPerMinute(7);
    } else {
      // Reset to default if switching away from AI images
      setImagesPerMinute(20);
    }
  }, [mode]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    handleFile(selectedFile)
  }

  const handleFile = (selectedFile: File | undefined) => {
    if (selectedFile) {
      // Check if file is docx or txt
      if (selectedFile.name.endsWith(".docx") || selectedFile.name.endsWith(".txt")) {
        setFile(selectedFile)
        setError(null)
      } else {
        setError("Please upload a .docx or .txt file")
        setFile(null)
      }
    }
  }

  const handleDragOver = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragEnter = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const droppedFile = e.dataTransfer.files[0]
    handleFile(droppedFile)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    intervalRef.current && clearInterval(intervalRef.current);

    if (!file) {
      setError("Please upload a file")
      return
    }

    setIsLoading(true)
    setError(null)
    setProgressState(null);

    // --- Constants for Estimation ---
    const WORDS_PER_MINUTE = 120;
    const estimatedSecondsPerAiImage = 9; // Approx 8.6s request interval + processing time

    // Determine if AI images should be generated based on the mode
    const shouldGenerateAiImages = mode === "ai-images";
    const contentMode = shouldGenerateAiImages ? "images" : mode;

    let estimatedTotalAiTimeSeconds = 0;
    let estimatedTotalSegments = 0;

    // --- Estimate AI Generation Time (if applicable) ---
    if (shouldGenerateAiImages) {
      setProgressState({ progress: 0, message: "Estimating generation time...", total: 0 });
      try {
        const fileContent = await file.text();
        const wordCount = fileContent.split(/\\s+/).filter(Boolean).length;
        const totalDurationInSeconds = (wordCount / WORDS_PER_MINUTE) * 60;

        // Use the fixed imagesPerMinute for AI mode
        const aiImagesPerMinute = 7;
        const segmentDurationInSeconds = 60 / aiImagesPerMinute;
        estimatedTotalSegments = Math.ceil(totalDurationInSeconds / segmentDurationInSeconds);

        if (estimatedTotalSegments > 0) {
          estimatedTotalAiTimeSeconds = estimatedTotalSegments * estimatedSecondsPerAiImage;

          // --- Start Timer & Show Progress ---
          const startTime = Date.now();
          setProgressState({
            progress: 0,
            message: "Generating AI images...",
            total: estimatedTotalSegments // Use estimated segments for total
          });

          intervalRef.current = setInterval(() => {
            const elapsedTimeSeconds = (Date.now() - startTime) / 1000;
            const progressPercent = Math.min(100, Math.floor((elapsedTimeSeconds / estimatedTotalAiTimeSeconds) * 100));

            setProgressState(prevState => ({
              ...(prevState ?? { message: "Generating AI images...", total: estimatedTotalSegments }), // Keep message/total
              progress: progressPercent,
            }));

            // Stop interval if time exceeds estimate (or it finishes below)
            if (progressPercent >= 100) {
               intervalRef.current && clearInterval(intervalRef.current);
               intervalRef.current = null;
            }
          }, 500); // Update every 0.5 seconds
        } else {
           setProgressState(null); // No segments, no progress needed
        }
      } catch (err) {
        console.error("Error estimating AI time:", err);
        setError("Could not estimate generation time.");
        setIsLoading(false);
        setProgressState(null);
        return; // Stop processing
      }
    } else {
        // For non-AI modes, maybe show a simpler loading state
        setProgressState({ progress: 0, message: "Processing script...", total: 0 });
    }
    // --- End Estimation ---


    // --- Prepare FormData ---
    const formData = new FormData()
    formData.append("file", file)
    formData.append("mode", contentMode)
    formData.append("provider", provider)
    formData.append("theme", theme)
    formData.append("generateAiImages", shouldGenerateAiImages.toString())

    if (contentMode === "videos" || contentMode === "mixed") {
      formData.append("videosPerMinute", videosPerMinute.toString())
    }
    if (contentMode === "images" || contentMode === "mixed" || shouldGenerateAiImages) {
      // Use the fixed 7 for AI mode, otherwise the state value
      const currentImagesPerMinute = shouldGenerateAiImages ? 7 : imagesPerMinute;
      formData.append("imagesPerMinute", currentImagesPerMinute.toString())
      formData.append("imageDurationMin", imageDurationRange[0].toString())
      formData.append("imageDurationMax", imageDurationRange[1].toString())
    }
    // --- End Prepare FormData ---


    // --- Send Request ---
    try {
      console.log("Sending request to /api/process-script...");
      const response = await fetch("/api/process-script", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }

      const results = await response.json()

      // Update progress to 100% as backend finished this step
      setProgressState(prevState => ({
        ...(prevState ?? { message: "Processing complete!", total: estimatedTotalSegments }),
        progress: 100,
        message: "Processing complete! Redirecting...",
      }));

      // Store results and navigate
      localStorage.setItem("processingResults", JSON.stringify(results))
      router.push("/results")

    } catch (err: any) {
      console.error("Error processing script:", err);
      setError(err.message || "An error occurred while processing your script");
      setProgressState(null); // Clear progress on error
      setIsLoading(false); // Set loading false on error
    } finally {
      // --- Stop timer and cleanup ---
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Don't set isLoading false immediately if navigating successfully
      // It will be set to false only on error in the catch block
    }
  }

  // Function to calculate estimated time string
  const getEstimatedTimeString = (totalSegments: number, ratePerMinute: number = 7): string => {
    if (!totalSegments || totalSegments <= 0) return "";
    const totalMinutes = Math.ceil(totalSegments / ratePerMinute);
    return `~${totalMinutes} ${totalMinutes === 1 ? 'minute' : 'minutes'}`;
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Script to Video Generator</CardTitle>
          <CardDescription>Upload a script file and we'll generate matching content for each segment</CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file">Upload Script (docx or txt)</Label>
              <div className="flex items-center justify-center w-full">
                <label
                  htmlFor="file"
                  className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-200 ${
                    isDragging
                      ? "border-primary bg-primary/10"
                      : "border-muted-foreground/25 bg-muted/50 hover:bg-muted"
                  }`}
                  onDragOver={handleDragOver}
                  onDragEnter={handleDragEnter}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center justify-center pt-5 pb-6">
                    <Upload className={`w-8 h-8 mb-2 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
                    <p className={`mb-2 text-sm ${isDragging ? "text-primary" : "text-muted-foreground"}`}>
                      <span className="font-semibold">Click to upload</span> or drag and drop
                    </p>
                    <p className={`text-xs ${isDragging ? "text-primary" : "text-muted-foreground"}`}>
                      DOCX or TXT files only
                    </p>
                  </div>
                  <Input id="file" type="file" accept=".docx,.txt" className="hidden" onChange={handleFileChange} />
                </label>
              </div>
              {file && <p className="text-sm text-muted-foreground">Selected file: {file.name}</p>}
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="theme">Theme (Optional)</Label>
              <Textarea
                id="theme"
                placeholder="Enter a theme or context for your script (e.g., 'educational video about planets', 'corporate training')"
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                className="resize-none"
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Providing a theme helps generate more relevant visuals for your script
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="mode">Content Mode</Label>
              <Select value={mode} onValueChange={(value: "images" | "videos" | "mixed" | "ai-images") => setMode(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select content mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="images">Images Only</SelectItem>
                  <SelectItem value="videos">Videos Only</SelectItem>
                  <SelectItem value="mixed">Mixed Content</SelectItem>
                  <SelectItem value="ai-images">AI-Generated Images (DALL-E 3)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose what type of content to generate for your script
              </p>
            </div>

            {(mode === "videos" || mode === "mixed") && (
              <div className="space-y-2">
                <Label htmlFor="videosPerMinute">Videos Per Minute</Label>
                <Input
                  id="videosPerMinute"
                  type="number"
                  min="1"
                  max="30"
                  value={videosPerMinute}
                  onChange={(e) => setVideosPerMinute(Number.parseInt(e.target.value))}
                />
                <p className="text-xs text-muted-foreground">
                  How many videos you want per minute of speech
                </p>
              </div>
            )}

            {(mode === "images" || mode === "mixed" || mode === "ai-images") && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="imagesPerMinute">Images Per Minute</Label>
                  <Input
                    id="imagesPerMinute"
                    type="number"
                    min="1"
                    max="120"
                    value={imagesPerMinute}
                    onChange={(e) => setImagesPerMinute(Number.parseInt(e.target.value))}
                    disabled={mode === "ai-images"}
                  />
                  <p className="text-xs text-muted-foreground">
                    {mode === "ai-images" 
                      ? "Fixed at 7 images per minute to avoid rate limiting" 
                      : "How many images you want per minute of speech"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Image Duration Range (seconds)</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.5"
                      value={imageDurationRange[0]}
                      onChange={(e) => setImageDurationRange([Number.parseFloat(e.target.value), imageDurationRange[1]])}
                    />
                    <Input
                      type="number"
                      min="1"
                      max="10"
                      step="0.5"
                      value={imageDurationRange[1]}
                      onChange={(e) => setImageDurationRange([imageDurationRange[0], Number.parseFloat(e.target.value)])}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Minimum and maximum duration for each image in seconds
                  </p>
                </div>
              </>
            )}

            {mode !== "ai-images" && (
              <div className="space-y-2">
                <Label htmlFor="provider">Content Provider</Label>
                <Select value={provider} onValueChange={(value: "pexels" | "pixabay") => setProvider(value)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a content provider" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pexels">Pexels</SelectItem>
                    <SelectItem value="pixabay">Pixabay</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose which provider to use for searching content
                </p>
              </div>
            )}

            {isLoading && progressState && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-sm font-medium">
                  <span>{progressState.message}</span>
                  {progressState.progress > 0 && <span>{progressState.progress}%</span>}
                </div>
                <Progress value={progressState.progress} className="h-2 w-full" />
                {progressState.total > 0 && mode === "ai-images" && (
                  <p className="text-xs text-muted-foreground text-right">
                    Estimated time: {getEstimatedTimeString(progressState.total)}
                  </p>
                )}
              </div>
            )}

            {error && <p className="text-sm text-destructive pt-2">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading || !file}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {progressState?.message.startsWith("Estimating") ? "Estimating..." : "Processing..."}
                </>
              ) : (
                "Generate Content"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

