import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { Restaurant, saveInstagramCookies, upsertRestaurant } from './services/supabase.service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrateData() {
  try {
    // Load restaurants data
    const restaurantsPath = path.join(process.cwd(), 'output', 'restaurants.json');
    const restaurantsData = JSON.parse(fs.readFileSync(restaurantsPath, 'utf8'));

    // Load Instagram cookies
    const cookiesPath = path.join(process.cwd(), 'output', 'instagram_cookies.json');
    const cookiesData = JSON.parse(fs.readFileSync(cookiesPath, 'utf8'));

    // Load messaged restaurants
    const messagedPath = path.join(process.cwd(), 'output', 'messaged_restaurants.json');
    const messagedData = JSON.parse(fs.readFileSync(messagedPath, 'utf8'));

    // Migrate restaurants data
    console.log('Migrating restaurants data...');
    for (const [location, restaurants] of Object.entries(restaurantsData)) {
      for (const [name, restaurant] of Object.entries(restaurants as Record<string, any>)) {
        const restaurantData: Restaurant = {
          name,
          location,
          address: restaurant.address,
          phone_number: restaurant.phoneNumber,
          website: restaurant.website,
          google_reviews: restaurant.googleReviews,
          menu_url: restaurant.menu,
          instagram_url: restaurant.socialMedia?.instagram,
          facebook_url: restaurant.socialMedia?.facebook,
          twitter_url: restaurant.socialMedia?.twitter,
          linkedin_url: restaurant.socialMedia?.linkedin,
          dm_status: messagedData[name] ? 'dm_sent' : 'pending_dm'
        };

        await upsertRestaurant(restaurantData);
        console.log(`Migrated restaurant: ${name}`);
      }
    }

    // Migrate Instagram cookies
    console.log('Migrating Instagram cookies...');
    await saveInstagramCookies(cookiesData);

    console.log('Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
migrateData();