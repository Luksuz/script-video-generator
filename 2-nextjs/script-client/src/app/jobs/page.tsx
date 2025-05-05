'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { FiPlus, FiRefreshCw, FiInbox } from 'react-icons/fi';
import { getJobs, Job } from '../api/supabaseClient';
import JobCard from '../components/JobCard';

export default function JobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const fetchJobs = async () => {
    setLoading(true);
    setError(null);
    try {
      const jobsData = await getJobs();
      setJobs(jobsData);
    } catch (err) {
      console.error('Error fetching jobs:', err);
      setError('Failed to load jobs. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleNewJob = () => {
    router.push('/');
  };

  const handleRefresh = () => {
    fetchJobs();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Your Jobs</h1>
        <div className="flex space-x-2">
          <button
            onClick={handleRefresh}
            className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <FiRefreshCw className="mr-2" />
            Refresh
          </button>
          <button
            onClick={handleNewJob}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            <FiPlus className="mr-2" />
            New Job
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      ) : error ? (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative">
          <strong className="font-bold">Error:</strong>
          <span className="block sm:inline text-red-700"> {error}</span>
        </div>
      ) : jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-500">
          <FiInbox className="text-5xl mb-4" />
          <p className="text-xl">No jobs found</p>
          <p className="mt-2">Create a new job to get started</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
} 