import * as fs from 'fs';
import { EventConfig, StepHandler } from 'motia';
import fetch from 'node-fetch';
import * as path from 'path';
import { z } from 'zod';

const inputSchema = z.object({
  location: z.string()
});

export const config: EventConfig<typeof inputSchema> = {
  type: 'event',
  name: 'EnrichLeads',
  description: 'Enriches restaurant data with social media information',
  subscribes: ['restaurants.scraped'],
  emits: [{
    topic: 'restaurants.enriched',
    label: 'Restaurants enriched'
  }],
  input: inputSchema,
  flows: ['restaurant-automation']
};

// File paths
const outputDir = path.resolve(process.cwd(), 'output');
const restaurantsJsonPath = path.join(outputDir, 'restaurants.json');

// Function to load restaurants from JSON file
function loadRestaurants(): Record<string, Record<string, any>> {
  try {
    if (fs.existsSync(restaurantsJsonPath)) {
      const jsonData = fs.readFileSync(restaurantsJsonPath, 'utf8');
      return JSON.parse(jsonData);
    }
  } catch (error) {
    console.error('Error loading restaurants.json:', error);
  }
  return {};
}

// Function to save restaurants to JSON file
function saveRestaurants(restaurants: Record<string, Record<string, any>>): void {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    fs.writeFileSync(restaurantsJsonPath, JSON.stringify(restaurants, null, 2));
  } catch (error) {
    console.error('Error saving restaurants.json:', error);
  }
}

interface Restaurant {
  name: string;
  location: string;
  address?: string;
  phoneNumber?: string;
  website?: string;
  googleReviews?: string;
  menu?: string;
  socialMedia?: {
    instagram?: string;
    facebook?: string;
    twitter?: string;
    linkedin?: string;
  };
}

async function findSocialMediaLinks(restaurant: Restaurant, logger: any): Promise<{
  instagram?: string;
  facebook?: string;
  twitter?: string;
  linkedin?: string;
}> {
  const socialMedia: Record<string, string> = {};
  const SERPAPI_KEY = process.env.SERPAPI_KEY;

  if (!SERPAPI_KEY) {
    logger.error('SERPAPI_KEY not found in environment variables');
    return socialMedia;
  }

  try {
    logger.info(`Searching social media for ${restaurant.name}`);
    const query = encodeURIComponent(`${restaurant.name} ${restaurant.location} instagram`);
    const apiUrl = `https://serpapi.com/search.json?engine=google&q=${query}&api_key=${SERPAPI_KEY}`;

    const response = await fetch(apiUrl);
    if (!response.ok) {
      throw new Error(`SerpAPI request failed with status ${response.status}`);
    }

    const data = await response.json() as any;
    const instagramRegex = /instagram\.com\/([a-zA-Z0-9._]+)/;

    // Check organic results
    if (data.organic_results?.length > 0) {
      for (const result of data.organic_results) {
        if (result.link?.match(instagramRegex)) {
          socialMedia.instagram = result.link;
          break;
        }
        if (result.snippet?.match(instagramRegex)) {
          const match = result.snippet.match(instagramRegex);
          if (match?.[0]) {
            socialMedia.instagram = `https://${match[0]}`;
            break;
          }
        }
      }
    }

    // Check knowledge graph
    if (!socialMedia.instagram && data.knowledge_graph?.social_profiles) {
      const instagramProfile = data.knowledge_graph.social_profiles.find(
        (profile: any) => profile.name === 'Instagram' || profile.link?.includes('instagram.com')
      );
      if (instagramProfile?.link) {
        socialMedia.instagram = instagramProfile.link;
      }
    }

    if (socialMedia.instagram) {
      logger.info(`Found Instagram: ${socialMedia.instagram}`);
    } else {
      logger.info(`No Instagram found for ${restaurant.name}`);
    }

    // Add delay to respect rate limits
    await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 2000));

  } catch (error) {
    logger.error('Error searching with SerpAPI:', error);
  }

  return socialMedia;
}

export const handler: StepHandler<typeof config> = async (input, { logger, emit }) => {
  logger.info('Starting lead enrichment', { location: input.location });

  try {
    // Load restaurants from JSON
    const allRestaurants = loadRestaurants();
    const locationKey = input.location.toLowerCase();
    const locationRestaurants = allRestaurants[locationKey] || {};

    // Find restaurants that need enrichment (no socialMedia property)
    const restaurantsToEnrich: Restaurant[] = [];
    for (const [name, restaurant] of Object.entries(locationRestaurants)) {
      if (!restaurant.socialMedia) {
        restaurantsToEnrich.push({
          name,
          location: input.location,
          ...restaurant
        });
      }
    }

    if (restaurantsToEnrich.length === 0) {
      logger.info('No restaurants need enrichment');
      await emit({
        topic: 'restaurants.enriched',
        data: {
          location: input.location,
          count: 0,
          message: 'No restaurants to enrich'
        }
      });
      return;
    }

    logger.info(`Found ${restaurantsToEnrich.length} restaurants to enrich`);
    let enrichedCount = 0;

    for (const restaurant of restaurantsToEnrich) {
      try {
        const socialMedia = await findSocialMediaLinks(restaurant, logger);

        // Update restaurant in JSON data
        allRestaurants[locationKey][restaurant.name].socialMedia = socialMedia;

        enrichedCount++;
        logger.info(`Enriched ${restaurant.name}`);
      } catch (error) {
        logger.error(`Error enriching ${restaurant.name}:`, error);
      }
    }

    // Save updated restaurants back to JSON file
    saveRestaurants(allRestaurants);

    await emit({
      topic: 'restaurants.enriched',
      data: {
        location: input.location,
        count: enrichedCount,
        message: `Successfully enriched ${enrichedCount} restaurants`
      }
    });

  } catch (error) {
    logger.error('Lead enrichment failed:', error);
    await emit({
      topic: 'restaurants.enriched',
      data: {
        location: input.location,
        error: String(error),
        count: 0
      }
    });
  }
};