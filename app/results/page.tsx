"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Download, Loader2, Film, RefreshCw } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"

interface ContentResult {
  segment: string
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
  images: {
    url: string
    width: number
    height: number
    thumbnail: string
    isAiGenerated?: boolean
    revisedPrompt?: string
  }[]
  aiImages?: {
    url: string
    width: number
    height: number
    thumbnail: string
    revisedPrompt?: string
  }[]
  imageDurations: number[]
  segmentDuration: number
  sectionType?: 'video' | 'image'
}

interface ProcessingResults {
  wordCount: number
  totalDurationInSeconds: number
  totalSegments: number
  wordsPerSegment: number
  targetSegmentDuration: number
  contentResults: ContentResult[]
  provider: "pexels" | "pixabay"
  mode: "images" | "videos" | "mixed"
  settings: {
    videosPerMinute: number
    imagesPerMinute: number
    imageDurationRange: [number, number]
  }
  theme?: string
  generateAiImages?: boolean
}

function getSectionKey(index: number, segment: string): string {
  return `section-${index}-${segment}`
}

export default function ResultsPage() {
  const [results, setResults] = useState<ProcessingResults | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedContent, setSelectedContent] = useState<Record<string, { type: "video" | "image", index: number }>>({})
  const [concatenating, setConcatenating] = useState(false)
  const [finalVideo, setFinalVideo] = useState<string | null>(null)
  const [sectionTypes, setSectionTypes] = useState<('video' | 'image')[]>([])
  const [customQueries, setCustomQueries] = useState<Record<number, string>>({})
  const [regeneratingSection, setRegeneratingSection] = useState<number | null>(null)

  useEffect(() => {
    const fetchResults = async () => {
      try {
        const response = await fetch("/api/process-script")

        if (!response.ok) {
          throw new Error("Failed to fetch results")
        }

        const data: ProcessingResults = await response.json()
        setResults(data)

        // Calculate section types based on mode and content distribution
        const types: ('video' | 'image')[] = []
        if (data.mode === "mixed") {
          // For mixed mode, use video every third section
          data.contentResults.forEach((_, index) => {
            types.push(index % 3 === 2 ? 'video' : 'image')
          })
        } else {
          // For single mode, all sections are the same type
          types.push(...Array(data.contentResults.length).fill(data.mode === "videos" ? 'video' : 'image'))
        }
        setSectionTypes(types)

        // Initialize selected content based on section types
        const initialSelected: Record<string, { type: "video" | "image", index: number }> = {}
        data.contentResults.forEach((result, index) => {
          const sectionType = types[index]
          const sectionKey = getSectionKey(index, result.segment)
          if (sectionType === 'video' && result.videos?.length > 0) {
            initialSelected[sectionKey] = { type: "video", index: 0 }
          } else if (sectionType === 'image' && result.images?.length > 0) {
            initialSelected[sectionKey] = { type: "image", index: 0 }
          }
        })
        setSelectedContent(initialSelected)
      } catch (err) {
        setError("An error occurred while fetching results")
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    fetchResults()
  }, [])

  const handleSelectContent = (index: number, segment: string, type: "video" | "image", contentIndex: number) => {
    const sectionKey = getSectionKey(index, segment)
    setSelectedContent((prev) => ({
      ...prev,
      [sectionKey]: { type, index: contentIndex },
    }))
  }

  const concatenateContent = async () => {
    if (!results) return

    setConcatenating(true)
    try {
      // Get selected content with their durations
      const contentSequence = results.contentResults.map((result, index) => {
        const sectionKey = getSectionKey(index, result.segment)
        const selection = selectedContent[sectionKey]
        if (!selection) {
          throw new Error(`No content selected for section ${index + 1}: ${result.segment}`)
        }

        if (selection.type === "video") {
          const video = result.videos[selection.index]
          return {
            type: "video" as const,
            contentId: video.downloadUrl,
            duration: result.segmentDuration,
            sectionIndex: index
          }
        } else {
          const image = result.images[selection.index]
          return {
            type: "image" as const,
            contentId: image.url,
            duration: result.segmentDuration,
            sectionIndex: index
          }
        }
      })

      // Prepare selected clips for backward compatibility
      const selectedClips = contentSequence.map(item => {
        if (item.type === "video") {
          return results.contentResults[item.sectionIndex].videos.find(v => v.downloadUrl === item.contentId) || null
        } else {
          const image = results.contentResults[item.sectionIndex].images.find(i => i.url === item.contentId)
          return image ? {
            ...image,
            duration: item.duration
          } : null
        }
      }).filter((clip): clip is NonNullable<typeof clip> => clip !== null)

      const response = await fetch("/api/concatenate-videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          mode: results.mode,
          videos: selectedClips.filter((clip): clip is (typeof clip & { downloadUrl: string }) => "downloadUrl" in clip),
          images: selectedClips.filter((clip): clip is (typeof clip & { url: string }) => !("downloadUrl" in clip)),
          imageDurations: selectedClips
            .filter((clip): clip is (typeof clip & { duration: number }) => !("downloadUrl" in clip) && typeof clip.duration === "number")
            .map(clip => clip.duration),
          contentSequence
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to concatenate content")
      }

      const data = await response.json()
      setFinalVideo(data.videoPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to concatenate content")
      console.error(err)
    } finally {
      setConcatenating(false)
    }
  }

  // Calculate total duration of selected content
  const calculateTotalDuration = () => {
    if (!results) return 0
    
    return Math.floor(results.contentResults.reduce((total, result) => {
      return total + result.segmentDuration;
    }, 0))
  }

  // Add a function to handle custom query input change
  const handleCustomQueryChange = (index: number, query: string) => {
    setCustomQueries(prev => ({
      ...prev,
      [index]: query
    }))
  }

  // Add a function to regenerate content for a specific section
  const regenerateContent = async (index: number) => {
    if (!results) return
    
    const customQuery = customQueries[index]
    if (!customQuery || customQuery.trim() === '') {
      toast({
        title: "Empty query",
        description: "Please enter a custom query first",
        variant: "destructive"
      })
      return
    }
    
    setRegeneratingSection(index)
    
    try {
      const response = await fetch("/api/regenerate-content", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          sectionIndex: index,
          customQuery,
          mode: results.mode,
          provider: results.provider,
          theme: results.theme || "",
          generateNewQuery: true,
          generateAiImages: results.generateAiImages || false
        }),
      })
      
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || "Failed to regenerate content")
      }
      
      const data = await response.json()
      
      // Update results with new content
      setResults(prev => {
        if (!prev) return prev
        
        const newContentResults = [...prev.contentResults]
        newContentResults[index] = {
          ...newContentResults[index],
          query: data.query || customQuery,
          videos: data.videos || newContentResults[index].videos,
          images: data.images || newContentResults[index].images,
          aiImages: data.aiImage ? [data.aiImage] : newContentResults[index].aiImages
        }
        
        return {
          ...prev,
          contentResults: newContentResults
        }
      })
      
      // Update selected content to show the first new item
      const sectionKey = getSectionKey(index, results.contentResults[index].segment)
      const sectionType = sectionTypes[index]
      setSelectedContent(prev => ({
        ...prev,
        [sectionKey]: { type: sectionType, index: 0 }
      }))
      
      toast({
        title: "Content regenerated",
        description: "New content has been generated based on your input"
      })
    } catch (err) {
      console.error("Error regenerating content:", err)
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to regenerate content",
        variant: "destructive"
      })
    } finally {
      setRegeneratingSection(null)
    }
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
              {results.wordCount} words | {(results.totalDurationInSeconds / 60).toFixed(2)} minutes | {results.totalSegments} segments
            </p>
            <p className="text-muted-foreground">
              Total Duration: {calculateTotalDuration()} seconds
            </p>
          </div>
          <div className="flex gap-4">
            <Button
              onClick={() => concatenateContent()}
              disabled={concatenating}
            >
              {concatenating ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Film className="mr-2 h-4 w-4" />
                  Create Video
                </>
              )}
            </Button>
            <Button asChild variant="outline">
              <Link href="/">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Link>
            </Button>
          </div>
        </div>

        {finalVideo && (
          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Final Video</CardTitle>
              <CardDescription>Your concatenated video is ready</CardDescription>
            </CardHeader>
            <CardContent>
              <video controls className="w-full aspect-video">
                <source src={finalVideo} type="video/mp4" />
                Your browser does not support the video tag.
              </video>
              <div className="mt-4 flex justify-end">
                <Button asChild>
                  <a href={finalVideo} download="final-video.mp4">
                    <Download className="mr-2 h-4 w-4" />
                    Download Final Video
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Separator />

        <div className="grid gap-6">
          {results.contentResults.map((result, index) => {
            const sectionType = sectionTypes[index]
            return (
              <Card key={getSectionKey(index, result.segment)} className="overflow-hidden">
                <CardHeader className="p-4">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <span>Section {index + 1}</span>
                    <span className="text-sm text-muted-foreground">
                      ({sectionType === 'video' ? 'Video' : 'Image'} Section)
                    </span>
                  </CardTitle>
                  <CardDescription>
                    <div>Segment: {result.segment}</div>
                    <div className="mt-1">Search query: "{result.query}"</div>
                    
                    {/* Add custom query input and regenerate button */}
                    <div className="mt-3 flex gap-2 items-center">
                      <Input 
                        placeholder="Enter custom query..."
                        value={customQueries[index] || ''}
                        onChange={(e) => handleCustomQueryChange(index, e.target.value)}
                        className="flex-1"
                      />
                      <Button 
                        size="sm"
                        variant="outline"
                        onClick={() => regenerateContent(index)}
                        disabled={regeneratingSection === index}
                      >
                        {regeneratingSection === index ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            Regenerating...
                          </>
                        ) : (
                          <>
                            <RefreshCw className="mr-1 h-3 w-3" />
                            Regenerate
                          </>
                        )}
                      </Button>
                    </div>
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-0">
                  <Tabs 
                    defaultValue={
                      sectionType === 'video' 
                        ? `video-0-${index}` 
                        : `image-0-${index}`
                    } 
                    className="w-full"
                  >
                    <div className="border-b px-4">
                      <TabsList className="w-full justify-start h-12">
                        {sectionType === 'video' && result.videos.map((video, videoIndex) => (
                          <TabsTrigger
                            key={video.id}
                            value={`video-${videoIndex}-${index}`}
                            onClick={() => handleSelectContent(index, result.segment, "video", videoIndex)}
                            className={selectedContent[getSectionKey(index, result.segment)]?.type === "video" && 
                                     selectedContent[getSectionKey(index, result.segment)]?.index === videoIndex ? "border-primary" : ""}
                          >
                            Video {videoIndex + 1}
                          </TabsTrigger>
                        ))}
                        {sectionType === 'image' && result.images.map((image, imageIndex) => (
                          <TabsTrigger
                            key={`${image.url}-${imageIndex}`}
                            value={`image-${imageIndex}-${index}`}
                            onClick={() => handleSelectContent(index, result.segment, "image", imageIndex)}
                            className={selectedContent[getSectionKey(index, result.segment)]?.type === "image" && 
                                     selectedContent[getSectionKey(index, result.segment)]?.index === imageIndex ? "border-primary" : ""}
                          >
                            Image {imageIndex + 1}
                          </TabsTrigger>
                        ))}
                      </TabsList>
                    </div>
                    {sectionType === 'video' && result.videos.map((video, videoIndex) => (
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
                            Target Duration: {result.segmentDuration.toFixed(1)}s | Actual Duration: {video.duration}s | Resolution: {video.width}x{video.height}
                          </p>
                        </div>
                      </TabsContent>
                    ))}
                    {sectionType === 'image' && result.images.map((image, imageIndex) => (
                      <TabsContent key={`${image.url}-${imageIndex}`} value={`image-${imageIndex}-${index}`} className="m-0">
                        <div className="aspect-video bg-muted relative">
                          <img
                            src={image.thumbnail || image.url}
                            alt={`Image preview for ${result.query}`}
                            className="w-full h-full object-cover"
                          />
                          {image.isAiGenerated && (
                            <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-xs px-2 py-1 rounded-md">
                              AI Generated
                            </div>
                          )}
                          <div className="absolute bottom-4 right-4 flex gap-2">
                            <Button size="sm" variant="secondary" asChild>
                              <a href={image.url} target="_blank" rel="noopener noreferrer">
                                <Download className="mr-2 h-4 w-4" />
                                View Full Image
                              </a>
                            </Button>
                          </div>
                        </div>
                        <div className="p-4 bg-muted/50">
                          <p className="text-sm text-muted-foreground">
                            Target Duration: {result.segmentDuration.toFixed(1)}s | Resolution: {image.width}x{image.height}
                            {image.isAiGenerated && image.revisedPrompt && (
                              <>
                                <br />
                                <span className="font-medium">AI prompt:</span> {image.revisedPrompt}
                              </>
                            )}
                          </p>
                        </div>
                      </TabsContent>
                    ))}
                  </Tabs>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// Helper function to determine the default tab value
function getDefaultTabValue(result: ContentResult, mode: "images" | "videos" | "mixed", index: number): string {
  if (mode === "videos" && result.videos.length > 0) {
    return `video-0-${index}`
  } else if (mode === "images" && result.images.length > 0) {
    return `image-0-${index}`
  } else if (mode === "mixed") {
    if (result.videos.length > 0) {
      return `video-0-${index}`
    } else if (result.images.length > 0) {
      return `image-0-${index}`
    }
  }
  return ""
}

