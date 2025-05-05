# Script Video Generator API (FastAPI Version)

A FastAPI implementation of the Script Video Generator API.

## Features

- Process script files into video and image content segments
- Search for stock videos and images based on script content
- Generate AI images using OpenAI or Google Gemini
- Concatenate videos and images into a single video
- Regenerate content for specific sections

## Requirements

- Python 3.8+
- FFmpeg installed on the system

## Installation

1. Clone the repository
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Set up environment variables (create a `.env` file in the project root):

```
OPENAI_API_KEY=your_openai_api_key
PEXELS_API_KEY=your_pexels_api_key
PIXABAY_API_KEY=your_pixabay_api_key
SERPAPI_KEY=your_serpapi_key
GEMINI_API_KEY=your_gemini_api_key  # Optional
```

## Usage

Start the FastAPI server:

```bash
uvicorn app:app --reload
```

The API will be available at http://localhost:8000

## API Endpoints

- `GET /api/videos/{session_id}/{filename}` - Stream a video file
- `POST /api/process-script/` - Process a script and generate content segments
- `POST /api/concatenate-videos/` - Concatenate videos and images
- `POST /api/generate-ai-image/` - Generate an AI image
- `POST /api/regenerate-content/` - Regenerate content for a specific section

## Documentation

Interactive API documentation is available at:

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc 