import { chromium, type Page } from '@playwright/test';
import 'dotenv/config';
import * as fs from 'fs';
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

// Define Restaurant interface
interface Restaurant {
  name: string;
  address?: string;
  phoneNumber?: string;
  website?: string;
  googleReviews?: string;
  menu?: string;
}

// Load environment variables
// const { HYPERBROWSER_API_KEY } = process.env as Record<string, string>;

// Locations to search
const LOCATIONS = ['Brisbane'];
const MAX_RESTAURANTS = 30; // Maximum total restaurants to collect
const SCROLL_ATTEMPTS = 15; // How many times to scroll to load more results

// Check required environment variables
// if (!HYPERBROWSER_API_KEY) {
//   console.error('Error: HYPERBROWSER_API_KEY is required in .env file');
//   process.exit(1);
// }

// Function to log a restaurant's details in a nice format
function logRestaurantDetails(restaurant: Restaurant, index: number, total: number): void {
  const header = `RESTAURANT ${index}/${total}: ${restaurant.name}`;
  const divider = '='.repeat(50);

  console.log('\n' + divider);
  console.log(header);
  console.log(divider);

  // Name and address
  console.log(`Name: ${restaurant.name}`);
  console.log(`Address: ${restaurant.address || 'Not found'}`);

  // Contact information
  console.log(`Phone: ${restaurant.phoneNumber || 'Not found'}`);
  console.log(`Website: ${restaurant.website || 'Not found'}`);

  // Reviews and menu
  console.log(`Reviews: ${restaurant.googleReviews || 'Not found'}`);
  console.log(`Menu: ${restaurant.menu || 'Not found'}`);

  console.log(divider + '\n');
}

// More human-like delay with normal distribution
async function simpleDelay(duration: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, duration));
}

// Function to get existing restaurant data
function getExistingRestaurants(location: string): Record<string, Restaurant> {
  const outputDir = path.resolve(process.cwd(), 'output');
  const outputPath = path.join(outputDir, 'restaurants.json');

  if (!fs.existsSync(outputPath)) {
    return {};
  }

  try {
    const data = fs.readFileSync(outputPath, 'utf8');
    const allData = JSON.parse(data);
    return allData[location.toLowerCase()] || {};
  } catch (e) {
    console.log(`Warning: Error reading existing data: ${e}`);
    return {};
  }
}

