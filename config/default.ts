import { env } from './env'

export const appConfig = {
  serp: {
    apiKey: env.SERP_API_KEY,
  },
  supabase: {
    url: env.SUPABASE_URL,
    key: env.SUPABASE_ANON_KEY,
  },
  instagram: {
    username: env.INSTAGRAM_USERNAME,
    password: env.INSTAGRAM_PASSWORD,
  }
}
