import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "./client.ts";
import { account, session, user, verification } from "./schema/auth.ts";

export type RateRule = { window: number; max: number };

/** Counts requests per key in fixed windows (seconds); shared by Better Auth and the API. */
export type RateLimitStore = {
  consume(key: string, rule: RateRule): Promise<{ allowed: boolean; retryAfter: number | null }>;
};

/** Header the API sets from the connection (never taken from the client) for per-IP limits. */
export const CLIENT_IP_HEADER = "x-backslash-client-ip";

export type AuthOptions = {
  db: Db;
  secret: string;
  /** public URL of the web app, e.g. https://latex.example.com (OAuth callbacks go there) */
  baseURL: string;
  /** extra origins allowed to call the auth API; same-origin requests are always allowed */
  trustedOrigins: string[];
  github?: { clientId: string; clientSecret: string } | undefined;
  /** rate limits sign-in, sign-up and password resets per IP; off when not given */
  rateLimits?: RateLimitStore | undefined;
  /** sends the password reset link; password reset is off when not given */
  sendResetPassword?:
    | ((user: { email: string; name: string }, url: string) => Promise<void>)
    | undefined;
};

export const MAX_NAME_LENGTH = 80;

function checkName(name: unknown) {
  if (name === undefined) return;
  if (typeof name !== "string" || !name.trim() || name.length > MAX_NAME_LENGTH) {
    throw new APIError("BAD_REQUEST", {
      message: `Name must be 1-${MAX_NAME_LENGTH} characters`,
    });
  }
}

export function createAuth({
  db,
  secret,
  baseURL,
  trustedOrigins,
  github,
  rateLimits,
  sendResetPassword,
}: AuthOptions) {
  return betterAuth({
    secret,
    baseURL,
    basePath: "/api/auth",
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: sendResetPassword
        ? async ({ user, url }) => {
            sendResetPassword(user, url).catch((err: unknown) =>
              console.error("sending password reset mail failed:", err),
            );
          }
        : undefined,
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => ({
            data: {
              ...user,
              name: user.name.trim().slice(0, MAX_NAME_LENGTH) || user.email.split("@")[0]!,
            },
          }),
        },
        update: { before: async (user) => checkName(user.name) },
      },
    },
    socialProviders: github ? { github } : {},
    trustedOrigins: (request) => {
      const host = request?.headers.get("host");
      const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
      return [...trustedOrigins, host ? `${proto}://${host}` : null];
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    rateLimit: {
      enabled: rateLimits !== undefined,
      window: 60,
      max: 100,
      customStorage: rateLimits,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 3600, max: 10 },
      },
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
      ipAddress: { ipAddressHeaders: [CLIENT_IP_HEADER] },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;

export type SessionUser = { id: string; name: string; email: string; image?: string | null };

/** Session from request headers (cookie), or null. */
export async function getSessionUser(auth: Auth, headers: Headers): Promise<SessionUser | null> {
  const result = await auth.api.getSession({ headers });
  return result?.user ?? null;
}
