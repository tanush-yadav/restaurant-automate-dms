import 'dotenv/config';
import * as fs from 'fs';
import fetch from 'node-fetch';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Define ES module equivalent for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ANSI color codes for better logging
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m'
};

// Define Restaurant interface (same as in scrape-restaurants.ts)
interface Restaurant {
  name: string;
  address?: string;
  phoneNumber?: string;
  website?: string;
  googleReviews?: string;
  menu?: string;
  socialMedia?: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  };
}

// Define the structure of our restaurant data
interface LocationData {
  [location: string]: {
    [restaurantName: string]: Restaurant;
  };
}

// Load environment variables
const { HYPERBROWSER_API_KEY, SERPAPI_KEY } = process.env as Record<string, string>;

// Check required environment variables
if (!HYPERBROWSER_API_KEY) {
  console.error('Error: HYPERBROWSER_API_KEY is required in .env file');
  process.exit(1);
}

if (!SERPAPI_KEY) {
  console.error('Error: SERPAPI_KEY is required in .env file');
  process.exit(1);
}

// More human-like delay with normal distribution (same as in scrape-restaurants.ts)
function humanDelay(min = 1000, max = 3000): Promise<void> {
  // Box-Muller transform for normal distribution
  const u = 1 - Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);

  // Scale to our range
  const range = max - min;
  const normalized = Math.min(Math.max((z + 3) / 6, 0), 1); // Map to 0-1 range
  const delay = Math.floor(normalized * range + min);

  return new Promise(r => setTimeout(r, delay));
}

// Function to load the JSON data from file
function loadRestaurantData(): LocationData {
  const outputPath = path.join(process.cwd(), 'output', 'restaurants.json');
  if (!fs.existsSync(outputPath)) {
    console.error(`${colors.red}Error: ${outputPath} does not exist${colors.reset}`);
    process.exit(1);
  }

  try {
    const data = fs.readFileSync(outputPath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`${colors.red}Error reading JSON file: ${error}${colors.reset}`);
    process.exit(1);
  }
}

// Function to save the enriched JSON data
function saveEnrichedData(data: LocationData): void {
  const outputPath = path.join(process.cwd(), 'output', 'restaurants.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`${colors.green}Enriched data saved to ${outputPath}${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error saving JSON file: ${error}${colors.reset}`);
  }
}

// Function to search for social media links using SerpAPI
async function findSocialMediaLinks(restaurant: Restaurant): Promise<{
  facebook?: string;
  instagram?: string;
  twitter?: string;
  linkedin?: string;
}> {
  const socialMedia: {
    facebook?: string;
    instagram?: string;
    twitter?: string;
    linkedin?: string;
  } = { ...restaurant.socialMedia };

  // Skip if we already have Instagram
  if (socialMedia.instagram) {
    console.log(`${colors.yellow}Instagram already found for ${restaurant.name}, skipping...${colors.reset}`);
    return socialMedia;
  }

  console.log(`${colors.cyan}Searching for Instagram of ${colors.bright}${restaurant.name}${colors.reset}`);

  try {
    // Prepare SerpAPI URL
    const query = encodeURIComponent(`${restaurant.name} instagram`);
    const apiUrl = `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${SERPAPI_KEY}`;

    // Make API request
    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`SerpAPI request failed with status ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as any;
    console.log(`${colors.yellow}SerpAPI response received${colors.reset}`);

    // Extract Instagram links from organic results
    const instagramRegex = /instagram\.com\/([a-zA-Z0-9._]+)/;
    let instagramUrl = null;

    // Check organic results first
    if (data.organic_results && data.organic_results.length > 0) {
      for (const result of data.organic_results) {
        // Check link
        if (result.link && instagramRegex.test(result.link)) {
          instagramUrl = result.link;
          break;
        }

        // Check snippet
        if (result.snippet && instagramRegex.test(result.snippet)) {
          const match = result.snippet.match(instagramRegex);
          if (match && match[0]) {
            instagramUrl = `https://${match[0]}`;
            break;
          }
        }
      }
    }

    // Check knowledge graph if available
    if (!instagramUrl && data.knowledge_graph && data.knowledge_graph.social_profiles) {
      const instagramProfile = data.knowledge_graph.social_profiles.find(
        (profile: any) => profile.name === 'Instagram' || profile.link.includes('instagram.com')
      );
      if (instagramProfile) {
        instagramUrl = instagramProfile.link;
      }
    }

    // If found, update social media
    if (instagramUrl) {
      console.log(`${colors.green}Found Instagram: ${instagramUrl}${colors.reset}`);
      socialMedia.instagram = instagramUrl;
    } else {
      console.log(`${colors.yellow}No Instagram found for ${restaurant.name}${colors.reset}`);

      // Try a more direct search as fallback
      console.log(`${colors.yellow}Trying direct Instagram search for ${restaurant.name}${colors.reset}`);
      const directQuery = encodeURIComponent(`site:instagram.com ${restaurant.name}`);
      const fallbackUrl = `https://serpapi.com/search.json?engine=google&q=${directQuery}&api_key=${SERPAPI_KEY}`;

      const fallbackResponse = await fetch(fallbackUrl);
      if (fallbackResponse.ok) {
        const fallbackData = await fallbackResponse.json() as any;

        if (fallbackData.organic_results && fallbackData.organic_results.length > 0) {
          for (const result of fallbackData.organic_results) {
            if (result.link && instagramRegex.test(result.link)) {
              instagramUrl = result.link;
              console.log(`${colors.green}Found Instagram via direct search: ${instagramUrl}${colors.reset}`);
              socialMedia.instagram = instagramUrl;
              break;
            }
          }
        }
      }
    }

    // Rate limit delay to respect SerpAPI limits
    await humanDelay(2000, 4000);

  } catch (error) {
    console.error(`${colors.red}Error searching with SerpAPI: ${error}${colors.reset}`);
  }

  return socialMedia;
}

