# Restaurant Data Enrichment

This project automates scraping restaurant data, enriching it with social media information, and sending Instagram DMs.

## Prerequisites

- Node.js v16+
- NPM or Yarn

## Setup

1. Clone this repository
2. Install dependencies:

```bash
npm install
# or
yarn install
```

3. Create a `.env` file in the root directory with the following variables:

```
HYPERBROWSER_API_KEY=your_hyperbrowser_api_key
SERPAPI_KEY=your_serpapi_api_key
INSTAGRAM_USERNAME=your_instagram_username
INSTAGRAM_PASSWORD=your_instagram_password
```

- Get a [Hyperbrowser API key](https://hyperbrowser.io/) for web scraping
- Get a [SerpAPI key](https://serpapi.com/) for search results API access
- Add Instagram credentials for an account you'll use to send DMs

## Project Structure

- `src/scrape-restaurants.ts` - Scrapes restaurant data and stores it in JSON format
- `src/enrich-leads.ts` - Enriches restaurant data with Instagram social media links using SerpAPI
- `src/send-dm.ts` - Sends personalized DMs to restaurant Instagram accounts

## Usage

### Scrape Restaurant Data

```bash
npm run scrape
```

This will scrape restaurant data and store it in `output/restaurants.json`.

### Enrich Data with Social Media

```bash
npm run enrich
```

This will enrich the restaurant data with Instagram links using SerpAPI.

### Send Instagram DMs

```bash
npm run send-dm
```

This will send personalized DMs to restaurant Instagram accounts found in the data. The script:
- Extracts usernames from Instagram URLs
- Sends customized messages to each restaurant
- Tracks which restaurants have been messaged to avoid duplicates
- Includes human-like delays (1 min between messages) to avoid rate limiting
- Automatically retries failed messages up to 3 times

### Run Complete Workflow

```bash
npm start
```

This will run the scraping and enrichment scripts in sequence.

## Data Format

The data is stored in a JSON file with the following structure:

```json
{
  "location1": {
    "restaurant1": {
      "name": "Restaurant Name",
      "address": "Address line",
      "phoneNumber": "Phone number",
      "website": "Website URL",
      "googleReviews": "Review rating",
      "menu": "Menu URL",
      "socialMedia": {
        "instagram": "Instagram URL"
      }
    },
    "restaurant2": {
      // ...
    }
  },
  "location2": {
    // ...
  }
}
```

## Debug Mode

To enable debug mode and save screenshots during the scraping process, set the `DEBUG` environment variable:

```bash
DEBUG=true npm run scrape
```
