'use client';

import React, { useState, useRef } from 'react';
import { FiUpload, FiFile, FiCheckCircle, FiAlertCircle } from 'react-icons/fi';

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  isLoading?: boolean;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onFileSelect,
  accept = '.txt,.docx,.pdf',
  maxSizeMB = 10,
  label = 'Upload your script',
  isLoading = false,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      validateAndSetFile(selectedFile);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);

    // Check file size
    if (selectedFile.size > maxSizeBytes) {
      setError(`File size exceeds ${maxSizeMB}MB limit`);
      return;
    }

    // Check file type
    const fileType = selectedFile.name.split('.').pop()?.toLowerCase() || '';
    const acceptableTypes = accept.split(',').map(type => 
      type.trim().replace('.', '').toLowerCase()
    );
    
    if (!acceptableTypes.includes(fileType)) {
      setError(`Invalid file type. Acceptable types: ${accept}`);
      return;
    }

    setFile(selectedFile);
    onFileSelect(selectedFile);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleClick = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all
          ${isDragOver ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'} 
          ${error ? 'border-red-500 bg-red-50' : ''}
          ${file ? 'border-green-500 bg-green-50' : ''}
          ${isLoading ? 'opacity-50 pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={handleClick}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept={accept}
          disabled={isLoading}
        />

        <div className="flex flex-col items-center justify-center space-y-2">
          {file ? (
            <>
              <FiCheckCircle className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium text-gray-700">{file.name}</p>
              <p className="text-xs text-gray-500">
                {(file.size / (1024 * 1024)).toFixed(2)} MB
              </p>
            </>
          ) : error ? (
            <>
              <FiAlertCircle className="w-10 h-10 text-red-500" />
              <p className="text-sm font-medium text-red-700">{error}</p>
              <p className="text-xs text-gray-500">Please try again with a valid file</p>
            </>
          ) : (
            <>
              <FiUpload className="w-10 h-10 text-gray-400" />
              <p className="text-sm font-medium text-gray-700">{label}</p>
              <p className="text-xs text-gray-500">
                Drag & drop your file here or click to browse
              </p>
              <p className="text-xs text-gray-400">
                Supported formats: {accept} (Max: {maxSizeMB}MB)
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FileUpload; 