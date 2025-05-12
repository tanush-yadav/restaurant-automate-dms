import { chromium, type Page } from '@playwright/test';
import * as fs from 'fs';
import { EventConfig, StepHandler } from 'motia';
import * as path from 'path';
import { z } from 'zod';

// Schema for input
const inputSchema = z.object({
  location: z.string(),
  maxRestaurants: z.number().default(30)
});

// Configuration for the step
export const config: EventConfig<typeof inputSchema> = {
  type: 'event',
  name: 'ScrapeRestaurants',
  description: 'Scrapes restaurant data from Google Maps for a given location',
  subscribes: ['restaurants.scrape.requested'],
  emits: [{
    topic: 'restaurants.scraped',
    label: 'Restaurants scraped'
  }],
  input: inputSchema,
  flows: ['restaurant-automation']
};

// Helper functions
interface Restaurant {
  name: string;
  address?: string;
  phoneNumber?: string;
  website?: string;
  googleReviews?: string;
  menu?: string;
}

// JSON file paths
const outputDir = path.resolve(process.cwd(), 'output');
const restaurantsJsonPath = path.join(outputDir, 'restaurants.json');
const messagedRestaurantsJsonPath = path.join(outputDir, 'messaged_restaurants.json');

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

// Function to get restaurants by location
function getRestaurantsByLocation(location: string): Record<string, any> {
  const allRestaurants = loadRestaurants();
  return allRestaurants[location.toLowerCase()] || {};
}

// Function to add a restaurant to the JSON file
function addRestaurant(restaurant: Restaurant, location: string): void {
  const allRestaurants = loadRestaurants();
  const locationKey = location.toLowerCase();

  if (!allRestaurants[locationKey]) {
    allRestaurants[locationKey] = {};
  }

  allRestaurants[locationKey][restaurant.name] = {
    ...restaurant
  };

  saveRestaurants(allRestaurants);
}

async function simpleDelay(duration: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, duration));
}

async function extractRestaurantDetails(page: Page, logger: any): Promise<Restaurant | null> {
  try {
    logger.info('Extracting restaurant details...');

    await page.waitForSelector('h1', { timeout: 10000 });
    await simpleDelay(1000 + Math.random() * 1000);

    const details = await page.evaluate(() => {
      const findContent = (selectors: string[]): string | undefined => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim();
            if (text && text !== 'Results') return text;
          }
        }
        return undefined;
      };

      const findHref = (selectors: string[]): string | undefined => {
        for (const selector of selectors) {
          const el = document.querySelector(selector) as HTMLAnchorElement;
          if (el && el.href && !el.href.startsWith('mailto:') && !el.href.startsWith('tel:')) {
            return el.href.startsWith('/') ? new URL(el.href, document.baseURI).href : el.href;
          }
        }
        return undefined;
      };

      let name = '';
      const nameElement = document.querySelector('h1.DUwDvf, h1.DUwDvf.lfPIob');
      if (nameElement) {
        name = nameElement.textContent?.trim() || '';
      }

      if (!name || name === 'Results') {
        const altNameElement = document.querySelector('div.fontHeadlineLarge, div[role="main"] h1');
        name = altNameElement?.textContent?.trim() || 'Unknown Restaurant';
      }

      name = name.replace(/\s+/g, ' ').trim();

      const address = findContent([
        'button[data-item-id="address"]',
        'button[aria-label*="Address"]',
        'div[data-tooltip*="address"] > div > div:nth-child(1)'
      ]);

      const phoneNumberText = findContent([
        'button[data-item-id^="phone:"]',
        'button[aria-label*="Phone"]',
        'a[href^="tel:"]'
      ]);
      const phoneNumber = phoneNumberText ? phoneNumberText.replace(/\s+/g, '') : undefined;

      const website = findHref([
        'a[data-item-id="authority"]',
        'a[aria-label*="website" i]',
        'a[href*="://"]:not([href*="google."]):not([href*="mailto:"]):not([href*="tel:"])'
      ]);

      let googleReviews = '';

      const reviewDiv = document.querySelector('div.F7nice');
      if (reviewDiv) {
        const ratingText = reviewDiv.querySelector('[aria-hidden="true"]')?.textContent?.trim();
        const reviewCountText = reviewDiv.querySelector('[aria-label*="reviews"]')?.textContent?.trim();

        if (ratingText && reviewCountText) {
          googleReviews = `${ratingText} stars, ${reviewCountText}`;
        }
      }

      if (!googleReviews) {
        const rating = document.querySelector('span.fontDisplayLarge, span.kvMYJc')?.textContent?.trim() || '';
        const reviewCount = document.querySelector('span.RDApEe')?.textContent?.trim() || '';
        if (rating && reviewCount) {
          googleReviews = `${rating} stars, ${reviewCount}`;
        }
      }

      const menu = findHref([
        'a[aria-label*="Menu" i]',
        'a[href*="menu"]',
        'button[aria-label*="Menu" i]'
      ]);

      return { name, address, phoneNumber, website, googleReviews, menu };
    });
    logger.info(JSON.stringify(details, null, 2));
    logger.info(`Found restaurant: ${details.name}`);
    return details;
  } catch (error) {
    logger.error('Error extracting restaurant details:', error);
    return null;
  }
}

