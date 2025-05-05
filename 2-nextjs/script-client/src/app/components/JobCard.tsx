import React from 'react';
import Link from 'next/link';
import { FiClock, FiCheck, FiAlertCircle, FiLoader, FiFileText, FiImage, FiFilm, FiLayers } from 'react-icons/fi';
import { Job, JobStatus } from '../api/supabaseClient';

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

// Get mode icon based on job mode
const getModeIcon = (mode: string | null) => {
  switch (mode) {
    case 'videos':
      return <FiFilm className="text-purple-500" />;
    case 'images':
      return <FiImage className="text-blue-500" />;
    case 'ai_images':
      return <FiImage className="text-indigo-500" />;
    case 'mixed':
      return <FiLayers className="text-teal-500" />;
    default:
      return <FiFileText className="text-gray-500" />;
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

// Get progress bar color based on status and progress
const getProgressBarColor = (status: number | null, progress: number) => {
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

interface JobCardProps {
  job: Job;
}

const JobCard: React.FC<JobCardProps> = ({ job }) => {
  const { id, created_at, mode, status, segment_count, processed_segment_count } = job;
  
  // Calculate progress percentage
  const progress = segment_count && processed_segment_count !== null
    ? Math.round((processed_segment_count / segment_count) * 100) 
    : status === JobStatus.COMPLETED ? 100 : 0;
    
  const progressBarColor = getProgressBarColor(status, progress);
  
  return (
    <Link href={`/jobs/${id}`} className="block">
      <div className="bg-white rounded-lg shadow-md p-4 hover:shadow-lg transition-shadow duration-200">
        <div className="flex justify-between items-start mb-3">
          <div className="flex items-center">
            {getModeIcon(mode)}
            <span className="ml-2 font-medium capitalize text-gray-800">{mode || 'Unknown'}</span>
          </div>
          <div className="flex items-center">
            {getStatusIcon(status)}
            <span className="ml-2 text-sm text-gray-600">{getStatusText(status)}</span>
          </div>
        </div>
        
        <div className="text-xs text-gray-500 mb-3">
          Created: {formatDate(created_at)}
        </div>
        
        {segment_count !== null && (
          <div className="mt-2">
            <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div 
                className={`h-1.5 ${progressBarColor} rounded-full transition-all duration-500 ease-in-out`} 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="flex justify-between text-xs mt-1">
              <span className="text-gray-500">Progress</span>
              <span className="text-gray-600 font-medium">
                {processed_segment_count || 0} / {segment_count} ({progress}%)
              </span>
            </div>
          </div>
        )}
      </div>
    </Link>
  );
};

export default JobCard; 