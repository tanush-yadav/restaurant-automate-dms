import { chromium, type Page } from '@playwright/test'
import * as fs from 'fs'
import { EventConfig, StepHandler } from 'motia'
import * as path from 'path'
import { z } from 'zod'

const inputSchema = z.object({
  location: z.string(),
})

export const config: EventConfig<typeof inputSchema> = {
  type: 'event',
  name: 'SendDM',
  description: 'Sends Instagram DMs to restaurants',
  subscribes: ['restaurants.enriched'],
  emits: [
    {
      topic: 'dm.status.updated',
      label: 'DM status updated',
    },
  ],
  input: inputSchema,
  flows: ['restaurant-automation'],
}

// File paths
const outputDir = path.resolve(process.cwd(), 'output')
const restaurantsJsonPath = path.join(outputDir, 'restaurants.json')
const messagedRestaurantsJsonPath = path.join(outputDir, 'messaged_restaurants.json')
const cookiesJsonPath = path.join(outputDir, 'instagram_cookies.json')
const dmCountJsonPath = path.join(outputDir, 'daily_dm_count.json')

// Function to load restaurants from JSON file
function loadRestaurants(): Record<string, Record<string, any>> {
  try {
    if (fs.existsSync(restaurantsJsonPath)) {
      const jsonData = fs.readFileSync(restaurantsJsonPath, 'utf8')
      return JSON.parse(jsonData)
    }
  } catch (error) {
    console.error('Error loading restaurants.json:', error)
  }
  return {}
}

// Function to load messaged restaurants
function loadMessagedRestaurants(): Record<string, boolean> {
  try {
    if (fs.existsSync(messagedRestaurantsJsonPath)) {
      const jsonData = fs.readFileSync(messagedRestaurantsJsonPath, 'utf8')
      return JSON.parse(jsonData)
    }
  } catch (error) {
    console.error('Error loading messaged_restaurants.json:', error)
  }
  return {}
}

// Function to save messaged restaurants
function saveMessagedRestaurants(messaged: Record<string, boolean>): void {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    fs.writeFileSync(messagedRestaurantsJsonPath, JSON.stringify(messaged, null, 2))
  } catch (error) {
    console.error('Error saving messaged_restaurants.json:', error)
  }
}

// Function to load Instagram cookies
function getInstagramCookies(): any {
  try {
    if (fs.existsSync(cookiesJsonPath)) {
      const jsonData = fs.readFileSync(cookiesJsonPath, 'utf8')
      return JSON.parse(jsonData)
    }
  } catch (error) {
    console.error('Error loading Instagram cookies:', error)
  }
  return null
}

// Function to save Instagram cookies
function saveInstagramCookies(cookies: any): void {
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    fs.writeFileSync(cookiesJsonPath, JSON.stringify(cookies, null, 2))
  } catch (error) {
    console.error('Error saving Instagram cookies:', error)
  }
}

// Function to get daily DM count
function getDailyDMCount(): number {
  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD

    if (fs.existsSync(dmCountJsonPath)) {
      const jsonData = fs.readFileSync(dmCountJsonPath, 'utf8')
      const data = JSON.parse(jsonData)
      return data[today] || 0
    }
  } catch (error) {
    console.error('Error getting daily DM count:', error)
  }
  return 0
}

// Function to increment daily DM count
function incrementDailyDMCount(): number {
  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    let data: Record<string, number> = {}

    if (fs.existsSync(dmCountJsonPath)) {
      const jsonData = fs.readFileSync(dmCountJsonPath, 'utf8')
      data = JSON.parse(jsonData)
    }

    const currentCount = data[today] || 0
    data[today] = currentCount + 1

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }
    fs.writeFileSync(dmCountJsonPath, JSON.stringify(data, null, 2))

    return data[today]
  } catch (error) {
    console.error('Error incrementing daily DM count:', error)
    return 0
  }
}

class InstagramAutomation {
  private browser: any = null
  private context: any = null
  private page: Page | null = null
  private readonly MAX_HOURLY_MESSAGES = 25
  private readonly MAX_DAILY_MESSAGES = 100

