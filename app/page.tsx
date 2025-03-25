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

export default function Home() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [videosPerMinute, setVideosPerMinute] = useState<number>(10)
  const [provider, setProvider] = useState<"pexels" | "pixabay">("pexels")
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
    formData.append("videosPerMinute", videosPerMinute.toString())
    formData.append("provider", provider)

    try {
      const response = await fetch("/api/process-script", {
        method: "POST",
        body: formData,
      })

      if (!response.ok) {
        throw new Error("Failed to process script")
      }

      // Redirect to results page
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
          <CardDescription>Upload a script file and we'll generate matching videos for each segment</CardDescription>
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
              <Label htmlFor="provider">Video Provider</Label>
              <Select value={provider} onValueChange={(value: "pexels" | "pixabay") => setProvider(value)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a video provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pexels">Pexels</SelectItem>
                  <SelectItem value="pixabay">Pixabay</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose which stock video provider to use for searching videos
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="videosPerMinute">Videos Per Minute</Label>
              <Input
                id="videosPerMinute"
                type="number"
                min="1"
                max="60"
                value={videosPerMinute}
                onChange={(e) => setVideosPerMinute(Number.parseInt(e.target.value))}
              />
              <p className="text-xs text-muted-foreground">
                How many video clips you want per minute of speech (at 120 words per minute)
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
                "Generate Videos"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}

