import React, { useState, useEffect, useMemo } from 'react';
import { FiClock, FiCheck, FiAlertCircle, FiLoader, FiArrowLeft, FiDownload, FiCalendar, FiRefreshCw, FiFilm, FiImage, FiZap, FiLink } from 'react-icons/fi';
import { Job, JobStatus, CreatedContent } from '../api/supabaseClient';
import { regenerateContent } from '../api/regenerateClient';
import { concatenateJobVideos, getConcatenationStatus } from '../api/concatenateClient';
import Link from 'next/link';
import Image from 'next/image';
import RegenerateModal from './RegenerateModal';
import { toast } from 'react-toastify';

interface JobDetailProps {
  job: Job;
  content: CreatedContent[];
}

// Format date to a more readable format
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  return date.toLocaleString();
};

// Get status icon based on job status
const getStatusIcon = (status: number | null) => {
  switch (status) {
    case JobStatus.PENDING:
      return <FiClock className="text-yellow-500" />;
    case JobStatus.PROCESSING:
      return <FiLoader className="text-blue-500 animate-spin" />;
    case JobStatus.COMPLETED:
      return <FiCheck className="text-green-500" />;
    case JobStatus.FAILED:
      return <FiAlertCircle className="text-red-500" />;
    default:
      return <FiClock className="text-gray-500" />;
  }
};

// Get status text based on job status
const getStatusText = (status: number | null) => {
  switch (status) {
    case JobStatus.PENDING:
      return 'Pending';
    case JobStatus.PROCESSING:
      return 'Processing';
    case JobStatus.COMPLETED:
      return 'Completed';
    case JobStatus.FAILED:
      return 'Failed';
    default:
      return 'Unknown';
  }
};

// Get progress bar color based on status
const getProgressBarColor = (status: number | null) => {
  switch (status) {
    case JobStatus.PENDING:
      return 'bg-yellow-400';
    case JobStatus.PROCESSING:
      return 'bg-blue-500';
    case JobStatus.COMPLETED:
      return 'bg-green-500';
    case JobStatus.FAILED:
      return 'bg-red-500';
    default:
      return 'bg-gray-400';
  }
};

// Get content type badge details
const getContentTypeBadge = (contentType: string | null) => {
  switch (contentType) {
    case 'video':
      return {
        icon: <FiFilm className="mr-1" />,
        text: 'Video',
        bgColor: 'bg-purple-500'
      };
    case 'image':
      return {
        icon: <FiImage className="mr-1" />,
        text: 'Image',
        bgColor: 'bg-blue-500'
      };
    case 'ai_image':
      return {
        icon: <FiZap className="mr-1" />,
        text: 'AI Image',
        bgColor: 'bg-indigo-500'
      };
    default:
      return {
        icon: <FiImage className="mr-1" />,
        text: 'Content',
        bgColor: 'bg-gray-500'
      };
  }
};

// Get concatenation status text based on concatenated_video_status
const getConcatenationStatusText = (status: number | null) => {
  switch (status) {
    case JobStatus.PENDING:
      return 'Pending';
    case JobStatus.PROCESSING:
      return 'Processing';
    case JobStatus.COMPLETED:
      return 'Completed';
    case JobStatus.FAILED:
      return 'Failed';
    default:
      return 'Not Started';
  }
};