  async init() {
    this.browser = await chromium.launch({
      headless: false,
      args: ['--disable-blink-features=AutomationControlled']
    })

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
    })

    this.page = await this.context.newPage()

    // Restore cookies if available
    const cookiesData = getInstagramCookies()
    if (cookiesData) {
      try {
        await this.context.addCookies(cookiesData)
      } catch (error) {
        console.error('Error restoring cookies:', error)
      }
    }
  }

  async login(logger: any) {
    if (!this.page) throw new Error('Browser not initialized')

    try {
      logger.info('Navigating to Instagram login...')
      // Use domcontentloaded instead of networkidle for more reliable loading
      await this.page.goto('https://www.instagram.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      })

      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check if we're already logged in by looking for common elements
      let isLoggedIn = false;
      const loginIndicators = [
        'svg[aria-label="Home"]',
        'a[href="/direct/inbox/"]',
        'span[role="link"]:has-text("Search")',
        'a[href="/explore/"]',
        'svg[aria-label="New post"]'
      ];

      for (const selector of loginIndicators) {
        try {
          const element = await this.page.$(selector);
          if (element) {
            isLoggedIn = true;
            logger.info(`Already logged in (detected ${selector})`);
            break;
          }
        } catch (e) {
          // Continue checking other selectors
        }
      }

      // If not logged in, go to login page and authenticate
      if (!isLoggedIn) {
        logger.info('Not logged in, navigating to login page...');

        await this.page.goto('https://www.instagram.com/accounts/login/', {
          waitUntil: 'domcontentloaded', // More reliable than networkidle
          timeout: 60000,
        });

        // Wait for login form to appear
        const loginFormSelector = 'form[id="loginForm"]';
        try {
          const loginForm = await this.page.waitForSelector(loginFormSelector, { timeout: 15000 });

          if (loginForm) {
            logger.info('Logging in to Instagram...');

            // Fill credentials with a small delay between actions
            await this.page.fill('input[name="username"]', process.env.INSTAGRAM_USERNAME!);
            await new Promise(resolve => setTimeout(resolve, 1000));

            await this.page.fill('input[name="password"]', process.env.INSTAGRAM_PASSWORD!);
            await new Promise(resolve => setTimeout(resolve, 1000));

            await this.page.click('button[type="submit"]');

            logger.info('Waiting for verification...');
            await new Promise((resolve) => setTimeout(resolve, 60000));

            // Save cookies after successful login
            const cookies = await this.context.cookies();
            saveInstagramCookies(cookies);
          }
        } catch (e) {
          logger.warn('Could not find login form, may already be logged in');
        }
      }

      // Verify login by navigating to home page
      logger.info('Verifying login status...');
      await this.page.goto('https://www.instagram.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000,
      });

      // Wait longer for the page to stabilize
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Check multiple indicators of login status
      isLoggedIn = false;
      for (const selector of loginIndicators) {
        try {
          const element = await this.page.waitForSelector(selector, {
            timeout: 5000,
            state: 'visible'
          });
          if (element) {
            isLoggedIn = true;
            logger.info(`Login verified with selector: ${selector}`);
            break;
          }
        } catch (e) {
          // Selector not found, try next
        }
      }

      if (!isLoggedIn) {
        // Attempt a screenshot before failing if possible
        try {
          const screenshotPath = path.join(outputDir, `login_failure_${Date.now()}.png`);
          await this.page.screenshot({ path: screenshotPath });
          logger.error(`Login verification failed. Screenshot saved to ${screenshotPath}`);
        } catch (screenshotError) {
          logger.error('Login verification failed. Also failed to take screenshot.', screenshotError);
        }
        throw new Error('Login verification failed. Could not find any standard login indicators.');
      }

      logger.info('Successfully logged in to Instagram');
    } catch (error) {
      logger.error('Login failed:', error);
      throw error;
    }
  }

  async sendMessage(
    username: string,
    message: string,
    logger: any
  ): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized')

    try {
      logger.info(`Sending message to ${username}...`)

      // Use a more resilient page loading strategy
      await this.page.goto(`https://www.instagram.com/${username}/`, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      // Wait for any of these selectors to appear, indicating the profile loaded
      logger.info('Waiting for profile to load...')
      await Promise.race([
        this.page.waitForSelector('header section', { timeout: 30000 }),
        this.page.waitForSelector('article', { timeout: 30000 }),
        this.page.waitForSelector('main[role="main"]', { timeout: 30000 })
      ])

      // Wait a moment for page to stabilize
      await new Promise(resolve => setTimeout(resolve, 3000))

      // Look for the Message button in different possible locations
      logger.info('Looking for message button...')
      let messageButton = null

      // Try different button selectors
      const buttonSelectors = [
        'div[role="button"]:has-text("Message")',
        'button:has-text("Message")',
        'a[role="button"]:has-text("Message")',
        'div._acan._acap._acas:has-text("Message")',
        '//div[contains(text(), "Message")]',  // XPath as fallback
        '//button[contains(text(), "Message")]'
      ]

      for (const selector of buttonSelectors) {
        try {
          if (selector.startsWith('//')) {
            // Handle XPath selectors
            messageButton = await this.page.$(`xpath=${selector}`)
          } else {
            messageButton = await this.page.$(selector)
          }
          if (messageButton) break
        } catch (e) {
          continue
        }
      }

      if (!messageButton) {
        // If no message button found, try going to DMs directly
        logger.info('Message button not found, trying direct message approach...')

        await this.page.goto('https://www.instagram.com/direct/new/', {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        })

        // Wait for the search box with multiple possible selectors
        const searchSelectors = [
          'input[placeholder="Search..."]',
          'input[aria-label="Search"]',
          'input[type="text"]'
        ]

        let searchBox = null
        for (const selector of searchSelectors) {
          searchBox = await this.page.$(selector)
          if (searchBox) break
        }

        if (!searchBox) {
          throw new Error('Could not find search input')
        }

        // Fill in the username
        await this.page.fill(searchSelectors[0], username)
        await new Promise(resolve => setTimeout(resolve, 2000))

        // Try different approaches to select the user
        try {
          // First try clicking the username text
          await this.page.click(`text="${username}"`)
        } catch (e) {
          // If that fails, try finding a checkbox or similar element
          const userElements = await this.page.$$('label, div[role="button"]')
          for (const element of userElements) {
            const text = await element.textContent()
            if (text?.includes(username)) {
              await element.click()
              break
            }
          }
        }

        await new Promise(resolve => setTimeout(resolve, 2000))

        // Look for and click the Next button
        const nextButton = await this.page.$('button:has-text("Next")')
        if (nextButton) {
          await nextButton.click()
        } else {
          throw new Error('Could not find Next button')
        }
      } else {
        // Click the message button if found on profile
        await messageButton.click()
      }

      await new Promise(resolve => setTimeout(resolve, 3000))

      // Wait for the message input with multiple possible selectors
      logger.info('Waiting for message input...')
      const messageInputSelectors = [
        'textarea[placeholder="Message..."]',
        'textarea[aria-label="Message"]',
        'div[contenteditable="true"]',
        'div[role="textbox"]',
        'div[aria-label="Message"]'
      ]

      let messageInput = null
      for (const selector of messageInputSelectors) {
        try {
          messageInput = await this.page.waitForSelector(selector, { timeout: 10000, state: 'visible' })
          if (messageInput) {
            logger.info(`Found message input using selector: ${selector}`)
            break
          }
        } catch (e) {
          continue
        }
      }

      if (!messageInput) {
        throw new Error('Message input not found')
      }

      // Type the message with human-like delays
      logger.info('Typing message...')

      // Clear any existing text first
      await messageInput.click()
      await this.page.keyboard.press('Control+A')
      await this.page.keyboard.press('Backspace')
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Type the message character by character with random pauses
      for (const char of message) {
        await messageInput.type(char, { delay: 100 })
        if (Math.random() < 0.1) { // 10% chance of a longer pause
          await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300))
        }
      }

      await new Promise(resolve => setTimeout(resolve, 2000))

      // Try different methods to send the message
      logger.info('Sending message...')
      let sent = false

      // Method 1: Press Enter
      try {
        await messageInput.press('Enter')
        sent = true
      } catch (e) {
        logger.info('Enter key method failed, trying alternative...')
      }

      // Method 2: Click the send button if Enter didn't work
      if (!sent) {
        try {
          const sendButtonSelectors = [
            'button[type="submit"]',
            'button:has-text("Send")',
            'div[role="button"]:has-text("Send")',
            'svg[aria-label="Send Message"]'
          ]

          for (const selector of sendButtonSelectors) {
            const sendButton = await this.page.$(selector)
            if (sendButton) {
              await sendButton.click()
              sent = true
              break
            }
          }
        } catch (e) {
          logger.info('Send button method failed')
        }
      }

      if (!sent) {
        throw new Error('Failed to send message')
      }

      await new Promise(resolve => setTimeout(resolve, 3000))

      // Verify message was sent by checking for various indicators
      let messageVerified = false
      try {
        // Try multiple verification methods
        const verificationMethods = [
          async () => await this.page!.waitForSelector(`text="${message.substring(0, 20)}..."`, { timeout: 5000 }),
          async () => await this.page!.waitForSelector('div[aria-label="Sent"]', { timeout: 5000 }),
          async () => await this.page!.waitForSelector('span:has-text("Sent")', { timeout: 5000 })
        ]

        for (const verify of verificationMethods) {
          try {
            await verify()
            messageVerified = true
            break
          } catch (e) {
            continue
          }
        }
      } catch (e) {
        logger.info('Could not verify if message was sent. Continuing anyway...')
      }

      if (messageVerified) {
        logger.info(`Message sent and verified to ${username}!`)
      } else {
        logger.info(`Message sent but could not verify to ${username}`)
      }

      return true
    } catch (error) {
      logger.error(`Failed to send message to ${username}:`, error)

      // Take a screenshot on error for debugging
      try {
        const screenshotPath = path.join(outputDir, `error_${username}_${Date.now()}.png`)
        await this.page.screenshot({ path: screenshotPath, fullPage: true })
        logger.info(`Error screenshot saved to: ${screenshotPath}`)
      } catch (e) {
        logger.error('Failed to save error screenshot:', e)
      }

      return false
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close()
    }
  }
}

