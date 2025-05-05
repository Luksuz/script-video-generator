'use client';

import { useState } from 'react';
import VideoPreview from './VideoPreview';
import ContentLibrary, { ContentItem } from './ContentLibrary';

interface ContentSelectorProps {
  items: ContentItem[];
  onSelect: (items: ContentItem[]) => void;
  maxSelections?: number;
  initialSelectedIds?: string[];
}

const ContentSelector: React.FC<ContentSelectorProps> = ({
  items,
  onSelect,
  maxSelections = Infinity,
  initialSelectedIds = [],
}) => {
  // State for selected items and current preview
  const [selectedItems, setSelectedItems] = useState<ContentItem[]>(
    initialSelectedIds.length 
      ? items.filter(item => initialSelectedIds.includes(item.id))
      : []
  );
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(
    selectedItems.length ? selectedItems[0] : null
  );

  // Handler for selecting/deselecting an item
  const handleSelectItem = (item: ContentItem) => {
    const isAlreadySelected = selectedItems.some(selected => selected.id === item.id);
    
    let newSelectedItems: ContentItem[];
    
    if (isAlreadySelected) {
      // Remove item if already selected
      newSelectedItems = selectedItems.filter(selected => selected.id !== item.id);
    } else {
      // Add item if not at max selections
      if (selectedItems.length >= maxSelections) {
        // If at max, replace the oldest selection
        newSelectedItems = [...selectedItems.slice(1), item];
      } else {
        // Otherwise just add
        newSelectedItems = [...selectedItems, item];
      }
    }
    
    // Update selected items
    setSelectedItems(newSelectedItems);
    
    // Update preview if current preview was removed
    if (isAlreadySelected && previewItem?.id === item.id) {
      setPreviewItem(newSelectedItems.length ? newSelectedItems[0] : null);
    } else if (!isAlreadySelected && !previewItem) {
      setPreviewItem(item);
    }
    
    // Call parent's onSelect handler
    onSelect(newSelectedItems);
  };

  // Handle setting the preview item
  const handleSetPreview = (item: ContentItem) => {
    setPreviewItem(item);
  };

  return (
    <div className="flex flex-col space-y-6">
      {/* Preview section */}
      {previewItem && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <h2 className="text-xl font-semibold mb-3">Preview</h2>
          
          <VideoPreview
            src={previewItem.src}
            type={previewItem.type === 'image' ? 'image' : 'video'}
            title={previewItem.title}
            duration={previewItem.duration}
          />
        </div>
      )}
      
      {/* Selected items (if there are multiple) */}
      {selectedItems.length > 1 && (
        <div className="bg-white rounded-lg shadow-md p-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-xl font-semibold">Selected Content</h2>
            <span className="text-sm text-gray-500">
              {selectedItems.length} {selectedItems.length === 1 ? 'item' : 'items'} selected
              {maxSelections !== Infinity && ` (max: ${maxSelections})`}
            </span>
          </div>
          
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {selectedItems.map(item => (
              <div 
                key={item.id}
                className={`relative border rounded-lg overflow-hidden cursor-pointer ${
                  previewItem?.id === item.id ? 'ring-2 ring-blue-500' : ''
                }`}
                onClick={() => handleSetPreview(item)}
              >
                {/* Thumbnail */}
                <div className="bg-gray-100 aspect-video">
                  {item.thumbnail ? (
                    <img 
                      src={item.thumbnail} 
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-200">
                      {item.type === 'video' && (
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      )}
                      
                      {item.type === 'image' && (
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      )}
                      
                      {item.type === 'other' && (
                        <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      )}
                    </div>
                  )}
                  
                  {/* Remove button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectItem(item);
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full hover:bg-red-600 transition-colors"
                    aria-label="Remove item"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                
                {/* Item title */}
                <div className="p-2">
                  <p className="text-xs truncate">{item.title}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Content library for selection */}
      <ContentLibrary
        items={items}
        onSelectItem={handleSelectItem}
        onSetPreview={handleSetPreview}
        selectedIds={selectedItems.map(item => item.id)}
        maxSelections={maxSelections}
      />
    </div>
  );
};

export default ContentSelector; 