import { cleanEnv, str } from 'envalid'

export const env = cleanEnv(process.env, {
  SERP_API_KEY: str(),
  SUPABASE_URL: str(),
  SUPABASE_ANON_KEY: str(),
  INSTAGRAM_USERNAME: str(),
  INSTAGRAM_PASSWORD: str(),
})