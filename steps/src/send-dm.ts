import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
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
const { INSTAGRAM_USERNAME, INSTAGRAM_PASSWORD } = process.env as Record<string, string>;

// Check required environment variables
if (!INSTAGRAM_USERNAME || !INSTAGRAM_PASSWORD) {
  console.error(`${colors.red}Error: INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD are required in .env file${colors.reset}`);
  process.exit(1);
}

// More human-like delay with normal distribution
function humanDelay(min = 20000, max = 30000): Promise<void> {
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

// Function to save the updated restaurant data
function saveUpdatedData(data: LocationData): void {
  const outputPath = path.join(process.cwd(), 'output', 'restaurants.json');

  try {
    fs.writeFileSync(outputPath, JSON.stringify(data, null, 2));
    console.log(`${colors.green}Updated data saved to ${outputPath}${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error saving JSON file: ${error}${colors.reset}`);
  }
}

// Function to extract Instagram username from URL
function extractInstagramUsername(url: string): string | null {
  if (!url) return null;

  // Remove trailing slashes if any
  url = url.replace(/\/+$/, '');

  // Try different patterns
  const patterns = [
    /instagram\.com\/([A-Za-z0-9_\.]+)\/?$/,         // Regular username format
    /instagram\.com\/([A-Za-z0-9_\.]+)\/\?hl=.+$/,   // With language parameter
    /instagram\.com\/explore\/locations\/(.+)\/$/     // Location pages
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

// Generate message variants
function generateMessage(restaurant: Restaurant): string {
  // Get only the first word of the restaurant name
  const firstWord = restaurant.name.split(' ')[0];

  const variants = [
    `Hello from Zoe! I help restaurants like ${firstWord} handle up to 100 calls a day, 30 at once, and send orders straight to your CRM, POS, or kitchen printer. Would you like to see a 60-second demo?`,
  ];

  return variants[Math.floor(Math.random() * variants.length)];
}

// Instagram automation class
class InstagramAutomation {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;
  private cookiesPath: string;
  private dailyMessageCount = 0;
  private readonly MAX_HOURLY_MESSAGES = 25; // Conservative limit
  private readonly MAX_DAILY_MESSAGES = 100; // Conservative limit
  constructor() {
    this.cookiesPath = path.join(process.cwd(), 'output', 'instagram_cookies.json');
  }

  async init() {
    console.log(`${colors.cyan}Initializing browser...${colors.reset}`);

    this.browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    });

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
    });

    this.page = await this.context.newPage();
    await this.restoreCookies();
  }

  private async restoreCookies() {
    if (fs.existsSync(this.cookiesPath)) {
      console.log(`${colors.cyan}Restoring cookies from ${this.cookiesPath}${colors.reset}`);
      const cookiesString = fs.readFileSync(this.cookiesPath, 'utf8');
      const cookies = JSON.parse(cookiesString);
      await this.context!.addCookies(cookies);
    }
  }

  private async saveCookies() {
    const cookies = await this.context!.cookies();
    fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));
    console.log(`${colors.green}Cookies saved to ${this.cookiesPath}${colors.reset}`);
  }

  async login() {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      // Go to Instagram login page
      console.log(`${colors.cyan}Navigating to Instagram login...${colors.reset}`);
      await this.page.goto('https://www.instagram.com/accounts/login/', { waitUntil: 'networkidle', timeout: 60000 });

      // Check if we're already logged in by looking for the login form
      const loginForm = await this.page.$('form[id="loginForm"]');

      if (loginForm) {
        console.log(`${colors.cyan}Logging in to Instagram...${colors.reset}`);

        // Fill in credentials
        await this.page.fill('input[name="username"]', INSTAGRAM_USERNAME);
        await humanDelay(1000, 2000);
        await this.page.fill('input[name="password"]', INSTAGRAM_PASSWORD);
        await humanDelay(1000, 2000);

        // Click login button
        await this.page.click('button[type="submit"]');

        // Wait for OTP verification
        console.log(`${colors.yellow}Waiting 60 seconds for OTP verification...${colors.reset}`);
        console.log(`${colors.yellow}Please complete any security checks or OTP verification in the browser...${colors.reset}`);

        // Wait for 60 seconds to allow manual verification
        await new Promise(resolve => setTimeout(resolve, 60000));

        console.log(`${colors.cyan}Continuing after verification wait...${colors.reset}`);

        // Save cookies after successful login
        await this.saveCookies();
        console.log(`${colors.green}Login successful!${colors.reset}`);
      } else {
        console.log(`${colors.green}Already logged in${colors.reset}`);
      }

      // Verify we're logged in by checking for common logged-in elements
      console.log(`${colors.cyan}Verifying login status...${colors.reset}`);

      // Navigate to home with longer timeout
      await this.page.goto('https://www.instagram.com/', {
        waitUntil: 'networkidle',
        timeout: 60000
      });

      // Wait longer for the page to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Look for various elements that indicate we're logged in
      let isLoggedIn = false;
      const loginIndicators = [
        'svg[aria-label="Home"]',
        'a[href="/direct/inbox/"]',
        'span[role="link"]:has-text("Search")',
        'a[href="/explore/"]',
        'svg[aria-label="New post"]'
      ];

      for (const selector of loginIndicators) {
        const element = await this.page.$(selector);
        if (element) {
          isLoggedIn = true;
          break;
        }
      }

      if (!isLoggedIn) {
        console.log(`${colors.red}Login verification failed. Please check if you're properly logged in.${colors.reset}`);
        console.log(`${colors.yellow}Press Ctrl+C to exit if you need to retry, or wait to continue...${colors.reset}`);
        // Wait additional time in case verification is still in progress
        await new Promise(resolve => setTimeout(resolve, 10000));
      } else {
        console.log(`${colors.green}Login verified successfully${colors.reset}`);
      }

    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.error(`${colors.red}Timeout while waiting for page to load. This might be normal during verification.${colors.reset}`);
        console.log(`${colors.yellow}Continuing anyway...${colors.reset}`);
      } else {
        console.error(`${colors.red}Login failed: ${error}${colors.reset}`);
        throw error;
      }
    }
  }

  async sendMessage(username: string, message: string): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');

    if (this.dailyMessageCount >= this.MAX_DAILY_MESSAGES) {
      console.log(`${colors.yellow}Daily message limit reached (${this.MAX_DAILY_MESSAGES})${colors.reset}`);
      return false;
    }

    try {
      // Go to user's profile
      console.log(`${colors.cyan}Visiting ${username}'s profile...${colors.reset}`);

      // Use a more resilient page loading strategy
      await this.page.goto(`https://www.instagram.com/${username}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      });

      // Wait for any of these selectors to appear, indicating the profile loaded
      console.log(`${colors.cyan}Waiting for profile to load...${colors.reset}`);
      await Promise.race([
        this.page.waitForSelector('header section', { timeout: 30000 }),
        this.page.waitForSelector('article', { timeout: 30000 }),
        this.page.waitForSelector('main[role="main"]', { timeout: 30000 })
      ]);

      await humanDelay(2000, 3000);

      // Look for the Message button in different possible locations
      console.log(`${colors.cyan}Looking for message button...${colors.reset}`);
      let messageButton = null;

      // Try different button selectors
      const buttonSelectors = [
        'div[role="button"]:has-text("Message")',
        'button:has-text("Message")',
        'a[role="button"]:has-text("Message")',
        'div._acan._acap._acas:has-text("Message")',
        '//div[contains(text(), "Message")]',  // XPath as fallback
        '//button[contains(text(), "Message")]'
      ];

      for (const selector of buttonSelectors) {
        try {
          if (selector.startsWith('//')) {
            // Handle XPath selectors
            messageButton = await this.page.$(`xpath=${selector}`);
          } else {
            messageButton = await this.page.$(selector);
          }
          if (messageButton) break;
        } catch (e) {
          continue;
        }
      }

      if (!messageButton) {
        // If no message button found, try going to DMs directly
        console.log(`${colors.yellow}Message button not found, trying direct message approach...${colors.reset}`);

        await this.page.goto('https://www.instagram.com/direct/new/', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });

        // Wait for the search box with multiple possible selectors
        const searchSelectors = [
          'input[placeholder="Search..."]',
          'input[aria-label="Search"]',
          'input[type="text"]'
        ];

        let searchBox = null;
        for (const selector of searchSelectors) {
          searchBox = await this.page.$(selector);
          if (searchBox) break;
        }

        if (!searchBox) {
          throw new Error('Could not find search input');
        }

        // Fill in the username
        await this.page.fill(searchSelectors[0], username);
        await humanDelay(1000, 2000);

        // Try different approaches to select the user
        try {
          // First try clicking the username text
          await this.page.click(`text="${username}"`);
        } catch (e) {
          // If that fails, try finding a checkbox or similar element
          const userElements = await this.page.$$('label, div[role="button"]');
          for (const element of userElements) {
            const text = await element.textContent();
            if (text?.includes(username)) {
              await element.click();
              break;
            }
          }
        }

        await humanDelay(1000, 2000);

        // Look for and click the Next button
        const nextButton = await this.page.$('button:has-text("Next")');
        if (nextButton) {
          await nextButton.click();
        } else {
          throw new Error('Could not find Next button');
        }
      } else {
        // Click the message button if found on profile
        await messageButton.click();
      }

      await humanDelay(2000, 3000);

      // Wait for the message input with multiple possible selectors
      console.log(`${colors.cyan}Waiting for message input...${colors.reset}`);
      const messageInputSelectors = [
        'textarea[placeholder="Message..."]',
        'textarea[aria-label="Message"]',
        'div[contenteditable="true"]',
        'div[role="textbox"]',
        'div[aria-label="Message"]'
      ];

      let messageInput = null;
      let usedSelector = '';
      for (const selector of messageInputSelectors) {
        try {
          messageInput = await this.page.waitForSelector(selector, { timeout: 10000, state: 'visible' });
          if (messageInput) {
            usedSelector = selector;
            break;
          }
        } catch (e) {
          continue;
        }
      }

      if (!messageInput) {
        throw new Error('Message input not found');
      }

      // Type the message with human-like delays
      console.log(`${colors.cyan}Typing message...${colors.reset}`);

      // Clear any existing text first
      await messageInput.click();
      await this.page.keyboard.press('Control+A');
      await this.page.keyboard.press('Backspace');
      await humanDelay(500, 1000);

      // Type the message character by character
      for (const char of message) {
        await messageInput.type(char, { delay: 100 });
        if (Math.random() < 0.1) { // 10% chance of a longer pause
          await humanDelay(100, 300);
        }
      }

      await humanDelay(1000, 2000);

      // Try different methods to send the message
      console.log(`${colors.cyan}Sending message...${colors.reset}`);
      let sent = false;

      // Method 1: Press Enter
      try {
        await messageInput.press('Enter');
        sent = true;
      } catch (e) {
        console.log(`${colors.yellow}Enter key method failed, trying alternative...${colors.reset}`);
      }

      // Method 2: Click the send button if Enter didn't work
      if (!sent) {
        try {
          const sendButtonSelectors = [
            'button[type="submit"]',
            'button:has-text("Send")',
            'div[role="button"]:has-text("Send")',
            'svg[aria-label="Send Message"]'
          ];

          for (const selector of sendButtonSelectors) {
            const sendButton = await this.page.$(selector);
            if (sendButton) {
              await sendButton.click();
              sent = true;
              break;
            }
          }
        } catch (e) {
          console.log(`${colors.yellow}Send button method failed${colors.reset}`);
        }
      }

      if (!sent) {
        throw new Error('Failed to send message');
      }

      await humanDelay(2000, 3000);

      // Verify message was sent by checking for various indicators
      let messageVerified = false;
      try {
        // Try multiple verification methods
        const verificationMethods = [
          async () => await this.page!.waitForSelector(`text="${message.substring(0, 20)}..."`, { timeout: 5000 }),
          async () => await this.page!.waitForSelector('div[aria-label="Sent"]', { timeout: 5000 }),
          async () => await this.page!.waitForSelector('span:has-text("Sent")', { timeout: 5000 })
        ];

        for (const verify of verificationMethods) {
          try {
            await verify();
            messageVerified = true;
            break;
          } catch (e) {
            continue;
          }
        }
      } catch (e) {
        console.log(`${colors.yellow}Could not verify if message was sent. Continuing anyway...${colors.reset}`);
      }

      if (messageVerified) {
        console.log(`${colors.green}Message sent and verified to ${username}!${colors.reset}`);
      } else {
        console.log(`${colors.yellow}Message sent but could not verify to ${username}${colors.reset}`);
      }

      this.dailyMessageCount++;
      return true;

    } catch (error) {
      console.error(`${colors.red}Failed to send message to ${username}: ${error}${colors.reset}`);

      // Take a screenshot on error for debugging
      try {
        const screenshotPath = path.join(process.cwd(), 'output', `error_${username}_${Date.now()}.png`);
        await this.page.screenshot({ path: screenshotPath, fullPage: true });
        console.log(`${colors.yellow}Error screenshot saved to: ${screenshotPath}${colors.reset}`);
      } catch (e) {
        console.error(`${colors.red}Failed to save error screenshot: ${e}${colors.reset}`);
      }

      return false;
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

// Function to get message counts from the JSON file
function getMessageCounts(): { hourly: number; daily: number } {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = new Date().getHours();
    const currentHourKey = `${currentHour}h`;

    let result = { hourly: 0, daily: 0 };

    if (fs.existsSync(messagedRestaurantsPath)) {
      const data = fs.readFileSync(messagedRestaurantsPath, 'utf8');
      const messagedData = JSON.parse(data);

      // Check if today's data exists
      if (messagedData[today]) {
        // Count total messages for today
        let dailyCount = 0;
        for (const hour in messagedData[today]) {
          const hourMessages = Object.keys(messagedData[today][hour]).length;
          dailyCount += hourMessages;

          // Count current hour's messages
          if (hour === currentHourKey) {
            result.hourly = hourMessages;
          }
        }
        result.daily = dailyCount;
      }
    }

    console.log(`${colors.cyan}Current message counts - Hourly: ${result.hourly}/${25}, Daily: ${result.daily}/${100}${colors.reset}`);
    return result;
  } catch (error) {
    console.error(`${colors.red}Error getting message counts: ${error}${colors.reset}`);
    return { hourly: 0, daily: 0 };
  }
}

// Function to save a messaged restaurant with timestamp
function saveMessagedRestaurant(restaurantName: string): void {
  try {
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const currentHour = new Date().getHours();
    const currentHourKey = `${currentHour}h`;

    let data: Record<string, Record<string, Record<string, boolean>>> = {};

    if (fs.existsSync(messagedRestaurantsPath)) {
      const fileData = fs.readFileSync(messagedRestaurantsPath, 'utf8');
      data = JSON.parse(fileData);
    }

    // Initialize nested structure if needed
    if (!data[today]) {
      data[today] = {};
    }

    if (!data[today][currentHourKey]) {
      data[today][currentHourKey] = {};
    }

    // Mark restaurant as messaged
    data[today][currentHourKey][restaurantName] = true;

    fs.writeFileSync(messagedRestaurantsPath, JSON.stringify(data, null, 2));
    console.log(`${colors.green}Saved ${restaurantName} to messaged restaurants with timestamp${colors.reset}`);
  } catch (error) {
    console.error(`${colors.red}Error saving messaged restaurant: ${error}${colors.reset}`);
  }
}

// Function to check if a restaurant has been messaged before
function isRestaurantMessaged(restaurantName: string): boolean {
  try {
    if (fs.existsSync(messagedRestaurantsPath)) {
      const data = fs.readFileSync(messagedRestaurantsPath, 'utf8');
      const messagedData = JSON.parse(data);

      // Check all days and hours
      for (const day in messagedData) {
        for (const hour in messagedData[day]) {
          if (messagedData[day][hour][restaurantName]) {
            return true;
          }
        }
      }
    }
    return false;
  } catch (error) {
    console.error(`${colors.red}Error checking if restaurant was messaged: ${error}${colors.reset}`);
    return false;
  }
}

// Main execution
(async () => {
  console.log(`\n${colors.bgGreen}${colors.white} STARTING INSTAGRAM DM CAMPAIGN ${colors.reset}`);
  console.log(`Loading restaurant data...`);

  // Load the restaurant data
  const restaurantData = loadRestaurantData();
  console.log(`${colors.green}Loaded data for ${Object.keys(restaurantData).length} locations${colors.reset}`);

  // Check message limits
  const { hourly, daily } = getMessageCounts();

  if (hourly >= 25) {
    console.log(`${colors.yellow}Hourly message limit reached (${hourly}/${25}). Exiting.${colors.reset}`);
    process.exit(0);
  }

  if (daily >= 100) {
    console.log(`${colors.yellow}Daily message limit reached (${daily}/${100}). Exiting.${colors.reset}`);
    process.exit(0);
  }

  // Calculate remaining capacity
  const hourlyRemaining = 25 - hourly;
  const dailyRemaining = 100 - daily;
  const batchLimit = Math.min(hourlyRemaining, dailyRemaining);
  console.log(`${colors.cyan}Can send up to ${batchLimit} more messages this hour/day${colors.reset}`);

  // Initialize Instagram automation
  const instagram = new InstagramAutomation();
  await instagram.init();
  await instagram.login();

  // Process each location
  for (const location of Object.keys(restaurantData)) {
    console.log(`\n${colors.bgBlue}${colors.white} MESSAGING RESTAURANTS IN ${location.toUpperCase()} ${colors.reset}`);

    const restaurants = restaurantData[location];
    let locationDMCount = 0;
    let currentHourlyCount = hourly;

    // Process each restaurant
    for (const [restaurantName, restaurant] of Object.entries(restaurants)) {
      // Check hourly limit before each message
      if (currentHourlyCount >= 25) {
        console.log(`${colors.yellow}Hourly message limit reached during execution. Stopping.${colors.reset}`);
        break;
      }

      // Check if we've hit our batch limit
      if (locationDMCount >= batchLimit) {
        console.log(`${colors.yellow}Batch limit of ${batchLimit} messages reached. Stopping.${colors.reset}`);
        break;
      }

      // Skip if no Instagram link
      if (!restaurant.socialMedia?.instagram) {
        console.log(`${colors.yellow}No Instagram link for ${restaurantName}, skipping...${colors.reset}`);
        continue;
      }

      // Skip if already messaged
      if (isRestaurantMessaged(restaurantName)) {
        console.log(`${colors.yellow}Already messaged ${restaurantName}, skipping...${colors.reset}`);
        continue;
      }

      console.log(`\n${colors.bright}${colors.blue}Processing ${restaurantName}${colors.reset}`);

      // Extract Instagram username from URL
      const instagramURL = restaurant.socialMedia.instagram;
      const username = extractInstagramUsername(instagramURL);

      if (!username) {
        console.log(`${colors.yellow}Couldn't extract username from ${instagramURL}, skipping...${colors.reset}`);
        continue;
      }

      console.log(`${colors.cyan}Extracted username: ${username}${colors.reset}`);

      // Generate personalized message
      const message = generateMessage(restaurant);

      // Try to send DM with retries
      let success = false;
      let retryCount = 0;

      while (!success && retryCount < 2) {
        if (retryCount > 0) {
          console.log(`${colors.yellow}Retry attempt ${retryCount} for ${restaurantName}${colors.reset}`);
          await humanDelay(10000, 15000);
        }

        success = await instagram.sendMessage(username, message);
        retryCount++;
      }

      if (success) {
        // Save the message with timestamp
        saveMessagedRestaurant(restaurantName);
        locationDMCount++;
        currentHourlyCount++;
      }

      // Wait between messages (20-30s + engagement time)
      if (Object.keys(restaurants).length > locationDMCount) {
        console.log(`${colors.cyan}Waiting before next message...${colors.reset}`);
        await humanDelay();
      }
    }

    console.log(`${colors.green}Sent ${locationDMCount} DMs in ${location}${colors.reset}`);
  }

  // Clean up
  await instagram.close();

  console.log(`\n${colors.bgGreen}${colors.white} DM CAMPAIGN COMPLETED ${colors.reset}`);
})();

const messagedRestaurantsPath = path.join(process.cwd(), 'output', 'messaged_restaurants.json');