// Function to search for restaurants in a location
async function searchRestaurants(page: Page, location: string): Promise<Restaurant[]> {
  console.log(`\nSEARCHING FOR RESTAURANTS IN ${location.toUpperCase()}`);
  const searchQuery = `${location} restaurants`;

  // Get existing restaurants to avoid duplicates
  const existingRestaurants = getExistingRestaurants(location);
  console.log(`Found ${Object.keys(existingRestaurants).length} existing restaurants`);

  const allRestaurants: Restaurant[] = Object.values(existingRestaurants);

  // Calculate how many more restaurants we need
  const restaurantsNeeded = MAX_RESTAURANTS - allRestaurants.length;
  if (restaurantsNeeded <= 0) {
    console.log(`Already have ${allRestaurants.length} restaurants, no more needed`);
    return allRestaurants;
  }

  console.log(`Need to collect ${restaurantsNeeded} more restaurants`);

  try {
    // Navigate to Google Maps
    console.log(`Navigating to Google Maps...`);
    await page.goto('https://www.google.com/maps', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });
    await simpleDelay(3000 + Math.random() * 2000);

    // Type in the search query
    console.log(`Entering search query: "${searchQuery}"`);
    await page.evaluate(() => {
      const input = document.querySelector('input[name="q"]') as HTMLInputElement;
      if (input) input.value = '';
    });

    await page.type('input[name="q"]', searchQuery, { delay: 20 + Math.random() * 100 });
    await simpleDelay(800 + Math.random() * 700);
    await page.keyboard.press('Enter');

    // Wait for search results to load
    console.log(`Waiting for search results to load...`);
    await simpleDelay(5000 + Math.random() * 3000);

    // Take a screenshot for debugging (only in debug mode)
    if (process.env.DEBUG) {
      await page.screenshot({ path: `${location}-search-results.png` });
      console.log(`Screenshot saved as ${location}-search-results.png`);
    }

    // Find restaurant cards
    console.log(`Looking for restaurant listings...`);

    // Try multiple selectors - Simplified to one primary selector for listings
    const restaurantListSelector = 'div[role="feed"] a.hfpxzc'; // Common selector for listings in the feed
    // Fallback or alternative: 'a[aria-label*="restaurant"]', 'div[role="article"]'
    // For simplicity, we'll stick to one and handle if it's not found.

    let restaurantElements = [];
    try {
      await page.waitForSelector(restaurantListSelector, { timeout: 15000 });
      restaurantElements = await page.$$(restaurantListSelector);
      console.log(`Found ${restaurantElements.length} initial restaurant results.`);
    } catch (e) {
      console.error(`Could not find restaurant listings with selector: ${restaurantListSelector}. Trying fallback...`);
      // Attempt with a broader selector if the primary fails
      const fallbackSelector = 'a[href*="/maps/place/"]';
      try {
        await page.waitForSelector(fallbackSelector, { timeout: 10000 });
        restaurantElements = (await page.$$(fallbackSelector)).filter(async el => {
          const ariaLabel = await el.evaluate(node => node.getAttribute('aria-label'));
          return ariaLabel && ariaLabel.toLowerCase().includes('restaurant');
        });
        if(restaurantElements.length > 0) {
          console.log(`Found ${restaurantElements.length} restaurants with fallback selector.`);
        } else {
          console.error('Fallback selector also failed to find restaurants.');
        }
      } catch (e2) {
         console.error(`Error with fallback selector: ${e2}`);
      }
    }

    if (restaurantElements.length === 0) {
      console.error(`NO RESTAURANT LISTINGS FOUND`);
      return allRestaurants;
    }

    let processedCount = 0;
    let scrollAttempts = 0;
    let seenNames = new Set(Object.keys(existingRestaurants));

    // Keep scrolling and processing until we have enough restaurants or reach max scroll attempts
    while (allRestaurants.length < MAX_RESTAURANTS && scrollAttempts < SCROLL_ATTEMPTS) {
      console.log(`\nCURRENT COUNT: ${allRestaurants.length}/${MAX_RESTAURANTS} RESTAURANTS`);

      // Get current restaurant elements
      // Re-query elements after potential navigation or DOM changes
      try {
        restaurantElements = await page.$$(restaurantListSelector);
         if (restaurantElements.length === 0) {
            const fallbackSelector = 'a[href*="/maps/place/"]';
             restaurantElements = (await page.$$(fallbackSelector)).filter(async el => {
              const ariaLabel = await el.evaluate(node => node.getAttribute('aria-label'));
              return ariaLabel && ariaLabel.toLowerCase().includes('restaurant');
            });
         }
      } catch (e) {
        console.error('Error re-querying restaurant elements:', e);
        break; // Exit loop if elements can't be found
      }
      console.log(`Found ${restaurantElements.length} restaurant elements on page`);

      // Process each restaurant from where we left off
      for (let i = processedCount; i < restaurantElements.length; i++) {
        if (allRestaurants.length >= MAX_RESTAURANTS) {
          break;
        }

        try {
          console.log(`\nProcessing restaurant ${i + 1}/${restaurantElements.length}`);

          // Click on restaurant card to view details
          // Ensure element is still valid before clicking
          const currentElement = restaurantElements[i];
          if (!currentElement) {
            console.warn(`Restaurant element at index ${i} is no longer valid. Skipping.`);
            continue;
          }
          try {
            await currentElement.click();
          } catch (clickError) {
             console.error(`Error clicking restaurant card: ${clickError}. Trying JS click.`);
             await page.evaluate(el => (el as HTMLElement).click(), currentElement);
          }

          console.log(`Waiting for details to load...`);
          await simpleDelay(4000 + Math.random() * 2000);

          // Extract details
          const restaurant = await extractRestaurantDetails(page);

          if (restaurant && restaurant.name && !seenNames.has(restaurant.name)) {
            // Log full details
            logRestaurantDetails(restaurant, allRestaurants.length + 1, MAX_RESTAURANTS);

            // Add to our collection
            allRestaurants.push(restaurant);
            seenNames.add(restaurant.name);

            // Save results after each successful restaurant
            saveResults(location, allRestaurants);

            // Save the screenshot of the restaurant details (only in debug mode)
            if (process.env.DEBUG) {
              await page.screenshot({ path: `restaurant-${location}-${allRestaurants.length}.png` });
              console.log(`Screenshot saved as restaurant-${location}-${allRestaurants.length}.png`);
            }
          } else if (restaurant) {
            console.log(`Skipping duplicate or invalid restaurant: ${restaurant.name}`);
          }

          // Go back to results
          try {
            console.log(`Returning to search results...`);
            const backButtonSelector = 'button[aria-label="Back"], button[jsaction*="back"]';
            try {
                await page.waitForSelector(backButtonSelector, {timeout: 5000});
                await page.click(backButtonSelector);
            } catch (e) {
                console.warn("Back button not found, trying Escape key.");
                await page.keyboard.press('Escape');
            }
            await simpleDelay(3000 + Math.random() * 2000);
          } catch (error) {
            console.log(`Warning: Error going back to results, renavigating to search... ${error}`);
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
              waitUntil: 'domcontentloaded',
              timeout: 60000
            });
            await simpleDelay(5000 + Math.random() * 3000);
            // After re-navigating, we need to re-evaluate processedCount and restaurantElements
            processedCount = 0; // Reset processed count as we reloaded the search
            break; // Break inner loop to re-fetch elements
          }

          // Random delay between restaurants
          await simpleDelay(2000 + Math.random() * 2000);

        } catch (error) {
          console.error(`Error processing restaurant ${i + 1}: ${error}`);
          // Try to recover by going back to search results
          try {
            await page.goto(`https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`, {
              waitUntil: 'domcontentloaded',
              timeout: 60000
            });
            await simpleDelay(5000 + Math.random() * 3000);
            processedCount = 0; // Reset processed count
            break; // Break inner loop to re-fetch elements
          } catch (recoveryError) {
             console.error(`Failed to recover by navigating to search: ${recoveryError}`);
             return allRestaurants; // Critical error, stop processing this location
          }
        }
      }
      if (i < restaurantElements.length && allRestaurants.length < MAX_RESTAURANTS) { // If broken from inner loop before completion
         console.log("Continuing to next batch after re-navigation or error.");
         // processedCount is reset, outer loop will continue
      } else {
        // Update the number of restaurants we've processed if loop completed normally
        processedCount = restaurantElements.length;
      }

      // If we haven't reached our target, scroll down to load more
      if (allRestaurants.length < MAX_RESTAURANTS) {
        scrollAttempts++;
        console.log(`Scrolling to load more results (attempt ${scrollAttempts}/${SCROLL_ATTEMPTS})...`);

        // Scroll down to load more results
        await page.evaluate(() => {
          const feed = document.querySelector('div[role="feed"]');
          if (feed) {
            feed.scrollTop = feed.scrollHeight;
          } else {
            window.scrollTo(0, document.body.scrollHeight);
          }
        });

        // Wait for new results to load
        await simpleDelay(5000 + Math.random() * 3000);

        // Take a screenshot after scrolling (only in debug mode)
        if (process.env.DEBUG) {
          await page.screenshot({ path: `${location}-scroll-${scrollAttempts}.png` });
        }
      }
    }

    console.log(`\nCOLLECTED ${allRestaurants.length}/${MAX_RESTAURANTS} RESTAURANTS`);
    return allRestaurants;

  } catch (error) {
    console.error(`ERROR SEARCHING FOR RESTAURANTS IN ${location}: ${error} `);
    // Take screenshot to help debug (only in debug mode)
    if (process.env.DEBUG) {
      await page.screenshot({ path: `error-${location}.png` });
    }
    return allRestaurants;
  }
}

