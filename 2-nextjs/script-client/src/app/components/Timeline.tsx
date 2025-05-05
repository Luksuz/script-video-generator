'use client';

import { useState, useRef, useEffect } from 'react';
import { FiPlay, FiTrash2, FiClock, FiMove } from 'react-icons/fi';
import { ContentSequenceItem, VideoResult, ImageResult } from '../api/apiClient';

interface TimelineProps {
  sequence: ContentSequenceItem[];
  videos: VideoResult[];
  images: ImageResult[];
  onUpdateSequence: (newSequence: ContentSequenceItem[]) => void;
  onRemoveItem: (index: number) => void;
  onUpdateDuration: (index: number, newDuration: number) => void;
}

const Timeline: React.FC<TimelineProps> = ({
  sequence,
  videos,
  images,
  onUpdateSequence,
  onRemoveItem,
  onUpdateDuration,
}) => {
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [editingDurationIndex, setEditingDurationIndex] = useState<number | null>(null);
  const [newDuration, setNewDuration] = useState<string>('');
  const timelineRef = useRef<HTMLDivElement>(null);

  // Find the content for a sequence item
  const findContent = (item: ContentSequenceItem) => {
    if (item.type === 'video') {
      return videos.find(v => v.id === item.contentId || v.downloadUrl === item.contentId);
    } else {
      return images.find(i => i.url === item.contentId);
    }
  };

  // Get thumbnail for an item
  const getThumbnail = (item: ContentSequenceItem) => {
    const content = findContent(item);
    
    if (!content) {
      return 'https://via.placeholder.com/160x90?text=Not+Found';
    }
    
    if (item.type === 'video') {
      const video = content as VideoResult;
      return video.image || 'https://via.placeholder.com/160x90?text=No+Preview';
    } else {
      const image = content as ImageResult;
      return image.thumbnail || image.url || 'https://via.placeholder.com/160x90?text=No+Preview';
    }
  };

  // Handle drag start
  const handleDragStart = (index: number) => {
    setDraggingIndex(index);
  };

  // Handle drag over
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>, index: number) => {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) return;
    
    // Reorder sequence
    const newSequence = [...sequence];
    const itemToMove = newSequence[draggingIndex];
    newSequence.splice(draggingIndex, 1);
    newSequence.splice(index, 0, itemToMove);
    
    onUpdateSequence(newSequence);
    setDraggingIndex(index);
  };

  // Handle drag end
  const handleDragEnd = () => {
    setDraggingIndex(null);
  };

  // Handle duration edit
  const handleDurationEdit = (index: number) => {
    setEditingDurationIndex(index);
    setNewDuration(sequence[index].duration.toString());
  };

  // Save edited duration
  const handleSaveDuration = (index: number) => {
    const duration = parseFloat(newDuration);
    if (!isNaN(duration) && duration > 0) {
      onUpdateDuration(index, duration);
    }
    setEditingDurationIndex(null);
  };

  // Handle duration input key press
  const handleDurationKeyPress = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Enter') {
      handleSaveDuration(index);
    } else if (e.key === 'Escape') {
      setEditingDurationIndex(null);
    }
  };

  // Calculate total duration
  const totalDuration = sequence.reduce((sum, item) => sum + item.duration, 0);
  
  return (
    <div className="border rounded-lg p-4 bg-white shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800">Timeline</h3>
        <div className="text-sm text-gray-600">
          Total Duration: {totalDuration.toFixed(2)}s
        </div>
      </div>
      
      <div ref={timelineRef} className="space-y-2">
        {sequence.length === 0 ? (
          <div className="border-2 border-dashed p-4 text-center text-gray-500 rounded-lg">
            No content added yet. Select videos or images from the sections above.
          </div>
        ) : (
          sequence.map((item, index) => (
            <div
              key={index}
              draggable
              onDragStart={() => handleDragStart(index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`flex items-center border rounded-lg p-2 cursor-move ${
                draggingIndex === index ? 'border-blue-500 bg-blue-50' : ''
              }`}
            >
              <div className="flex-shrink-0 w-20 h-12 mr-3">
                <img
                  src={getThumbnail(item)}
                  alt={`Item ${index}`}
                  className="w-full h-full object-cover rounded"
                />
              </div>
              
              <div className="flex-grow">
                <div className="flex items-center text-sm">
                  <span className={`mr-2 px-1 rounded text-xs ${
                    item.type === 'video' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                  }`}>
                    {item.type.toUpperCase()}
                  </span>
                  <span className="text-gray-700 font-medium">Section {item.sectionIndex + 1}</span>
                </div>
                
                <div className="flex items-center mt-1">
                  <FiClock className="text-gray-500 mr-1" size={14} />
                  {editingDurationIndex === index ? (
                    <input
                      type="text"
                      value={newDuration}
                      onChange={(e) => setNewDuration(e.target.value)}
                      onBlur={() => handleSaveDuration(index)}
                      onKeyDown={(e) => handleDurationKeyPress(e, index)}
                      className="w-16 p-0.5 text-xs border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                      autoFocus
                    />
                  ) : (
                    <span
                      className="text-xs text-gray-600 cursor-pointer hover:text-blue-500"
                      onClick={() => handleDurationEdit(index)}
                    >
                      {item.duration.toFixed(2)}s
                    </span>
                  )}
                </div>
              </div>
              
              <div className="flex-shrink-0 ml-2">
                <button
                  onClick={() => onRemoveItem(index)}
                  className="p-1 text-red-500 hover:bg-red-100 rounded"
                  title="Remove from timeline"
                >
                  <FiTrash2 size={16} />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Timeline; 