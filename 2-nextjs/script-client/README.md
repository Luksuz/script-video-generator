# Script Video Generator Client

A Next.js application that helps you generate videos from scripts using various media sources.

## Features

- Upload and process text scripts
- Generate content with videos, images, or AI-generated images
- Customize content generation settings
- Create video sequences with a timeline editor
- View and manage your content generation jobs
- Display AI-generated images from processed jobs

## Getting Started

### Prerequisites

- Node.js 18.17 or later
- A Supabase account with the following tables:
  - `jobs`: Stores job information
  - `created_content`: Stores content generated for jobs

### Installation

1. Clone the repository:

```bash
git clone <repository-url>
cd script-client
```

2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Create a `.env.local` file in the root directory with the following:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Replace `your_supabase_url` and `your_supabase_anon_key` with your actual Supabase credentials.

### Database Schema

The application uses the following database schema:

```sql
-- Jobs table
create table public.jobs (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  script_text text null,
  mode text null,
  video_url text null,
  status smallint null,
  segment_count integer null,
  processed_segment_count integer null,
  error text null,
  constraint jobs_pkey primary key (id)
);

-- Content table
create table public.created_content (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  supabase_url text null,
  job_id uuid null,
  content_type text null,
  constraint created_content_pkey primary key (id),
  constraint created_content_job_id_fkey foreign key (job_id) references jobs(id)
);
```

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Usage

1. **Home Page**: Upload scripts and configure content generation settings
2. **Jobs Page**: View all your content generation jobs
3. **Job Detail Page**: View job details and generated content (images)

## Status Codes

The application uses the following status codes for jobs:

- `1`: Pending
- `2`: Processing
- `3`: Completed
- `4`: Failed

## License

This project is licensed under the MIT License.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