// Extract details from a restaurant's detailed view
async function extractRestaurantDetails(page: Page): Promise<Restaurant | null> {
  try {
    console.log(`Extracting restaurant details...`);

    // First, wait for the actual restaurant name to appear
    await page.waitForSelector('h1', { timeout: 10000 }); // Main heading for name
    await simpleDelay(1000 + Math.random() * 1000);

    // Extract restaurant details using page.evaluate for more reliable extraction
    const details = await page.evaluate(() => {
      // Helper function to find elements by different selectors
      const findContent = (selectors: string[]): string | undefined => {
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (el && el.textContent) {
            const text = el.textContent.trim();
            if (text && text !== 'Results') {
              return text;
            }
          }
        }
        return undefined;
      };

      // Helper for getting href attributes
      const findHref = (selectors: string[]): string | undefined => {
        for (const selector of selectors) {
          const el = document.querySelector(selector) as HTMLAnchorElement;
          if (el && el.href && !el.href.startsWith('mailto:') && !el.href.startsWith('tel:')) { // Ensure it's a web link
            // Normalize URL if it's relative
            if (el.href.startsWith('/')) {
                return new URL(el.href, document.baseURI).href;
            }
            return el.href;
          }
        }
        return undefined;
      };

      // Extract name - use more specific selectors and filter out "Results"
      // Primary selector: h1, often contains the name.
      let name = document.querySelector('h1')?.textContent?.trim() || '';
      if (name === 'Results' || !name) { // Fallback if h1 is "Results" or empty
          const nameElement = document.querySelector('h1.DUwDvf, div.fontHeadlineLarge, div[role="main"] h1');
          name = nameElement?.textContent?.trim() || 'Unknown Restaurant';
      }
       if (name === 'Results') name = 'Unknown Restaurant';

      // Extract address
      const addressSelectors = [
        'button[data-item-id="address"]', // Common and specific
        'button[aria-label*="Address"]',
        'div[data-tooltip*="address"] > div > div:nth-child(1)' // More generic path sometimes
      ];
      const address = findContent(addressSelectors);

      // Extract phone
      const phoneSelectors = [
        'button[data-item-id^="phone:"]', // Common and specific
        'button[aria-label*="Phone"]',
        'a[href^="tel:"]' // Phone numbers are often in tel: links
      ];
      const phoneNumberText = findContent(phoneSelectors);
      const phoneNumber = phoneNumberText ? phoneNumberText.replace(/\s+/g, '') : undefined;

      // Extract website
      const websiteSelectors = [
        'a[data-item-id="authority"]', // Common and specific
        'a[aria-label*="website" i]', // Case insensitive aria-label
        'a[href*="://"]:not([href*="google."]):not([href*="mailto:"]):not([href*="tel:"])' // Generic link that's not google maps, mail or phone
      ];
      const website = findHref(websiteSelectors);

      // Extract reviews - more robust approach
      let googleReviews = '';
      const ratingElement = document.querySelector('span.fontDisplayLarge, span.kvMYJc, div.F7nice span[aria-hidden="true"]');
      let rating = ratingElement?.textContent?.trim() || '';

      // If rating is a range (e.g. "4.0-4.5"), take the first number
      if (rating.includes('-')) rating = rating.split('-')[0].trim();
      if (rating && !/^[1-5](\.\d)?$/.test(rating)) rating = ''; // Validate rating format

      let reviewCount = '';
      const reviewElements = document.querySelectorAll('button[aria-label*="reviews"], span[aria-label*="reviews"], div.F7nice span:not([aria-hidden="true"])');
      reviewElements.forEach(el => {
        const text = el.textContent || '';
        const match = text.match(/\(?([0-9,KM]+)\)?\s*(reviews|ratings)?/i); // Matches (1,234), 1.2K reviews, etc.
        if (match && match[1]) {
          reviewCount = match[1].replace(/[KM]/, (m) => m === 'K' ? '000' : '000000');
          return;
        }
      });
      if (!reviewCount) { // Fallback for just number of reviews
          const reviewCountEl = document.querySelector('span.RDApEe');
          if (reviewCountEl) {
            const text = reviewCountEl.textContent || '';
            const match = text.match(/([0-9,]+)/);
            if (match) reviewCount = match[1];
          }
      }

      // Format the reviews string if we have data
      if (rating && reviewCount) {
        googleReviews = `${rating} stars, ${reviewCount} reviews`;
      } else if (rating) {
        googleReviews = `${rating} stars`;
      } else if (reviewCount) {
        googleReviews = `${reviewCount} reviews`;
      }

      // Extract menu
      const menuSelectors = [
        'a[aria-label*="Menu" i]', // Case insensitive
        'a[href*="menu"]',
        'button[aria-label*="Menu" i]'
      ];
      const menu = findHref(menuSelectors) || findContent(menuSelectors.filter(s => s.startsWith('button'))); // findContent for buttons

      return {
        name,
        address,
        phoneNumber,
        website,
        googleReviews,
        menu,
      };
    });

    // Additional validation for name
    if (details.name === 'Unknown Restaurant' || details.name === 'Results' || !details.name) {
      // Try to use a more prominent text element if h1 failed
      const prominentText = await page.evaluate(() => {
        const el = document.querySelector('div[role="main"] h1, h1.DUwDvf, div.fontHeadlineLarge');
        return el?.textContent?.trim();
      });
      if (prominentText && prominentText !== 'Results') {
        details.name = prominentText;
      } else if (details.website) { // Fallback to website domain if name is still generic
        try {
          const url = new URL(details.website);
          let domain = url.hostname.replace(/^www\./, '');
          details.name = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1) + " (from domain)";
        } catch (e) { /* Keep 'Unknown Restaurant' or current name */ }
      }
    }
    if (!details.name || details.name === 'Results') details.name = 'Unknown Restaurant';

    // Print a compact summary to console
    console.log(`✓ Found restaurant: ${details.name}`);

    return details as Restaurant;
  } catch (error) {
    console.error(`Error extracting restaurant details: ${error}`);
    if (process.env.DEBUG) {
        await page.screenshot({ path: 'error-extracting-details.png' });
        console.log('Screenshot saved: error-extracting-details.png');
    }
    return null;
  }
}