function generateMessage(restaurantName: string): string {
  const firstWord = restaurantName.split(' ')[0]
  return `Hello from Zoe! I help restaurants like ${firstWord} handle up to 100 calls a day, 30 at once, and send orders straight to your CRM, POS, or kitchen printer. Would you like to see a 60-second demo?`
}

function extractInstagramUsername(url: string): string | null {
  if (!url) return null
  const match = url.match(/instagram\.com\/([A-Za-z0-9_\.]+)/)
  return match ? match[1] : null
}

// Add these new functions to track DM counts
function getMessageCounts(): { hourly: number; daily: number } {
  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const currentHour = new Date().getHours()
    const currentHourKey = `${currentHour}h`

    let result = { hourly: 0, daily: 0 }

    if (fs.existsSync(messagedRestaurantsJsonPath)) {
      const data = JSON.parse(fs.readFileSync(messagedRestaurantsJsonPath, 'utf8'))

      // Check if today's data exists
      if (data[today]) {
        // Count total messages for today
        let dailyCount = 0
        for (const hour in data[today]) {
          const hourMessages = Object.keys(data[today][hour]).length
          dailyCount += hourMessages

          // Count current hour's messages
          if (hour === currentHourKey) {
            result.hourly = hourMessages
          }
        }
        result.daily = dailyCount
      }
    }

    return result
  } catch (error) {
    logger.error('Error getting message counts:', error)
    return { hourly: 0, daily: 0 }
  }
}

