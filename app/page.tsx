"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export default function Home() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [videosPerMinute, setVideosPerMinute] = useState<number>(10)
  const [imagesPerMinute, setImagesPerMinute] = useState<number>(20)
  const [imageDurationRange, setImageDurationRange] = useState<[number, number]>([2, 5])
  const [provider, setProvider] = useState<"pexels" | "pixabay">("pexels")
  const [mode, setMode] = useState<"images" | "videos" | "mixed">("videos")
  const [theme, setTheme] = useState<string>("")
  const [generateAiImages, setGenerateAiImages] = useState<boolean>(false)
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState<boolean>(false)

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

    if (!file) {
      setError("Please upload a file")
      return
    }

    setIsLoading(true)

    const formData = new FormData()
    formData.append("file", file)
    formData.append("mode", mode)
    formData.append("provider", provider)
    formData.append("theme", theme)
    formData.append("generateAiImages", generateAiImages.toString())
    
    // Add parameters based on mode
    if (mode === "videos" || mode === "mixed") {
      formData.append("videosPerMinute", videosPerMinute.toString())
    }
    
    if (mode === "images" || mode === "mixed") {
      formData.append("imagesPerMinute", imagesPerMinute.toString())
      formData.append("imageDurationMin", imageDurationRange[0].toString())
      formData.append("imageDurationMax", imageDurationRange[1].toString())
    }

    console.log(formData.get("videosPerMinute"))
    console.log(formData.get("imagesPerMinute"))
    console.log(formData.get("imageDurationMin"))
    console.log(formData.get("imageDurationMax"))

    try {
      const response = await fetch("/api/process-script", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to process script")
      }

      router.push("/results")
    } catch (err) {
      setError("An error occurred while processing your script")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
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
              <Select value={mode} onValueChange={(value: "images" | "videos" | "mixed") => setMode(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select content mode" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="images">Images Only</SelectItem>
                  <SelectItem value="videos">Videos Only</SelectItem>
                  <SelectItem value="mixed">Mixed Content</SelectItem>
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

            {(mode === "images" || mode === "mixed") && (
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
                  />
                  <p className="text-xs text-muted-foreground">
                    How many images you want per minute of speech
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

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="generateAiImages"
                  checked={generateAiImages}
                  onChange={(e) => setGenerateAiImages(e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                />
                <Label htmlFor="generateAiImages">Generate AI images (DALL-E 3)</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Create custom AI-generated images for each segment of your script
              </p>
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isLoading || !file}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
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