// Save results to disk
function saveResults(location: string, restaurants: Restaurant[]): void {
  try {
    // Create output directory if it doesn't exist
    const outputDir = path.resolve(process.cwd(), 'output');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `restaurants.json`);

    // Read existing data if file exists
    let allData: Record<string, Record<string, Restaurant>> = {};
    if (fs.existsSync(outputPath)) {
      try {
        const existingData = fs.readFileSync(outputPath, 'utf8');
        allData = JSON.parse(existingData);
      } catch (e) {
        console.log(`No existing data or invalid JSON, creating new file`);
      }
    }

    // Format data as requested
    const formattedData: Record<string, Restaurant> = {};
    for (const restaurant of restaurants) {
      if (restaurant.name) {
        formattedData[restaurant.name] = restaurant;
      }
    }

    // Add to existing data under location key
    allData[location.toLowerCase()] = formattedData;

    // Write the updated data
    fs.writeFileSync(
      outputPath,
      JSON.stringify(allData, null, 2)
    );

    console.log(`\nSAVED DATA ${restaurants.length} restaurants saved to ${outputPath}`);

    // Print a summary of what we saved
    console.log(`\nSummary of restaurants in ${location}:`);
    let index = 1;
    for (const restaurant of restaurants) {
      console.log(`${index}. ${restaurant.name}`);
      index++;
    }
  } catch (error) {
    console.error(`ERROR SAVING RESULTS: ${error} `);
  }
}

