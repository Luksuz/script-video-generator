import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

console.log('supabaseUrl', supabaseUrl);
console.log('supabaseAnonKey', supabaseAnonKey);

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Job = {
  id: string;
  created_at: string;
  script_text: string | null;
  mode: string | null;
  video_url: string | null;
  status: number | null;
  segment_count: number | null;
  processed_segment_count: number | null;
  error: string | null;
  total_duration: number | null;
  video_segments_completed: number | null;
  concatenated_video_status: number | null;
};

export type CreatedContent = {
  id: string;
  created_at: string;
  supabase_url: string | null;
  job_id: string | null;
  content_type: string | null;
  thumbnail: string | null;
};

// Status codes
export enum JobStatus {
  PENDING = 1,
  PROCESSING = 2,
  COMPLETED = 3,
  FAILED = 4
}

// API functions
export const getJobs = async (): Promise<Job[]> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching jobs:', error);
    throw error;
  }
  
  return data || [];
};

export const getJobById = async (id: string): Promise<Job | null> => {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) {
    console.error(`Error fetching job ${id}:`, error);
    throw error;
  }
  
  return data;
};

export const getContentByJobId = async (jobId: string): Promise<CreatedContent[]> => {
  const { data, error } = await supabase
    .from('created_content')
    .select('*')
    .eq('job_id', jobId)
    .order('created_at', { ascending: true });
  
  if (error) {
    console.error(`Error fetching content for job ${jobId}:`, error);
    throw error;
  }
  
  return data || [];
}; 