// Main execution
(async () => {
  console.log(`\n${colors.bgGreen}${colors.white} STARTING RESTAURANT DATA ENRICHMENT (INSTAGRAM ONLY) ${colors.reset}`);
  console.log(`Loading restaurant data...`);

  // Load the restaurant data
  const restaurantData = loadRestaurantData();
  console.log(`${colors.green}Loaded data for ${Object.keys(restaurantData).length} locations${colors.reset}`);

  // Process each location
  for (const location of Object.keys(restaurantData)) {
    console.log(`\n${colors.bgBlue}${colors.white} ENRICHING RESTAURANTS IN ${location.toUpperCase()} ${colors.reset}`);

    const restaurants = restaurantData[location];
    let enrichedCount = 0;

    // Process each restaurant
    for (const [restaurantName, restaurant] of Object.entries(restaurants)) {
      console.log(`\n${colors.bright}${colors.blue}Processing ${restaurantName}${colors.reset}`);

      let retryCount = 0;
      let socialMediaLinks = null;

      // Retry up to 3 times if we encounter errors
      while (retryCount < 3 && !socialMediaLinks) {
        try {
          if (retryCount > 0) {
            console.log(`${colors.yellow}Retry attempt ${retryCount} for ${restaurantName}${colors.reset}`);
          }

          // Find social media links using SerpAPI
          socialMediaLinks = await findSocialMediaLinks(restaurant);
        } catch (e) {
          console.error(`${colors.red}Error on attempt ${retryCount + 1}: ${e}${colors.reset}`);
          retryCount++;

          // Short delay before retrying
          await humanDelay(1000, 2000);
        }
      }

      // Update the restaurant data with the new social media links
      if (socialMediaLinks) {
        restaurant.socialMedia = socialMediaLinks;
        enrichedCount++;
      }

      // Save after each restaurant to avoid losing data
      saveEnrichedData(restaurantData);

      // Random delay between restaurants
      await humanDelay(2000, 5000);
    }

    console.log(`${colors.green}Enriched ${enrichedCount} restaurants in ${location}${colors.reset}`);

    // Delay between locations
    if (Object.keys(restaurantData).indexOf(location) < Object.keys(restaurantData).length - 1) {
      await humanDelay(5000, 10000);
    }
  }

  console.log(`\n${colors.bgGreen}${colors.white} DATA ENRICHMENT COMPLETED SUCCESSFULLY ${colors.reset}`);
})();