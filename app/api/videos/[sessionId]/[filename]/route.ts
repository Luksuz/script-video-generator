import { NextRequest, NextResponse } from "next/server"
import { join } from "path"
import { existsSync, createReadStream, statSync } from "fs"
import { ReadStream } from "fs"

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string; filename: string } }
) {
  try {
    const sessionId = params.sessionId
    const filename = params.filename
    const filePath = join(process.cwd(), "temp", sessionId, filename)

    if (!existsSync(filePath)) {
      return NextResponse.json({ error: "File not found" }, { status: 404 })
    }

    const stat = statSync(filePath)
    const fileSize = stat.size
    const range = request.headers.get("range")

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
      const chunksize = end - start + 1
      const file = createReadStream(filePath, { start, end })
      const head = {
        "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        "Accept-Ranges": "bytes",
        "Content-Length": chunksize.toString(),
        "Content-Type": "video/mp4",
      }
      return new NextResponse(file as unknown as ReadableStream, {
        status: 206,
        headers: head,
      })
    }

    const head = {
      "Content-Length": fileSize.toString(),
      "Content-Type": "video/mp4",
    }
    const file = createReadStream(filePath)
    return new NextResponse(file as unknown as ReadableStream, {
      headers: head,
    })
  } catch (error) {
    console.error("Error serving video:", error)
    return NextResponse.json(
      { error: "Failed to serve video" },
      { status: 500 }
    )
  }
} 