from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Union, Literal
from enum import Enum
import uuid
import datetime

# Video Provider
VideoProvider = Literal["pexels", "pixabay", "minimax", "google", "openai-gpt-image"]

# AI Image Provider
AIImageProvider = Literal["openai", "google", "minimax"]

# Content mode
ContentMode = Literal["images", "videos", "mixed"]

# Task Status
class TaskStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"

# Document Processing Task model
class DocumentProcessingTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.now)
    updated_at: datetime.datetime = Field(default_factory=datetime.datetime.now)
    completed_at: Optional[datetime.datetime] = None
    file_name: str
    theme: Optional[str] = ""
    content_mode: ContentMode = "videos"
    videos_per_minute: Optional[int] = 10
    images_per_minute: Optional[int] = 20
    provider: VideoProvider = "pexels"
    generate_ai_images: bool = False
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Video Concatenation Task model
class VideoConcatenationTask(BaseModel):
    task_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    status: TaskStatus = TaskStatus.PENDING
    created_at: datetime.datetime = Field(default_factory=datetime.datetime.now)
    updated_at: datetime.datetime = Field(default_factory=datetime.datetime.now)
    completed_at: Optional[datetime.datetime] = None
    content_sequence: List[Dict[str, Any]]
    videos: Optional[List[Dict[str, Any]]] = []
    images: Optional[List[Dict[str, Any]]] = []
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

# Video Result model
class VideoResult(BaseModel):
    id: Optional[str] = None
    width: Optional[int] = None
    height: Optional[int] = None
    duration: Optional[float] = None
    image: Optional[str] = None
    downloadUrl: str
    user: Optional[str] = None

# Image Result model
class ImageResult(BaseModel):
    url: str
    width: Optional[int] = None
    height: Optional[int] = None
    thumbnail: Optional[str] = None
    isAiGenerated: Optional[bool] = False
    source: Optional[str] = None

# Content Sequence Item
class ContentSequenceItem(BaseModel):
    type: Literal["image", "video"]
    contentId: str
    duration: float
    sectionIndex: int

# Process Script Request model
class ProcessScriptRequest(BaseModel):
    mode: ContentMode = "videos"
    videosPerMinute: Optional[int] = 10
    imagesPerMinute: Optional[int] = 20
    imageDurationMin: Optional[float] = 2.0
    imageDurationMax: Optional[float] = 5.0
    provider: VideoProvider = "pexels"
    theme: Optional[str] = ""
    generateAiImages: Optional[bool] = False

# Process Script Response model
class ContentSection(BaseModel):
    segment: str
    query: str
    videos: List[VideoResult] = []
    images: List[ImageResult] = []
    aiImages: List[Dict[str, Any]] = []
    imageDurations: List[float] = []
    segmentDuration: float
    index: int

class ProcessScriptResponse(BaseModel):
    success: bool = True
    contentSections: List[ContentSection]

# Task response models
class TaskResponse(BaseModel):
    task_id: str
    status: TaskStatus
    message: str

class TaskStatusResponse(BaseModel):
    task_id: str
    status: TaskStatus
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime.datetime
    updated_at: datetime.datetime
    completed_at: Optional[datetime.datetime] = None

# Concatenate Videos Request model
class ConcatenateVideosRequest(BaseModel):
    totalDuration: Optional[float] = None
    contentSequence: List[ContentSequenceItem]
    videos: Optional[List[VideoResult]] = []
    images: Optional[List[ImageResult]] = []

# Concatenate Videos Response model
class ConcatenateVideosResponse(BaseModel):
    success: bool = True
    videoUrl: str
    duration: float

# Generate AI Image Request model
class GenerateAIImageRequest(BaseModel):
    prompt: str
    provider: AIImageProvider = "openai"
    width: Optional[int] = 1024
    height: Optional[int] = 1024

# Generate AI Image Response model
class GenerateAIImageResponse(BaseModel):
    success: bool = True
    imageUrl: str
    provider: AIImageProvider
    prompt: str

# Regenerate Content Request model
class RegenerateContentRequest(BaseModel):
    sectionIndex: int
    customQuery: str
    mode: ContentMode
    provider: VideoProvider = "pexels"
    theme: Optional[str] = ""
    generateNewQuery: Optional[bool] = False
    generateAiImages: Optional[bool] = False

# Regenerate Content Response model
class RegenerateContentResponse(BaseModel):
    success: bool = True
    sectionIndex: int
    query: str
    videos: List[VideoResult] = []
    images: List[ImageResult] = []
    aiImage: Optional[Dict[str, Any]] = None 