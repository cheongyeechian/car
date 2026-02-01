-- Run this SQL in your Supabase SQL Editor to create the table

CREATE TABLE IF NOT EXISTS car_listings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  import_date TEXT NOT NULL,
  import_time TEXT NOT NULL,
  listing_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  variant TEXT NOT NULL,
  year INTEGER NOT NULL,
  price NUMERIC NOT NULL,
  mileage INTEGER NOT NULL,
  location TEXT NOT NULL,
  bid INTEGER DEFAULT 0,
  bidder INTEGER DEFAULT 0,
  has_bid BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Track imported files to prevent duplicate imports
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  file_hash TEXT NOT NULL UNIQUE,
  file_name TEXT,
  item_count INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional but recommended)
ALTER TABLE car_listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous users (adjust as needed)
CREATE POLICY "Allow all operations" ON car_listings
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations" ON import_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);