const JobDetail: React.FC<JobDetailProps> = ({ job, content }) => {
  const { id, created_at, mode, status, segment_count, processed_segment_count, error, concatenated_video_status, video_url } = job;
  
  // State for regeneration modal
  const [isRegenerateModalOpen, setIsRegenerateModalOpen] = useState(false);
  const [selectedContent, setSelectedContent] = useState<CreatedContent | null>(null);
  const [isRegenerating, setIsRegenerating] = useState<{[key: string]: boolean}>({});
  
  // State for video concatenation
  const [isConcatenating, setIsConcatenating] = useState(false);
  const [concatenationStatus, setConcatenationStatus] = useState<any>(null);
  const [concatenatedVideoUrl, setConcatenatedVideoUrl] = useState<string | null>(null);
  
  // Sort content by creation date
  const sortedContent = useMemo(() => {
    return [...content].sort((a, b) => {
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  }, [content]);
  
  // Calculate progress percentage
  const progress = segment_count && processed_segment_count !== null
    ? Math.round((processed_segment_count / segment_count) * 100) 
    : status === JobStatus.COMPLETED ? 100 : 0;
  
  // Calculate concatenation progress percentage if available
  const concatenationProgress = concatenationStatus?.video_segments_processed && concatenationStatus?.segments
    ? Math.round((concatenationStatus.video_segments_processed / concatenationStatus.segments) * 100)
    : 0;
  
  const progressBarColor = getProgressBarColor(status);
  const concatenationBarColor = getProgressBarColor(
    concatenationStatus?.concatenated_video_status === 'completed' ? JobStatus.COMPLETED :
    concatenationStatus?.concatenated_video_status === 'processing' ? JobStatus.PROCESSING :
    concatenationStatus?.concatenated_video_status === 'failed' ? JobStatus.FAILED :
    JobStatus.PENDING
  );
  
  // Initial check for concatenation status
  useEffect(() => {
    const checkInitialConcatenationStatus = async () => {
      try {
        const statusResponse = await getConcatenationStatus(id);
        if (statusResponse) {
          setConcatenationStatus(statusResponse);
          
          if (statusResponse?.concatenated_video_status === 'completed' && statusResponse?.video_url) {
            setConcatenatedVideoUrl(statusResponse.video_url);
          }
          
          if (statusResponse?.concatenated_video_status === 'processing') {
            setIsConcatenating(true);
          }
        }
      } catch (error) {
        // Silently fail - the job might not have a concatenation status yet
        console.log('No concatenation status available yet');
      }
    };
    
    if (id) {
      checkInitialConcatenationStatus();
    }
  }, [id]);
  
  // Handle opening regenerate modal
  const handleOpenRegenerateModal = (item: CreatedContent) => {
    setSelectedContent(item);
    setIsRegenerateModalOpen(true);
  };
  
  // Handle regenerate submission
  const handleRegenerateSubmit = async (query: string) => {
    if (!selectedContent) return;
    
    try {
      // Mark this content as regenerating
      setIsRegenerating(prev => ({ ...prev, [selectedContent.id]: true }));
      
      // Call the API
      await regenerateContent({
        content_id: selectedContent.id,
        job_id: selectedContent.job_id || id, // Fallback to job id if content job_id is null
        query
      });
      
      // Show success message
      toast.success('Content regeneration started! It may take a moment to complete.');
      
      // Close the modal
      setIsRegenerateModalOpen(false);
      
      // Refresh the page after a delay to show the new content
      setTimeout(() => {
        window.location.reload();
      }, 3000);
      
    } catch (error) {
      console.error('Failed to regenerate content:', error);
      toast.error('Failed to regenerate content. Please try again.');
    } finally {
      // Unmark this content as regenerating
      setIsRegenerating(prev => ({ ...prev, [selectedContent.id]: false }));
    }
  };
  
  // Handle start video concatenation
  const handleStartConcatenation = async () => {
    // Only allow concatenation for completed jobs with videos or images
    if (status !== JobStatus.COMPLETED || !sortedContent.length) {
      toast.error('Cannot concatenate videos for this job. Ensure the job is completed and has content.');
      return;
    }
    
    setIsConcatenating(true);
    
    try {
      const response = await concatenateJobVideos(id);
      toast.success('Video concatenation started! This may take a few minutes. Click "Refresh Status" to check progress.');
      
      // Initialize the status with response data if available, or with defaults
      setConcatenationStatus(response || {
        job_id: id,
        concatenated_video_status: 'processing',
        video_segments_processed: 0,
        segments: sortedContent.length,
        message: 'Processing started'
      });
      
      // Automatically check status once after a short delay
      setTimeout(async () => {
        try {
          const statusResponse = await getConcatenationStatus(id);
          if (statusResponse) {
            setConcatenationStatus(statusResponse);
          }
        } catch (error) {
          console.error('Error fetching initial concatenation status:', error);
        }
      }, 2000);
      
    } catch (error) {
      console.error('Failed to start video concatenation:', error);
      toast.error('Failed to start video concatenation. Please try again.');
      setIsConcatenating(false);
    }
  };
  
  // Handle download video
  const handleDownloadVideo = async () => {
    try {
      if (!video_url) {
        toast.error('No video URL available for download');
        return;
      }
      
      // Prepare request data - backend expects just file_path
      const downloadData = {
        file_path: video_url
      };
      
      // Send request to download API
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}api/download/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(downloadData)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download video: ${response.status} ${response.statusText}`);
      }
      
      // Create blob from response
      const blob = await response.blob();
      
      // Create download link
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = `job-${id}-video.mp4`;
      
      // Append to body, click and remove
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      window.URL.revokeObjectURL(downloadUrl);
      
      toast.success('Video download started!');
    } catch (error) {
      console.error('Failed to download video:', error);
      toast.error('Failed to download video. Please try again.');
    }
  };
  
  return (
    <div className="container mx-auto px-4 py-6">
      <div className="mb-6">
        <Link href="/jobs" className="flex items-center text-blue-600 hover:text-blue-800">
          <FiArrowLeft className="mr-2" />
          Back to Jobs
        </Link>
      </div>
      
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex justify-between items-start mb-4">
          <h1 className="text-2xl font-semibold text-gray-800">Job Details</h1>
          <div className="flex items-center space-x-3">
            <div className="flex items-center px-3 py-1 rounded-full bg-gray-100">
              {getStatusIcon(status)}
              <span className="ml-2 text-sm font-medium text-gray-700">{getStatusText(status)}</span>
            </div>
            
            {!concatenatedVideoUrl && !isConcatenating && status === JobStatus.COMPLETED && (
              <button
                onClick={handleStartConcatenation}
                disabled={isConcatenating}
                className="flex items-center px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 transition-colors disabled:bg-purple-400 text-sm"
              >
                <FiLink className="mr-2" />
                Concatenate Videos
              </button>
            )}
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="text-sm text-gray-500 mb-1">ID</div>
            <div className="font-mono text-sm bg-gray-100 p-2 rounded text-gray-700">{id}</div>
          </div>
          
          <div>
            <div className="text-sm text-gray-500 mb-1">Created At</div>
            <div className="flex items-center text-gray-700">
              <FiCalendar className="mr-2 text-gray-400" />
              {formatDate(created_at)}
            </div>
          </div>
          
          <div>
            <div className="text-sm text-gray-500 mb-1">Mode</div>
            <div className="capitalize text-gray-700">{mode || 'Unknown'}</div>
          </div>
          
          <div>
            <div className="text-sm text-gray-500 mb-1">Status</div>
            <div className="flex items-center">
              {getStatusIcon(status)}
              <span className="ml-2 text-gray-700">
                {getStatusText(status)}
              </span>
            </div>
          </div>
          
          {segment_count !== null && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Total Segments</div>
              <div className="text-gray-700">{segment_count}</div>
            </div>
          )}
          
          {concatenated_video_status !== null && (
            <div>
              <div className="text-sm text-gray-500 mb-1">Video Status</div>
              <div className="flex items-center">
                {getStatusIcon(concatenated_video_status)}
                <span className="ml-2 text-gray-700">
                  {getConcatenationStatusText(concatenated_video_status)}
                </span>
              </div>
              {concatenated_video_status === JobStatus.COMPLETED && video_url && (
                <div className="mt-2 flex space-x-2">
                  <button
                    onClick={handleDownloadVideo}
                    className="flex items-center px-3 py-1 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                  >
                    <FiDownload className="mr-1" />
                    Download Video
                  </button>
                </div>
              )}
            </div>
          )}
          
          {error && (
            <div className="col-span-2">
              <div className="text-sm text-gray-500 mb-1">Error</div>
              <div className="text-red-600 bg-red-50 p-3 rounded border border-red-200">
                {error}
              </div>
            </div>
          )}
          
          {segment_count !== null && processed_segment_count !== null && (
            <div className="col-span-2">
              <div className="flex justify-between items-center text-sm text-gray-700 mb-1">
                <span>Content Generation</span>
                <span className="font-medium">{processed_segment_count} / {segment_count} segments</span>
              </div>
              <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                <div 
                  className={`h-2 ${progressBarColor} rounded-full transition-all duration-500 ease-in-out`} 
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Video Concatenation Progress/Status Section (conditionally shown) */}
      {(isConcatenating || concatenationStatus) && (
        <div className="mt-6 border-t pt-4">
          <h3 className="text-lg font-medium text-gray-800 mb-3">Video Creation</h3>
          
          {isConcatenating || concatenationStatus?.concatenated_video_status === 'processing' ? (
            <div>
              <div className="flex items-center mb-3">
                <FiLoader className="w-5 h-5 text-blue-500 animate-spin mr-2" />
                <span className="text-gray-700">Creating video from content...</span>
              </div>
              
              {concatenationStatus?.video_segments_processed !== undefined && concatenationStatus?.segments !== undefined && (
                <div className="mb-4">
                  <div className="flex justify-between items-center text-sm text-gray-700 mb-1">
                    <span>Concatenation Progress</span>
                    <span className="font-medium">{concatenationStatus.video_segments_processed} / {concatenationStatus.segments} segments</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-2 ${concatenationBarColor} rounded-full transition-all duration-500 ease-in-out`} 
                      style={{ width: `${concatenationProgress}%` }}
                    ></div>
                  </div>
                </div>
              )}
              
              <button
                onClick={async () => {
                  try {
                    const statusResponse = await getConcatenationStatus(id);
                    setConcatenationStatus(statusResponse);
                    
                    if (statusResponse?.concatenated_video_status === 'completed' && statusResponse?.video_url) {
                      setConcatenatedVideoUrl(statusResponse.video_url);
                      setIsConcatenating(false);
                    }
                    
                    if (statusResponse?.concatenated_video_status === 'failed') {
                      setIsConcatenating(false);
                    }
                    
                    toast.success("Status refreshed");
                  } catch (error) {
                    console.error('Error fetching concatenation status:', error);
                    toast.error("Failed to refresh status");
                  }
                }}
                className="flex items-center px-3 py-1 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors text-sm"
              >
                <FiRefreshCw className="mr-2" />
                Refresh Status
              </button>
            </div>
          ) : concatenationStatus?.concatenated_video_status === 'completed' && concatenatedVideoUrl ? (
            <div>
              <div className="text-green-600 mb-4 font-medium flex items-center">
                <FiCheck className="mr-2" />
                <span>Video created successfully!</span>
              </div>
              
              <div className="aspect-w-16 aspect-h-9 rounded-lg overflow-hidden bg-gray-100 mb-4">
                <video
                  src={concatenatedVideoUrl || undefined}
                  controls
                  className="w-full h-full object-contain"
                  poster={content[0]?.thumbnail || undefined}
                />
              </div>
              
              <div className="flex justify-end space-x-3">
                <a
                  href={concatenatedVideoUrl}
                  download
                  className="flex items-center px-3 py-1.5 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700 transition-colors"
                >
                  <FiDownload className="mr-2" />
                  Direct Download
                </a>
                <button
                  onClick={handleDownloadVideo}
                  className="flex items-center px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
                >
                  <FiDownload className="mr-2" />
                  Download via API
                </button>
              </div>
            </div>
          ) : concatenationStatus?.concatenated_video_status === 'failed' ? (
            <div className="text-red-600 bg-red-50 p-3 rounded border border-red-200">
              <div className="flex items-center font-medium mb-1">
                <FiAlertCircle className="mr-2" />
                <span>Video creation failed</span>
              </div>
              <div className="text-sm">
                {concatenationStatus?.message || 'Failed to create video. Please try again.'}
              </div>
              <div className="flex space-x-3 mt-3">
                <button
                  onClick={handleStartConcatenation}
                  className="flex items-center px-3 py-1 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
                >
                  <FiRefreshCw className="mr-1" />
                  Try Again
                </button>
                <button
                  onClick={async () => {
                    try {
                      const statusResponse = await getConcatenationStatus(id);
                      setConcatenationStatus(statusResponse);
                      
                      if (statusResponse?.concatenated_video_status === 'completed' && statusResponse?.video_url) {
                        setConcatenatedVideoUrl(statusResponse.video_url);
                        setIsConcatenating(false);
                      }
                      
                      toast.success("Status refreshed");
                    } catch (error) {
                      console.error('Error fetching concatenation status:', error);
                      toast.error("Failed to refresh status");
                    }
                  }}
                  className="flex items-center px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300 transition-colors"
                >
                  <FiRefreshCw className="mr-1" />
                  Refresh Status
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
      
      {sortedContent.length > 0 && (
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-800">Generated Content</h2>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {sortedContent.map((item, index) => (
              <div key={item.id} className="relative group">
                {item.supabase_url && (
                  <>
                    <div className="aspect-w-1 aspect-h-1 rounded-lg overflow-hidden bg-gray-100">
                      <div className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center z-10">
                        {index + 1}
                      </div>
                      
                      {/* Content Type Badge */}
                      {item.content_type && (
                        <div className={`absolute bottom-2 left-2 ${getContentTypeBadge(item.content_type).bgColor} text-white text-xs px-2 py-1 rounded-md flex items-center z-10`}>
                          {getContentTypeBadge(item.content_type).icon}
                          {getContentTypeBadge(item.content_type).text}
                        </div>
                      )}
                      
                      <Image
                        src={item.thumbnail || item.supabase_url}
                        alt={`Content ${item.id}`}
                        width={300}
                        height={300}
                        className="object-cover w-full h-full"
                      />
                      
                      {/* Regenerate Button */}
                      <button
                        onClick={() => handleOpenRegenerateModal(item)}
                        disabled={isRegenerating[item.id]}
                        className="absolute top-2 right-2 bg-white p-2 rounded-full shadow-md hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 z-10"
                        title="Regenerate content"
                      >
                        {isRegenerating[item.id] ? (
                          <FiLoader className="w-4 h-4 text-blue-500 animate-spin" />
                        ) : (
                          <FiRefreshCw className="w-4 h-4 text-blue-500" />
                        )}
                      </button>
                    </div>
                    
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-opacity flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <a 
                        href={item.supabase_url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="bg-white rounded-full p-2 hover:bg-gray-100"
                        title="Download"
                      >
                        <FiDownload className="text-gray-800" />
                      </a>
                    </div>
                    
                    <div className="mt-2 text-xs text-gray-500">
                      {formatDate(item.created_at)}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Regenerate Modal */}
      {selectedContent && (
        <RegenerateModal
          isOpen={isRegenerateModalOpen}
          onClose={() => setIsRegenerateModalOpen(false)}
          onSubmit={handleRegenerateSubmit}
          initialQuery=""
        />
      )}
    </div>
  );
};

export default JobDetail; 