function saveMessagedRestaurant(restaurantName: string): void {
  try {
    const today = new Date().toISOString().split('T')[0] // YYYY-MM-DD
    const currentHour = new Date().getHours()
    const currentHourKey = `${currentHour}h`

    let data: Record<string, Record<string, Record<string, boolean>>> = {}

    if (fs.existsSync(messagedRestaurantsJsonPath)) {
      data = JSON.parse(fs.readFileSync(messagedRestaurantsJsonPath, 'utf8'))
    }

    // Initialize nested structure if needed
    if (!data[today]) {
      data[today] = {}
    }

    if (!data[today][currentHourKey]) {
      data[today][currentHourKey] = {}
    }

    // Mark restaurant as messaged
    data[today][currentHourKey][restaurantName] = true

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(messagedRestaurantsJsonPath, JSON.stringify(data, null, 2))
  } catch (error) {
    logger.error('Error saving messaged restaurant:', error)
  }
}

// Replace the existing isRestaurantMessaged function
function isRestaurantMessaged(restaurantName: string): boolean {
  try {
    if (fs.existsSync(messagedRestaurantsJsonPath)) {
      const data = JSON.parse(fs.readFileSync(messagedRestaurantsJsonPath, 'utf8'))

      // Check all days and hours
      for (const day in data) {
        for (const hour in data[day]) {
          if (data[day][hour][restaurantName]) {
            return true
          }
        }
      }
    }
    return false
  } catch (error) {
    logger.error('Error checking if restaurant was messaged:', error)
    return false
  }
}

