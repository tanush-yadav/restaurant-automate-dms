import { createClient } from '@supabase/supabase-js';

// Define types
export interface Restaurant {
  id?: string;
  name: string;
  location: string;
  address?: string;
  phone_number?: string;
  website?: string;
  google_reviews?: string;
  menu_url?: string;
  instagram_url?: string;
  facebook_url?: string;
  twitter_url?: string;
  linkedin_url?: string;
  scraped_at?: Date;
  enriched_at?: Date;
  dm_status?: 'pending_scrape' | 'pending_enrichment' | 'pending_dm' | 'dm_sent' | 'dm_failed' | 'no_instagram';
  last_dm_attempted_at?: Date;
}

export interface InstagramCookies {
  id: string;
  cookies_json: any;
  updated_at?: Date;
}

export interface DailyDMCount {
  id: string;
  date: string;
  count: number;
}

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Restaurant operations
export async function upsertRestaurant(restaurant: Restaurant) {
  const { data, error } = await supabase
    .from('restaurants')
    .upsert({
      ...restaurant,
      scraped_at: new Date().toISOString(),
    }, {
      onConflict: 'name,location'
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getRestaurantsByLocation(location: string) {
  const { data, error } = await supabase
    .from('restaurants')
    .select('*')
    .eq('location', location);

  if (error) throw error;
  return data;
}

export async function updateRestaurantDMStatus(id: string, status: Restaurant['dm_status']) {
  const { data, error } = await supabase
    .from('restaurants')
    .update({
      dm_status: status,
      last_dm_attempted_at: new Date().toISOString()
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Instagram cookies operations
export async function saveInstagramCookies(cookies: any) {
  const { data, error } = await supabase
    .from('instagram_auth_cookies')
    .upsert({
      id: 'bot_session_cookies',
      cookies_json: cookies,
      updated_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getInstagramCookies() {
  const { data, error } = await supabase
    .from('instagram_auth_cookies')
    .select('*')
    .eq('id', 'bot_session_cookies')
    .single();

  if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
  return data;
}

// Daily DM count operations
export async function incrementDailyDMCount() {
  const today = new Date().toISOString().split('T')[0];

  // First try to get today's count
  const { data: existingCount } = await supabase
    .from('daily_dm_counts')
    .select('*')
    .eq('date', today)
    .single();

  if (existingCount) {
    // Update existing count
    const { data, error } = await supabase
      .from('daily_dm_counts')
      .update({ count: existingCount.count + 1 })
      .eq('date', today)
      .select()
      .single();

    if (error) throw error;
    return data;
  } else {
    // Create new count for today
    const { data, error } = await supabase
      .from('daily_dm_counts')
      .insert({ date: today, count: 1 })
      .select()
      .single();

    if (error) throw error;
    return data;
  }
}

export async function getDailyDMCount() {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('daily_dm_counts')
    .select('*')
    .eq('date', today)
    .single();

  if (error && error.code !== 'PGRST116') throw error; // Ignore not found error
  return data?.count || 0;
}