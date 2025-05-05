'use client';

import { useState } from 'react';
import { FiEdit2, FiRefreshCw, FiTrash2, FiPlus, FiCheck, FiX } from 'react-icons/fi';
import { ContentSection, VideoResult, ImageResult, regenerateContent, ContentProvider } from '../api/apiClient';

interface ContentEditorProps {
  contentSections: ContentSection[];
  mode: 'videos' | 'images' | 'mixed';
  provider: ContentProvider;
  theme?: string;
  onUpdateContentSection: (index: number, updatedSection: ContentSection) => void;
  onSelectContent: (type: 'video' | 'image', content: VideoResult | ImageResult, sectionIndex: number) => void;
}

const ContentEditor: React.FC<ContentEditorProps> = ({
  contentSections,
  mode,
  provider,
  theme = '',
  onUpdateContentSection,
  onSelectContent,
}) => {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [customQuery, setCustomQuery] = useState('');
  const [regenerating, setRegenerating] = useState<number | null>(null);

  const handleEditClick = (index: number) => {
    setEditingIndex(index);
    setCustomQuery(contentSections[index].query);
  };

  const handleSaveEdit = async (index: number) => {
    setEditingIndex(null);
    setRegenerating(index);

    try {
      const response = await regenerateContent(index, customQuery, mode, {
        provider,
        theme,
        generateNewQuery: false,
        generateAiImages: false
      });

      // Update the content section with the regenerated content
      if (response.success) {
        onUpdateContentSection(index, {
          ...contentSections[index],
          query: response.query,
          videos: response.videos || [],
          images: response.images || [],
          aiImages: response.aiImage ? [response.aiImage] : []
        });
      }
    } catch (error) {
      console.error('Failed to regenerate content:', error);
    } finally {
      setRegenerating(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setCustomQuery('');
  };

  const handleRegenerateClick = async (index: number) => {
    setRegenerating(index);

    try {
      const response = await regenerateContent(index, contentSections[index].segment, mode, {
        provider,
        theme,
        generateNewQuery: true,
        generateAiImages: false
      });

      // Update the content section with the regenerated content
      if (response.success) {
        onUpdateContentSection(index, {
          ...contentSections[index],
          query: response.query,
          videos: response.videos || [],
          images: response.images || [],
          aiImages: response.aiImage ? [response.aiImage] : []
        });
      }
    } catch (error) {
      console.error('Failed to regenerate content:', error);
    } finally {
      setRegenerating(null);
    }
  };

  return (
    <div className="space-y-6">
      {contentSections.map((section, index) => (
        <div key={index} className="border rounded-lg p-4 bg-white shadow-sm">
          <div className="flex justify-between items-start mb-2">
            <h3 className="text-lg font-semibold text-gray-800">Section {index + 1}</h3>
            <div className="flex space-x-2">
              {editingIndex === index ? (
                <>
                  <button
                    onClick={() => handleSaveEdit(index)}
                    className="p-1 bg-green-500 text-white rounded hover:bg-green-600"
                    disabled={regenerating === index}
                  >
                    <FiCheck />
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    className="p-1 bg-red-500 text-white rounded hover:bg-red-600"
                    disabled={regenerating === index}
                  >
                    <FiX />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => handleEditClick(index)}
                    className="p-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                    disabled={regenerating === index}
                  >
                    <FiEdit2 />
                  </button>
                  <button
                    onClick={() => handleRegenerateClick(index)}
                    className="p-1 bg-purple-500 text-white rounded hover:bg-purple-600"
                    disabled={regenerating === index}
                  >
                    <FiRefreshCw className={regenerating === index ? 'animate-spin' : ''} />
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700">Segment Text:</p>
            <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{section.segment}</p>
          </div>

          <div className="mb-4">
            <p className="text-sm font-medium text-gray-700">Search Query:</p>
            {editingIndex === index ? (
              <input
                type="text"
                value={customQuery}
                onChange={(e) => setCustomQuery(e.target.value)}
                className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                placeholder="Enter custom search query"
              />
            ) : (
              <p className="text-sm text-gray-600 bg-gray-50 p-2 rounded">{section.query}</p>
            )}
          </div>

          {(mode === 'videos' || mode === 'mixed') && section.videos.length > 0 && (
            <div className="mb-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Videos:</p>
              <div className="grid grid-cols-3 gap-2">
                {section.videos.slice(0, 6).map((video, videoIndex) => (
                  <div
                    key={videoIndex}
                    className="relative cursor-pointer hover:opacity-80 transition-opacity rounded overflow-hidden"
                    onClick={() => onSelectContent('video', video, index)}
                  >
                    <img
                      src={video.image || 'https://via.placeholder.com/160x90?text=No+Preview'}
                      alt={`Video ${videoIndex}`}
                      className="w-full h-auto object-cover rounded"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 opacity-0 hover:opacity-100 transition-opacity">
                      <FiPlus className="text-white text-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {(mode === 'images' || mode === 'mixed') && section.images.length > 0 && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Images:</p>
              <div className="grid grid-cols-3 gap-2">
                {section.images.slice(0, 6).map((image, imageIndex) => (
                  <div
                    key={imageIndex}
                    className="relative cursor-pointer hover:opacity-80 transition-opacity rounded overflow-hidden"
                    onClick={() => onSelectContent('image', image, index)}
                  >
                    <img
                      src={image.thumbnail || image.url || 'https://via.placeholder.com/160x160?text=No+Preview'}
                      alt={`Image ${imageIndex}`}
                      className="w-full h-auto object-cover rounded"
                    />
                    {image.isAiGenerated && (
                      <div className="absolute top-1 right-1 bg-purple-500 text-white text-xs px-1 rounded">AI</div>
                    )}
                    <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 opacity-0 hover:opacity-100 transition-opacity">
                      <FiPlus className="text-white text-2xl" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ContentEditor; 