export const handler: StepHandler<typeof config> = async (
  input,
  { logger, emit }
) => {
  logger.info('Starting DM campaign', { location: input.location })

  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  const instagram = new InstagramAutomation()

  try {
    // Check message limits
    const { hourly, daily } = getMessageCounts()

    logger.info(`Current message counts - Hourly: ${hourly}/${25}, Daily: ${daily}/${100}`)

    if (hourly >= 25) {
      logger.info('Hourly DM limit reached')
      await emit({
        topic: 'dm.status.updated',
        data: {
          location: input.location,
          error: 'Hourly DM limit reached',
          count: 0,
        },
      })
      return
    }

    if (daily >= 100) {
      logger.info('Daily DM limit reached')
      await emit({
        topic: 'dm.status.updated',
        data: {
          location: input.location,
          error: 'Daily DM limit reached',
          count: 0,
        },
      })
      return
    }

    // Calculate remaining message capacity for this batch
    const hourlyRemaining = 25 - hourly
    const dailyRemaining = 100 - daily
    const batchLimit = Math.min(hourlyRemaining, dailyRemaining)

    // Load restaurants from JSON
    let allRestaurants
    try {
      allRestaurants = loadRestaurants()
    } catch (restaurantError) {
      logger.error('Failed to load restaurants:',
        typeof restaurantError === 'object'
          ? JSON.stringify(restaurantError, Object.getOwnPropertyNames(restaurantError))
          : String(restaurantError)
      );
      throw new Error(`Failed to load restaurants: ${restaurantError.message || 'Unknown error'}`);
    }

    const locationKey = input.location.toLowerCase()
    const locationRestaurants = allRestaurants[locationKey] || {}

    // Find restaurants with Instagram links that haven't been messaged yet
    const restaurantsToMessage = []
    for (const [name, restaurant] of Object.entries(locationRestaurants)) {
      const hasInstagram = restaurant.socialMedia?.instagram
      const notMessaged = !isRestaurantMessaged(name)

      if (hasInstagram && notMessaged) {
        restaurantsToMessage.push({
          name,
          instagramUrl: restaurant.socialMedia.instagram,
        })
      }
    }

    if (restaurantsToMessage.length === 0) {
      logger.info('No restaurants need DMs')
      await emit({
        topic: 'dm.status.updated',
        data: {
          location: input.location,
          count: 0,
          message: 'No restaurants to message',
        },
      })
      return
    }

    // Limit to remaining capacity
    const messagesToSend = restaurantsToMessage.slice(0, batchLimit)
    logger.info(`Found ${messagesToSend.length} restaurants to message (limited by hourly/daily caps)`)

    // Initialize browser and login
    try {
      await instagram.init()
      logger.info('Browser initialized successfully')
    } catch (browserError) {
      logger.error('Browser initialization failed:',
        typeof browserError === 'object'
          ? JSON.stringify(browserError, Object.getOwnPropertyNames(browserError))
          : String(browserError)
      );
      throw new Error(`Browser initialization failed: ${browserError.message || 'Unknown error'}`);
    }

    try {
      await instagram.login(logger)
      logger.info('Login completed successfully')
    } catch (loginError) {
      // First log error as string with explicit message and stack
      if (loginError instanceof Error) {
        logger.error(`Login failed - Error message: ${loginError.message}`);
        if (loginError.stack) {
          logger.error(`Login failed - Stack trace: ${loginError.stack}`);
        }
      } else {
        logger.error(`Login failed - Raw error: ${String(loginError)}`);
      }

      // Then log full serialized error object
      logger.error('Login failed - Complete error:',
        typeof loginError === 'object'
          ? JSON.stringify(loginError, Object.getOwnPropertyNames(loginError))
          : String(loginError)
      );

      // Take screenshot if possible
      try {
        if (instagram.page) {
          const screenshotPath = path.join(outputDir, `login_failure_${Date.now()}.png`)
          await instagram.page.screenshot({ path: screenshotPath })
          logger.error(`Login failure screenshot saved to ${screenshotPath}`)
        }
      } catch (screenshotError) {
        logger.error('Failed to capture login failure screenshot')
      }
      throw new Error(`Login failed: ${loginError.message || 'Unknown error'}`)
    }

    let successCount = 0
    let hourlyCount = hourly

    for (const restaurant of messagesToSend) {
      // Double-check hourly limit before each message
      if (hourlyCount >= 25) {
        logger.info('Hourly DM limit reached during execution')
        break
      }

      const username = extractInstagramUsername(restaurant.instagramUrl)
      if (!username) {
        logger.info(`Invalid Instagram URL for ${restaurant.name}`)
        continue
      }

      try {
        const message = generateMessage(restaurant.name)
        logger.info(`Attempting to send message to ${username} (${restaurant.name})`)

        const success = await instagram.sendMessage(username, message, logger)

        if (success) {
          // Save with timestamp
          saveMessagedRestaurant(restaurant.name)
          successCount++
          hourlyCount++
          logger.info(`Successfully sent message to ${restaurant.name}`)
        } else {
          logger.info(`Failed to send message to ${restaurant.name}`)
        }
      } catch (messageError) {
        logger.error(`Error sending message to ${restaurant.name}:`,
          typeof messageError === 'object'
            ? JSON.stringify(messageError, Object.getOwnPropertyNames(messageError))
            : String(messageError)
        );
        // Continue with next restaurant
      }

      // Wait between messages (random delay between 20-30 seconds)
      const waitTime = 20000 + Math.random() * 10000
      logger.info(`Waiting ${Math.round(waitTime/1000)} seconds before next message...`)
      await new Promise((resolve) => setTimeout(resolve, waitTime))
    }

    logger.info(`Campaign completed. Successfully sent ${successCount} DMs`)
    await emit({
      topic: 'dm.status.updated',
      data: {
        location: input.location,
        count: successCount,
        message: `Successfully sent ${successCount} DMs`,
      },
    })
  } catch (error) {
    // Create detailed error message with explicit properties
    let errorDetails = "Unknown error";

    if (error instanceof Error) {
      errorDetails = `Error name: ${error.name}\nMessage: ${error.message}`;
      if (error.stack) {
        errorDetails += `\nStack trace: ${error.stack}`;
      }
    } else {
      errorDetails = String(error);
    }

    // Log verbose error details
    logger.error('DM campaign failed with details:');
    logger.error(errorDetails);

    // Also log serialized error
    logger.error('Raw error object:',
      typeof error === 'object'
        ? JSON.stringify(error, Object.getOwnPropertyNames(error))
        : String(error)
    );

    await emit({
      topic: 'dm.status.updated',
      data: {
        location: input.location,
        error: typeof error === 'object' ? (error.message || JSON.stringify(error)) : String(error),
        count: 0,
      },
    });
  } finally {
    // Always try to close the browser, even if there was an error
    try {
      await instagram.close()
      logger.info('Browser closed successfully')
    } catch (closeError) {
      logger.error('Error closing browser:', closeError)
    }
  }
}