async function searchRestaurants(page: Page, location: string, maxRestaurants: number, logger: any): Promise<Restaurant[]> {
  const restaurants: Restaurant[] = [];
  const searchQuery = `${location} restaurants`;

  try {
    logger.info('Navigating to Google Maps...');
    await page.goto('https://www.google.com/maps', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await simpleDelay(3000 + Math.random() * 2000);

    logger.info(`Entering search query: "${searchQuery}"`);
    await page.evaluate(() => {
      const input = document.querySelector('input[name="q"]') as HTMLInputElement;
      if (input) input.value = '';
    });

    await page.type('input[name="q"]', searchQuery, { delay: 20 + Math.random() * 100 });
    await simpleDelay(800 + Math.random() * 700);
    await page.keyboard.press('Enter');

    logger.info('Waiting for search results...');
    await simpleDelay(5000 + Math.random() * 3000);

    const restaurantListSelector = 'div[role="feed"] a.hfpxzc';
    await page.waitForSelector(restaurantListSelector, { timeout: 15000 });

    let processedCount = 0;
    let scrollAttempts = 0;
    const MAX_SCROLL_ATTEMPTS = 15;

    while (restaurants.length < maxRestaurants && scrollAttempts < MAX_SCROLL_ATTEMPTS) {
      const restaurantElements = await page.$$(restaurantListSelector);
      logger.info(`Found ${restaurantElements.length} restaurant elements`);

      for (let i = processedCount; i < restaurantElements.length && restaurants.length < maxRestaurants; i++) {
        try {
          await restaurantElements[i].click();
          await simpleDelay(4000 + Math.random() * 2000);

          const restaurant = await extractRestaurantDetails(page, logger);
          if (restaurant && restaurant.name !== 'Unknown Restaurant') {
            restaurants.push(restaurant);
            logger.info(`Added restaurant: ${restaurant.name}`);
          }

          const backButton = await page.$('button[aria-label="Back"]');
          if (backButton) await backButton.click();
          else await page.keyboard.press('Escape');

          await simpleDelay(2000 + Math.random() * 2000);
        } catch (error) {
          logger.error(`Error processing restaurant ${i + 1}:`, error);
        }
      }

      processedCount = restaurantElements.length;

      if (restaurants.length < maxRestaurants) {
        scrollAttempts++;
        logger.info(`Scrolling to load more (attempt ${scrollAttempts}/${MAX_SCROLL_ATTEMPTS})...`);
        await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          if (feed) feed.scrollTop = feed.scrollHeight;
          else window.scrollTo(0, document.body.scrollHeight);
        });
        await simpleDelay(5000 + Math.random() * 3000);
      }
    }

    return restaurants;
  } catch (error) {
    logger.error('Error searching for restaurants:', error);
    return restaurants;
  }
}

export const handler: StepHandler<typeof config> = async (input, { logger, emit }) => {
  logger.info('Starting restaurant scraping', { location: input.location });

  const browser = await chromium.launch({
    headless: false
  });

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
    });

    const page = await context.newPage();

    // Get existing restaurants from JSON file
    const existingRestaurants = getRestaurantsByLocation(input.location);
    const existingCount = Object.keys(existingRestaurants).length;
    logger.info(`Found ${existingCount} existing restaurants in JSON file`);

    const restaurantsNeeded = input.maxRestaurants - existingCount;
    if (restaurantsNeeded <= 0) {
      logger.info('Already have enough restaurants', { count: existingCount });
      await emit({
        topic: 'restaurants.scraped',
        data: {
          location: input.location,
          count: existingCount,
          message: 'No new restaurants needed'
        }
      });
      return;
    }

    const restaurants = await searchRestaurants(page, input.location, restaurantsNeeded, logger);

    // Save each restaurant to the JSON file
    for (const restaurant of restaurants) {
      addRestaurant(restaurant, input.location);
    }

    await emit({
      topic: 'restaurants.scraped',
      data: {
        location: input.location,
        count: restaurants.length,
        message: `Successfully scraped ${restaurants.length} restaurants`
      }
    });

  } catch (error) {
    logger.error('Restaurant scraping failed', { error: String(error) });
    await emit({
      topic: 'restaurants.scraped',
      data: {
        location: input.location,
        error: String(error),
        count: 0
      }
    });
  } finally {
    await browser.close();
  }
};