"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface VideoResult {
  sentence: string
  query: string
  videos: {
    id: string
    url: string
    image: string
    duration: number
    width: number
    height: number
    downloadUrl: string
  }[]
}

interface ProcessingResults {
  wordCount: number
  durationInMinutes: number
  totalVideosNeeded: number
  videoResults: VideoResult[]
  provider: "pexels" | "pixabay"
}

export default function ResultsPage() {
  const [results, setResults] = useState<ProcessingResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedVideos, setSelectedVideos] = useState<Record<string, number>>({})

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch("/api/process-script")

        if (!response.ok) {
          throw new Error("Failed to fetch results")
        }

        const data = await response.json()
        setResults(data)

        // Initialize selected videos (first video for each sentence)
        const initialSelected: Record<string, number> = {}
        data.videoResults.forEach((result: VideoResult) => {
          initialSelected[result.sentence] = 0
        })
        setSelectedVideos(initialSelected)
      } catch (err) {
        setError("An error occurred while fetching results")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [])

  const handleSelectVideo = (sentence: string, index: number) => {
    setSelectedVideos((prev) => ({
      ...prev,
      [sentence]: index,
    }))
  }

  const downloadAllVideos = () => {
    if (!results) return

    results.videoResults.forEach((result) => {
      const selectedIndex = selectedVideos[result.sentence] || 0
      const video = result.videos[selectedIndex]

      if (video && video.downloadUrl) {
        const link = document.createElement("a")
        link.href = video.downloadUrl
        link.download = `video-${result.query.replace(/\s+/g, "-")}.mp4`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    })
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <CardTitle>Processing Results</CardTitle>
            <CardDescription>Loading your video results...</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center justify-center p-12">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <Progress value={45} className="w-full max-w-md" />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error || !results) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-3xl">
          <CardHeader>
            <CardTitle>Error</CardTitle>
            <CardDescription>{error || "No results found. Please try processing your script again."}</CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center p-6">
            <Button asChild>
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Home
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Video Results</h1>
            <p className="text-muted-foreground">
              {results.wordCount} words | {results.durationInMinutes.toFixed(2)} minutes | {results.totalVideosNeeded} videos
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
            <Button onClick={downloadAllVideos}>
              <Download className="mr-2 h-4 w-4" />
              Download All Selected
            </Button>
          </div>
        </div>

        <Separator />

        <div className="grid gap-6">
          {results.videoResults.map((result, index) => (
            <Card key={index} className="overflow-hidden">
              <CardHeader className="p-4">
                <CardTitle className="text-lg">
                  {index + 1}. {result.sentence}
                </CardTitle>
                <CardDescription>Search query: "{result.query}"</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Tabs defaultValue={`video-0-${index}`} className="w-full">
                  <div className="border-b px-4">
                    <TabsList className="w-full justify-start h-12">
                      {result.videos.map((video, videoIndex) => (
                        <TabsTrigger
                          key={video.id}
                          value={`video-${videoIndex}-${index}`}
                          onClick={() => handleSelectVideo(result.sentence, videoIndex)}
                          className={selectedVideos[result.sentence] === videoIndex ? "border-primary" : ""}
                        >
                          Option {videoIndex + 1}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>
                  {result.videos.map((video, videoIndex) => (
                    <TabsContent key={video.id} value={`video-${videoIndex}-${index}`} className="m-0">
                      <div className="aspect-video bg-muted relative">
                        <img
                          src={video.image || "/placeholder.svg"}
                          alt={`Video preview for ${result.query}`}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute bottom-4 right-4 flex gap-2">
                          <Button size="sm" asChild>
                            <a href={video.url} target="_blank" rel="noopener noreferrer">
                              View on {results.provider === "pexels" ? "Pexels" : "Pixabay"}
                            </a>
                          </Button>
                          <Button size="sm" variant="secondary" asChild>
                            <a href={video.downloadUrl} download={`video-${result.query.replace(/\s+/g, "-")}.mp4`}>
                              <Download className="mr-2 h-4 w-4" />
                              Download
                            </a>
                          </Button>
                        </div>
                      </div>
                      <div className="p-4 bg-muted/50">
                        <p className="text-sm text-muted-foreground">
                          Duration: {video.duration}s | Resolution: {video.width}x{video.height}
                        </p>
                      </div>
                    </TabsContent>
                  ))}
                </Tabs>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}

