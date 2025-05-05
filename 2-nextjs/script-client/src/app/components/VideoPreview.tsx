'use client';

import { useRef, useState, useEffect } from 'react';
import { FiPlay, FiPause, FiVolume2, FiVolumeX } from 'react-icons/fi';

interface VideoPreviewProps {
  src: string;
  type: 'video' | 'image';
  title?: string;
  duration?: number;
}

const formatDuration = (seconds: number): string => {
  if (!seconds) return '0:00';
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60);
  
  return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
};

const VideoPreview: React.FC<VideoPreviewProps> = ({
  src,
  type,
  title,
  duration = 0
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [loading, setLoading] = useState(true);

  // Initialize video when src changes
  useEffect(() => {
    setLoading(true);
    setIsPlaying(false);
    setCurrentTime(0);
    
    if (type === 'video' && videoRef.current) {
      videoRef.current.currentTime = 0;
    }
  }, [src, type]);

  // Handle play/pause
  const togglePlay = () => {
    if (!videoRef.current) return;
    
    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    
    setIsPlaying(!isPlaying);
  };

  // Handle mute/unmute
  const toggleMute = () => {
    if (!videoRef.current) return;
    
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  // Update time display
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    setCurrentTime(videoRef.current.currentTime);
  };

  // Handle load complete
  const handleLoadedData = () => {
    setLoading(false);
  };

  return (
    <div className="w-full">
      <div className="relative bg-black rounded-lg overflow-hidden aspect-video">
        {/* Loading overlay */}
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50 z-10">
            <div className="w-8 h-8 border-4 border-gray-300 border-t-blue-500 rounded-full animate-spin"></div>
          </div>
        )}
        
        {type === 'video' ? (
          <video
            ref={videoRef}
            src={src}
            className="w-full h-full object-contain"
            onTimeUpdate={handleTimeUpdate}
            onLoadedData={handleLoadedData}
            onLoadStart={() => setLoading(true)}
            muted={isMuted}
            loop
          />
        ) : (
          <img
            src={src}
            alt={title || 'Preview image'}
            className="w-full h-full object-contain"
            onLoad={handleLoadedData}
          />
        )}
        
        {/* Video controls overlay */}
        {type === 'video' && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4">
            <div className="flex items-center justify-between">
              {/* Play/Pause button */}
              <button
                onClick={togglePlay}
                className="text-white hover:text-blue-400 transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <FiPause size={20} /> : <FiPlay size={20} />}
              </button>
              
              {/* Progress bar */}
              <div className="flex-1 mx-3">
                <div className="relative h-1 bg-gray-600 rounded-full">
                  <div
                    className="absolute h-full bg-blue-500 rounded-full"
                    style={{
                      width: `${
                        duration > 0 ? (currentTime / duration) * 100 : 0
                      }%`
                    }}
                  ></div>
                </div>
                <div className="flex justify-between text-xs text-gray-300 mt-1">
                  <span>{formatDuration(currentTime)}</span>
                  <span>{formatDuration(duration)}</span>
                </div>
              </div>
              
              {/* Mute button */}
              <button
                onClick={toggleMute}
                className="text-white hover:text-blue-400 transition-colors"
                aria-label={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <FiVolumeX size={20} /> : <FiVolume2 size={20} />}
              </button>
            </div>
          </div>
        )}
      </div>
      
      {/* Title display */}
      {title && (
        <h3 className="mt-2 text-sm font-medium text-gray-800 truncate">
          {title}
        </h3>
      )}
    </div>
  );
};

export default VideoPreview; 