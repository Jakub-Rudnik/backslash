import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "./client.ts";
import { account, session, user, verification } from "./schema/auth.ts";

export type AuthOptions = {
  db: Db;
  secret: string;
  /** public URL of the web app, e.g. https://latex.example.com (OAuth callbacks go there) */
  baseURL: string;
  /** extra origins allowed to call the auth API; same-origin requests are always allowed */
  trustedOrigins: string[];
  github?: { clientId: string; clientSecret: string } | undefined;
};

export function createAuth({ db, secret, baseURL, trustedOrigins, github }: AuthOptions) {
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
    },
    socialProviders: github ? { github } : {},
    trustedOrigins: (request) => {
      // same-origin through a proxy (e.g. the dev server opened via a LAN IP). The scheme comes
      // from the proxy; a browser can't set it, so it can't be used to forge a cross-site request
      const host = request?.headers.get("host");
      const proto = request?.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http";
      return [...trustedOrigins, host ? `${proto}://${host}` : null];
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      // refresh the expiry at most once a day
      updateAge: 60 * 60 * 24,
    },
    advanced: {
      database: { generateId: () => crypto.randomUUID() },
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
