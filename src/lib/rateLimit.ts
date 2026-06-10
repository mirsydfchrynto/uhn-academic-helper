import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Allow local development to bypass rate limit if no redis URL is provided
const isUpstashConfigured = process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN;

// Create a new ratelimiter, that allows 20 requests per day per user
export const ratelimit = isUpstashConfigured
  ? new Ratelimit({
      redis: Redis.fromEnv(),
      limiter: Ratelimit.slidingWindow(20, "1 d"),
      analytics: true,
      // Optional prefix for the keys
      prefix: "@upstash/ratelimit",
    })
  : null;

/**
 * Validates whether the user has exceeded their quota.
 * @param identifier The user's ID or Email
 * @returns { success: boolean, limit: number, remaining: number, reset: number }
 */
export async function checkRateLimit(identifier: string) {
  if (!ratelimit) {
    // Bypass if not configured (e.g., local development)
    return { success: true, limit: 100, remaining: 99, reset: 0 };
  }

  return await ratelimit.limit(identifier);
}
