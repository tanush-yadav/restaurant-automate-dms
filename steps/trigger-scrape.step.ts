import { ApiRouteConfig, StepHandler } from 'motia';
import { z } from 'zod';

const schema = z.object({
  location: z.string(),
  maxRestaurants: z.number().optional().default(30)
});

export const config: ApiRouteConfig = {
  type: 'api',
  name: 'TriggerScrape',
  description: 'API endpoint to trigger restaurant scraping for a location',
  path: '/api/trigger-scrape',
  method: 'POST',
  emits: [{
    topic: 'restaurants.scrape.requested',
    label: 'Restaurant scrape requested'
  }],
  bodySchema: schema,
  flows: ['restaurant-automation']
};

export const handler: StepHandler<typeof config> = async (req, { logger, emit }) => {
  const payload = schema.parse(req.body);
  logger.info('Received scrape request', payload);

  await emit({
    topic: 'restaurants.scrape.requested',
    data: payload
  });

  return {
    status: 200,
    body: {
      message: `Started restaurant scraping for ${payload.location}`,
      location: payload.location,
      maxRestaurants: payload.maxRestaurants
    }
  };
};