// Main execution
(async () => {
  console.log(`\nSTARTING GOOGLE MAPS RESTAURANT SCRAPER`);

  const browser = await chromium.launch({
    headless: false
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    // Process each location
    const allResults: Record<string, Restaurant[]> = {};

    for (const location of LOCATIONS) {
      console.log(`\nPROCESSING LOCATION: ${location.toUpperCase()}`);
      const restaurants = await searchRestaurants(page, location);
      console.log(`Found ${restaurants.length} restaurants in ${location}`);

      allResults[location] = restaurants;
      // Final save with all results (already saved per page in searchRestaurants)
      if (restaurants.length > 0) {
        saveResults(location, restaurants);
      }

      // Delay between locations
      if (LOCATIONS.indexOf(location) < LOCATIONS.length - 1) {
        const delayTime = 5000 + Math.random() * 5000;
        console.log(`Waiting ${Math.round(delayTime/1000)} seconds before processing next location...`);
        await simpleDelay(delayTime);
      }
    }

    console.log(`\nSCRAPING COMPLETED SUCCESSFULLY`);
    console.log(`Summary:`);
    for (const location of LOCATIONS) {
      console.log(`- ${location}: ${allResults[location] ? allResults[location].length : 0} restaurants`);
    }

  } catch (error) {
    console.error(`\nERROR DURING RESTAURANT SCRAPING: ${(error as Error).message} `);
    console.error(error);
  } finally {
    await browser.close();
  }
})();
