'use client';

import { useState, useEffect } from 'react';
import { 
  FiUpload, 
  FiFilm, 
  FiImage, 
  FiLayers, 
  FiSettings, 
  FiPlus, 
  FiPlay,
  FiBriefcase,
  FiLoader,
  FiAlertCircle,
  FiCheck
} from 'react-icons/fi';
import Link from 'next/link';
import mammoth from 'mammoth';
import FileUpload from './components/FileUpload';
import ContentEditor from './components/ContentEditor';
import Timeline from './components/Timeline';
import VideoPreview from './components/VideoPreview';
import { 
  uploadScript, 
  concatenateVideos, 
  TaskStatusResponse,
  ContentSection,
  VideoResult,
  ImageResult,
  ContentSequenceItem,
  ContentProvider
} from './api/apiClient';

// Step types for the wizard-like interface
type Step = 'upload' | 'process' | 'edit' | 'timeline' | 'render' | 'complete';

export default function HomePage() {
  // App state
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'videos' | 'images' | 'mixed'>('videos');
  const [provider, setProvider] = useState<ContentProvider>('pexels');
  const [theme, setTheme] = useState<string>('');
  const [videosPerMinute, setVideosPerMinute] = useState<number>(10);
  const [imagesPerMinute, setImagesPerMinute] = useState<number>(20);
  const [generateAiImages, setGenerateAiImages] = useState<boolean>(false);
  
  // Task state
  const [processingTaskId, setProcessingTaskId] = useState<string>('');
  const [renderingTaskId, setRenderingTaskId] = useState<string>('');
  const [contentSections, setContentSections] = useState<ContentSection[]>([]);
  
  // Timeline state
  const [sequence, setSequence] = useState<ContentSequenceItem[]>([]);
  const [videos, setVideos] = useState<VideoResult[]>([]);
  const [images, setImages] = useState<ImageResult[]>([]);
  const [finalVideoUrl, setFinalVideoUrl] = useState<string>('');

  // Function to extract text from uploaded file
  const extractTextFromFile = async (file: File) => {
    setIsExtracting(true);
    setExtractError(null);
    
    try {
      if (file.type === 'text/plain') {
        // For plain text files
        const text = await file.text();
        setFileContent(text);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
                file.name.endsWith('.docx')) {
        // For DOCX files - handle in the browser using mammoth.js
        try {
          const arrayBuffer = await file.arrayBuffer();
          const result = await mammoth.extractRawText({ arrayBuffer });
          setFileContent(result.value);
          
          if (result.messages.length > 0) {
            console.log('Mammoth messages:', result.messages);
          }
        } catch (docxError) {
          console.error('Error parsing DOCX with mammoth:', docxError);
          
          // Fallback to server-side extraction if mammoth fails
          const formData = new FormData();
          formData.append('file', file);
          
          const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/';
          const response = await fetch(`${NEXT_PUBLIC_API_URL}api/extract-text`, {
            method: 'POST',
            body: formData,
          });
          
          if (!response.ok) {
            throw new Error(`Failed to extract text: ${response.statusText}`);
          }
          
          const data = await response.json();
          setFileContent(data.text);
        }
      } else if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        // For PDF files - use server-side extraction
        const formData = new FormData();
        formData.append('file', file);
        
        const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/';
        const response = await fetch(`${NEXT_PUBLIC_API_URL}api/extract-text`, {
          method: 'POST',
          body: formData,
        });
        
        if (!response.ok) {
          throw new Error(`Failed to extract text: ${response.statusText}`);
        }
        
        const data = await response.json();
        setFileContent(data.text);
      } else {
        throw new Error('Unsupported file type. Please upload a .txt, .docx or .pdf file.');
      }
    } catch (error) {
      console.error('Error extracting text:', error);
      setExtractError(error instanceof Error ? error.message : 'Failed to extract text');
    } finally {
      setIsExtracting(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (selectedFile: File) => {
    setFile(selectedFile);
    setFileContent('');
    setExtractError(null);
    
    // Automatically start text extraction when a file is selected
    extractTextFromFile(selectedFile);
  };
  
  // Start script processing
  const handleStartProcessing = async () => {
    if (!file || !fileContent) {
      alert('Please upload a file and wait for text extraction to complete.');
      return;
    }
    
    try {
      setStep('process');
      
      // Send request directly to the FastAPI backend
      const NEXT_PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/';
      const response = await fetch(`${NEXT_PUBLIC_API_URL}api/process-script`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          file_content: fileContent,
          mode: mode,
          videos_per_minute: videosPerMinute,
          images_per_minute: imagesPerMinute,
          search_provider: provider,
          generate_ai_images: generateAiImages,
          theme: theme || undefined
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to process script: ${response.statusText}`);
      }
      
      const data = await response.json();
      setProcessingTaskId(data.task_id);
      
      // Show success message
      alert('Script submitted successfully! Redirecting to jobs page...');
      
      // Redirect to the jobs page
      window.location.href = '/jobs';
    } catch (error) {
      console.error('Error processing script:', error);
      alert('Failed to process script. Please try again.');
      setStep('upload');
    }
  };
  
  // Handle content processing completed
  const handleProcessingCompleted = (result: any) => {
    if (result && result.contentSections) {
      setContentSections(result.contentSections);
      
      // Collect all videos and images
      const allVideos: VideoResult[] = [];
      const allImages: ImageResult[] = [];
      
      result.contentSections.forEach((section: ContentSection) => {
        if (section.videos) allVideos.push(...section.videos);
        if (section.images) allImages.push(...section.images);
      });
      
      setVideos(allVideos);
      setImages(allImages);
      
      setStep('edit');
    }
  };
  
  // Update a content section
  const handleUpdateContentSection = (index: number, updatedSection: ContentSection) => {
    const updatedSections = [...contentSections];
    updatedSections[index] = updatedSection;
    setContentSections(updatedSections);
    
    // Update global videos and images arrays
    const allVideos: VideoResult[] = [];
    const allImages: ImageResult[] = [];
    
    updatedSections.forEach(section => {
      if (section.videos) allVideos.push(...section.videos);
      if (section.images) allImages.push(...section.images);
    });
    
    setVideos(allVideos);
    setImages(allImages);
  };
  
  // Handle content selection for timeline
  const handleSelectContent = (type: 'video' | 'image', content: VideoResult | ImageResult, sectionIndex: number) => {
    const newItem: ContentSequenceItem = {
      type,
      contentId: type === 'video' 
        ? ((content as VideoResult).id || (content as VideoResult).downloadUrl) 
        : (content as ImageResult).url,
      duration: type === 'video' 
        ? ((content as VideoResult).duration || 5) 
        : 5,
      sectionIndex
    };
    
    setSequence([...sequence, newItem]);
  };
  
  // Handle updates to the sequence
  const handleUpdateSequence = (newSequence: ContentSequenceItem[]) => {
    setSequence(newSequence);
  };
  
  // Remove an item from the sequence
  const handleRemoveItem = (index: number) => {
    const newSequence = [...sequence];
    newSequence.splice(index, 1);
    setSequence(newSequence);
  };
  
  // Update the duration of a sequence item
  const handleUpdateDuration = (index: number, newDuration: number) => {
    const newSequence = [...sequence];
    newSequence[index] = {
      ...newSequence[index],
      duration: newDuration
    };
    setSequence(newSequence);
  };
  
  // Start video rendering
  const handleRenderVideo = async () => {
    if (sequence.length === 0) {
      alert('Please add some content to the timeline first.');
      return;
    }
    
    try {
      const response = await concatenateVideos(sequence, videos, images);
      setRenderingTaskId(response.task_id);
      setStep('render');
    } catch (error) {
      console.error('Error starting video render:', error);
      alert('Failed to start video rendering. Please try again.');
    }
  };
  
  // Handle render completed
  const handleRenderCompleted = (result: any) => {
    if (result && result.videoUrl) {
      setFinalVideoUrl(result.videoUrl);
      setStep('complete');
    }
  };
  
  // Reset the whole process to start over
  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setProcessingTaskId('');
    setRenderingTaskId('');
    setContentSections([]);
    setSequence([]);
    setVideos([]);
    setImages([]);
    setFinalVideoUrl('');
  };
  
  // Form controls for the script settings
  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newMode = e.target.value as 'videos' | 'images' | 'mixed';
    setMode(newMode);
    
    // Reset provider based on selected mode to ensure valid provider selection
    if (newMode === 'videos') {
      setProvider('pexels');
    } else if (newMode === 'images') {
      setProvider('pexels');
    } else if (newMode === 'mixed') {
      setProvider('pexels');
    }
  };

  const handleProviderChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setProvider(e.target.value as ContentProvider);
  };

  const handleVideosPerMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setVideosPerMinute(isNaN(value) ? 10 : value);
  };

  const handleImagesPerMinuteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value);
    setImagesPerMinute(isNaN(value) ? 20 : value);
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTheme(e.target.value);
  };

  const handleGenerateAiImagesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setGenerateAiImages(e.target.checked);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex justify-between mb-4">
          <div>
            {apiConnected === false && (
              <div className="px-4 py-2 bg-red-100 text-red-800 rounded-md flex items-center">
                <FiAlertCircle className="mr-2" />
                API server not connected. Please ensure the backend server is running.
              </div>
            )}
            {apiConnected === true && (
              <div className="px-4 py-2 bg-green-100 text-green-800 rounded-md flex items-center">
                <FiCheck className="mr-2" />
                API server connected
              </div>
            )}
          </div>
        </div>
        
       
        
        {/* Main content */}
        <main className="container mx-auto px-4 py-8">
          {/* Upload step */}
          {step === 'upload' && (
            <div className="max-w-3xl mx-auto">
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <FileUpload 
                  onFileSelect={handleFileSelect} 
                  accept=".txt,.docx,.pdf"
                  maxSizeMB={10}
                  label="Upload your script document"
                />
                
                {isExtracting && (
                  <div className="mt-4 text-center">
                    <FiLoader className="w-6 h-6 mx-auto animate-spin text-blue-500" />
                    <p className="mt-2 text-sm text-gray-600">Extracting text from file...</p>
                  </div>
                )}
                
                {extractError && (
                  <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-600 text-sm">
                    <strong>Error:</strong> {extractError}
                  </div>
                )}
                
                {fileContent && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Extracted Text Preview:</h4>
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-md max-h-40 overflow-y-auto">
                      <p className="text-sm text-gray-600 whitespace-pre-line">
                        {fileContent.length > 500 
                          ? `${fileContent.substring(0, 500)}...` 
                          : fileContent}
                      </p>
                    </div>
                    <p className="mt-1 text-xs text-gray-500">
                      {fileContent.length} characters extracted
                    </p>
                  </div>
                )}
              </div>
              
              {file && (
                <div className="bg-white rounded-lg shadow-md p-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">Script Settings</h3>
                    <Link 
                      href="/jobs" 
                      className="flex items-center px-3 py-1.5 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm"
                    >
                      <FiBriefcase className="mr-1.5" />
                      View Jobs
                    </Link>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Content Mode</label>
                      <select 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-800"
                        value={mode}
                        onChange={handleModeChange}
                        id="content-mode"
                      >
                        <option value="videos">Videos Only</option>
                        <option value="images">Images Only</option>
                        <option value="mixed">Mixed (Videos & Images)</option>
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Content Provider</label>
                      <select 
                        className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-800"
                        value={provider}
                        onChange={handleProviderChange}
                        id="content-provider"
                      >
                        {mode === 'videos' && (
                          <>
                            <option value="pexels">Pexels</option>
                            <option value="pixabay">Pixabay</option>
                            <option value="minimax">Minimax</option>
                          </>
                        )}
                        {mode === 'images' && (
                          <>
                            <option value="pexels">Pexels</option>
                            <option value="pixabay">Pixabay</option>
                            <option value="minimax">Minimax</option>
                            <option value="google">Gemini</option>
                            <option value="openai-gpt-image">OpenAI GPT-Image</option>
                          </>
                        )}
                        {mode === 'mixed' && (
                          <>
                            <option value="pexels">Pexels</option>
                            <option value="pixabay">Pixabay</option>
                          </>
                        )}
                      </select>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {(mode === 'videos' || mode === 'mixed') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="videos-per-minute">
                          Videos Per Minute
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max="30"
                          id="videos-per-minute"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-800"
                          placeholder="Enter a number (default: 10)"
                          value={videosPerMinute}
                          onChange={handleVideosPerMinuteChange}
                        />
                      </div>
                    )}
                    
                    {(mode === 'images' || mode === 'mixed') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="images-per-minute">
                          Images Per Minute
                        </label>
                        <input 
                          type="number" 
                          min="1" 
                          max="30"
                          id="images-per-minute"
                          className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-800"
                          placeholder="Enter a number (default: 20)"
                          value={imagesPerMinute}
                          onChange={handleImagesPerMinuteChange}
                        />
                      </div>
                    )}
                  </div>
                  
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="theme-input">Theme (optional)</label>
                    <input 
                      type="text"
                      id="theme-input"
                      className="w-full border border-gray-300 rounded-md px-3 py-2 text-gray-800"
                      placeholder="Enter a theme for your content (e.g. nature, technology, business)"
                      value={theme}
                      onChange={handleThemeChange}
                    />
                    <p className="mt-1 text-sm text-gray-500">
                      Providing a theme helps generate more relevant content for your script.
                    </p>
                  </div>
                  
                  <div className="flex items-center mb-6">
                    <input
                      type="checkbox"
                      id="generateAiImages"
                      className="mr-2 h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                      checked={generateAiImages}
                      onChange={handleGenerateAiImagesChange}
                    />
                    <label htmlFor="generateAiImages" className="text-sm font-medium text-gray-700">
                      Also generate AI images for segments without suitable content
                    </label>
                  </div>
                  
                  <div className="flex justify-end">
                    <button
                      onClick={handleStartProcessing}
                      className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
                      disabled={!file || isExtracting || !fileContent}
                    >
                      {isExtracting ? 'Extracting Text...' : 'Process Script'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
          
          {/* Processing step */}
          {step === 'process' && processingTaskId && (
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold mb-6 text-center">Processing Your Script</h2>
              
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <div className="mt-8 text-center border-t pt-6">
                  <p className="text-gray-600 mb-3">
                    Your script is being processed in the background. You can view its progress on the jobs page.
                  </p>
                  <Link 
                    href="/jobs" 
                    className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <FiBriefcase className="mr-2" />
                    Go to Jobs Page
                  </Link>
                </div>
              </div>
            </div>
          )}
          
          {/* Edit step */}
          {step === 'edit' && contentSections.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Edit Content</h2>
                
                <button
                  onClick={() => setStep('timeline')}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center"
                >
                  <FiFilm className="mr-2" /> Go to Timeline
                </button>
              </div>
              
              <ContentEditor
                contentSections={contentSections}
                mode={mode}
                provider={provider}
                theme={theme}
                onUpdateContentSection={handleUpdateContentSection}
                onSelectContent={handleSelectContent}
              />
              
              <div className="mt-6 text-center">
                <button
                  onClick={() => setStep('timeline')}
                  className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors"
                >
                  Continue to Timeline
                </button>
              </div>
            </div>
          )}
          
          {/* Timeline step */}
          {step === 'timeline' && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-semibold">Timeline</h2>
                
                <div className="flex space-x-3">
                  <button
                    onClick={() => setStep('edit')}
                    className="border border-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Back to Content
                  </button>
                  
                  <button
                    onClick={handleRenderVideo}
                    className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center"
                    disabled={sequence.length === 0}
                  >
                    <FiPlay className="mr-2" /> Generate Video
                  </button>
                </div>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2">
                  <Timeline
                    sequence={sequence}
                    videos={videos}
                    images={images}
                    onUpdateSequence={handleUpdateSequence}
                    onRemoveItem={handleRemoveItem}
                    onUpdateDuration={handleUpdateDuration}
                  />
                  
                  <div className="mt-6">
                    <h3 className="text-lg font-semibold mb-3">Content Sections</h3>
                    <ContentEditor
                      contentSections={contentSections}
                      mode={mode}
                      provider={provider}
                      theme={theme}
                      onUpdateContentSection={handleUpdateContentSection}
                      onSelectContent={handleSelectContent}
                    />
                  </div>
                </div>
                
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-lg shadow-md p-4 sticky top-4">
                    <h3 className="text-lg font-semibold mb-3">Preview</h3>
                    
                    {sequence.length > 0 ? (
                      <div>
                        {/* Preview the first item in the sequence */}
                        {sequence[0].type === 'video' ? (
                          <VideoPreview
                            src={(videos.find(v => v.id === sequence[0].contentId || v.downloadUrl === sequence[0].contentId)?.downloadUrl || '')}
                            type="video"
                            duration={sequence[0].duration}
                            title={`Video from section ${sequence[0].sectionIndex + 1}`}
                          />
                        ) : (
                          <VideoPreview
                            src={(images.find(i => i.url === sequence[0].contentId)?.url || '')}
                            type="image"
                            title={`Image from section ${sequence[0].sectionIndex + 1}`}
                          />
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-100 rounded-lg p-6 text-center text-gray-500">
                        <FiFilm className="mx-auto mb-2 text-3xl" />
                        <p>Add content to the timeline to see a preview</p>
                      </div>
                    )}
                    
                    <div className="mt-4">
                      <h4 className="font-medium text-sm mb-2">Timeline Summary</h4>
                      <div className="text-sm">
                        <p>Total items: {sequence.length}</p>
                        <p>Videos: {sequence.filter(item => item.type === 'video').length}</p>
                        <p>Images: {sequence.filter(item => item.type === 'image').length}</p>
                        <p>Total duration: {sequence.reduce((sum, item) => sum + item.duration, 0).toFixed(2)}s</p>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <button
                        onClick={handleRenderVideo}
                        className="w-full bg-blue-600 text-white py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center"
                        disabled={sequence.length === 0}
                      >
                        <FiPlay className="mr-2" /> Generate Video
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Render step */}
          {step === 'render' && renderingTaskId && (
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold mb-6 text-center">Generating Your Video...</h2>
            </div>
          )}
          
          {/* Complete step */}
          {step === 'complete' && finalVideoUrl && (
            <div className="max-w-3xl mx-auto">
              <h2 className="text-2xl font-semibold mb-6 text-center">Your Video is Ready!</h2>
              
              <div className="bg-white rounded-lg shadow-md p-6 mb-6">
                <VideoPreview
                  src={finalVideoUrl}
                  type="video"
                  title="Your Generated Video"
                  duration={sequence.reduce((sum, item) => sum + item.duration, 0)}
                />
                
                <div className="mt-6 flex flex-col sm:flex-row justify-center gap-4">
                  <a
                    href={finalVideoUrl}
                    download
                    className="bg-blue-600 text-white px-6 py-3 rounded-md hover:bg-blue-700 transition-colors text-center"
                  >
                    Download Video
                  </a>
                  
                  <button
                    onClick={handleReset}
                    className="border border-gray-300 text-gray-700 px-6 py-3 rounded-md hover:bg-gray-50 transition-colors"
                  >
                    Create Another Video
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
        
        {/* Footer */}
        <footer className="bg-gray-100 border-t py-6 mt-auto">
          <div className="container mx-auto px-4 text-center text-gray-600 text-sm">
            <p>&copy; {new Date().getFullYear()} Script Video Generator</p>
          </div>
        </footer>
      </div>
    </div>
  );
}
