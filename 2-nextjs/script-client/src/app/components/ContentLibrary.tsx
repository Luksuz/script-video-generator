'use client';

import { useState } from 'react';
import { FiVideo, FiImage, FiFile, FiCheckCircle, FiPlay } from 'react-icons/fi';

export interface ContentItem {
  id: string;
  title: string;
  type: 'video' | 'image' | 'other';
  src: string;
  duration?: number;
  thumbnail?: string;
  selected?: boolean;
}

interface ContentLibraryProps {
  items: ContentItem[];
  onSelectItem: (item: ContentItem) => void;
  onSetPreview: (item: ContentItem) => void;
  selectedIds: string[];
  maxSelections?: number;
}

const ContentLibrary: React.FC<ContentLibraryProps> = ({
  items,
  onSelectItem,
  onSetPreview,
  selectedIds,
  maxSelections = Infinity
}) => {
  const [filter, setFilter] = useState<'all' | 'video' | 'image' | 'other'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Filter items based on type and search term
  const filteredItems = items.filter(item => {
    // Filter by type
    if (filter !== 'all' && item.type !== filter) return false;
    
    // Filter by search term
    if (searchTerm && !item.title.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    
    return true;
  });

  // Determine if an item can be selected
  const canSelect = (item: ContentItem) => {
    const isSelected = selectedIds.includes(item.id);
    return isSelected || selectedIds.length < maxSelections;
  };

  // Get icon based on content type
  const getIcon = (type: string) => {
    switch (type) {
      case 'video':
        return <FiVideo className="mr-2" />;
      case 'image':
        return <FiImage className="mr-2" />;
      default:
        return <FiFile className="mr-2" />;
    }
  };

  return (
    <div className="w-full bg-white rounded-lg shadow">
      {/* Filters and search */}
      <div className="p-4 border-b">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex space-x-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === 'all'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('video')}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === 'video'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Videos
            </button>
            <button
              onClick={() => setFilter('image')}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === 'image'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Images
            </button>
            <button
              onClick={() => setFilter('other')}
              className={`px-3 py-1 text-sm rounded-full ${
                filter === 'other'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Other
            </button>
          </div>
          <div className="relative">
            <input
              type="text"
              placeholder="Search content..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full md:w-64 pl-3 pr-10 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content grid */}
      <div className="p-4">
        {filteredItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-gray-500">
            <p className="mb-2">No items found</p>
            <p className="text-sm">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filteredItems.map((item) => {
              const isSelected = selectedIds.includes(item.id);
              const selectable = canSelect(item);
              
              return (
                <div
                  key={item.id}
                  className={`relative rounded-lg overflow-hidden border group transition-all ${
                    isSelected ? 'border-blue-500 shadow-md' : 'border-gray-200 hover:border-gray-300'
                  } ${!selectable && !isSelected ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  {/* Thumbnail */}
                  <div 
                    className="aspect-video bg-gray-100"
                    onClick={() => selectable && onSetPreview(item)}
                  >
                    <img
                      src={item.thumbnail || item.src}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black bg-opacity-40">
                        <FiPlay className="text-white text-3xl" />
                      </div>
                    )}
                  </div>
                  
                  {/* Info */}
                  <div className="p-2 bg-white">
                    <div className="flex items-start justify-between">
                      <h3 className="text-sm font-medium truncate" title={item.title}>
                        {getIcon(item.type)}
                        {item.title}
                      </h3>
                      <button
                        onClick={() => selectable && onSelectItem(item)}
                        disabled={!selectable && !isSelected}
                        className={`ml-2 flex-shrink-0 ${
                          !selectable && !isSelected ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                      >
                        <FiCheckCircle
                          className={`text-lg ${
                            isSelected ? 'text-blue-500 fill-blue-500' : 'text-gray-300'
                          }`}
                        />
                      </button>
                    </div>
                    
                    {item.duration && (
                      <div className="mt-1 text-xs text-gray-500">
                        Duration: {Math.floor(item.duration / 60)}:
                        {String(Math.floor(item.duration % 60)).padStart(2, '0')}
                      </div>
                    )}
                  </div>
                  
                  {/* Selection indicator */}
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold">
                      {selectedIds.indexOf(item.id) + 1}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Selection counter */}
      <div className="p-4 border-t">
        <div className="text-sm text-gray-600">
          {selectedIds.length > 0 ? (
            <>
              Selected: <span className="font-medium">{selectedIds.length}</span>
              {maxSelections !== Infinity && (
                <> of <span className="font-medium">{maxSelections}</span></>
              )}
            </>
          ) : (
            <>
              Select {maxSelections !== Infinity ? `up to ${maxSelections} items` : 'items'}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ContentLibrary; 