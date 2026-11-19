import type { RateLimitStore, RateRule } from "@backslash/db/auth";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Valkey } from "iovalkey";
import * as z from "zod";

export const RATE_LIMITS = {
  api: { window: 60, max: 600 },
  compile: { window: 60, max: 20 },
  upload: { window: 60, max: 300 },
  createProject: { window: 3600, max: 30 },
  createInvite: { window: 3600, max: 60 },
  useInvite: { window: 60, max: 20 },
} satisfies Record<string, RateRule>;

export type RateLimitName = keyof typeof RATE_LIMITS;

const CONSUME = `
local count = redis.call("INCR", KEYS[1])
if count == 1 then redis.call("EXPIRE", KEYS[1], ARGV[1]) end
return { count, redis.call("TTL", KEYS[1]) }
`;
const ConsumeResult = z.tuple([z.number(), z.number()]);

export function valkeyRateLimits(valkey: Valkey): RateLimitStore {
  return {
    async consume(key, rule) {
      const [count, ttl] = ConsumeResult.parse(
        await valkey.eval(CONSUME, 1, `ratelimit:${key}`, rule.window),
      );
      return count <= rule.max
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: Math.max(ttl, 1) };
    },
  };
}

export function memoryRateLimits(): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async consume(key, rule) {
      const now = Date.now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= now) {
        entry = { count: 0, resetAt: now + rule.window * 1000 };
        windows.set(key, entry);
      }
      entry.count += 1;
      return entry.count <= rule.max
        ? { allowed: true, retryAfter: null }
        : { allowed: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
    },
  };
}

/** Counts the request against a limit (per user, or per IP when signed out); sends 429 when over. */
export async function rateLimit(
  store: RateLimitStore,
  req: FastifyRequest,
  reply: FastifyReply,
  name: RateLimitName,
): Promise<boolean> {
  const who = req.user ? `user:${req.user.id}` : `ip:${req.ip}`;
  const { allowed, retryAfter } = await store.consume(`${name}:${who}`, RATE_LIMITS[name]);
  if (allowed) return true;
  const seconds = retryAfter ?? RATE_LIMITS[name].window;
  reply
    .code(429)
    .header("retry-after", String(seconds))
    .send({ error: `Too many requests, try again in ${seconds}s` });
  return false;
}
