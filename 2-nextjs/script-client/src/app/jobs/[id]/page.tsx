'use client';

import React, { useState, useEffect } from 'react';
import { getJobById, getContentByJobId, Job, CreatedContent } from '../../api/supabaseClient';
import JobDetail from '../../components/JobDetail';
import { useParams, useRouter } from 'next/navigation';
import { FiAlertCircle } from 'react-icons/fi';

export default function JobDetailPage() {
  const [job, setJob] = useState<Job | null>(null);
  const [content, setContent] = useState<CreatedContent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  const params = useParams();
  const router = useRouter();
  const jobId = params.id as string;
  
  useEffect(() => {
    const fetchJobDetails = async () => {
      setLoading(true);
      setError(null);
      
      try {
        // Fetch job details
        const jobData = await getJobById(jobId);
        if (!jobData) {
          setError('Job not found');
          setLoading(false);
          return;
        }
        
        setJob(jobData);
        
        // Fetch job content (images)
        const contentData = await getContentByJobId(jobId);
        setContent(contentData);
      } catch (err) {
        console.error('Error fetching job details:', err);
        setError('Failed to load job details. Please try again.');
      } finally {
        setLoading(false);
      }
    };
    
    if (jobId) {
      fetchJobDetails();
    }
  }, [jobId]);
  
  if (loading) {
    return (
      <div className="flex justify-center items-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    );
  }
  
  if (error || !job) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <div className="flex items-center">
            <FiAlertCircle className="mr-2" />
            <strong className="font-bold">Error:</strong>
            <span className="block sm:inline ml-1 text-red-700">
              {error || 'Job not found'}
            </span>
          </div>
          <div className="mt-4">
            <button
              onClick={() => router.push('/jobs')}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
            >
              Back to Jobs
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return <JobDetail job={job} content={content} />;
} 