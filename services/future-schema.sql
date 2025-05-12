-- Create restaurants table
CREATE TABLE IF NOT EXISTS restaurants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  location TEXT NOT NULL,
  address TEXT,
  phone_number TEXT,
  website TEXT,
  google_reviews TEXT,
  menu_url TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  twitter_url TEXT,
  linkedin_url TEXT,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  enriched_at TIMESTAMPTZ,
  dm_status TEXT DEFAULT 'pending_scrape',
  last_dm_attempted_at TIMESTAMPTZ,
  UNIQUE(name, location)
);

-- Create instagram_auth_cookies table
CREATE TABLE IF NOT EXISTS instagram_auth_cookies (
  id TEXT PRIMARY KEY,
  cookies_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create daily_dm_counts table
CREATE TABLE IF NOT EXISTS daily_dm_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL UNIQUE,
  count INTEGER NOT NULL DEFAULT 0
);