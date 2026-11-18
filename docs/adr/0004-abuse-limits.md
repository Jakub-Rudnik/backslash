# 4. Rate limits and quotas

- Status: accepted
- Date: 2026-11-18

## Context

Anyone can sign up. Without limits one account (or a script) can fill the disk with uploads, keep the compile queue busy for everyone, guess passwords or open thousands of WebSockets.

## Decision

- **One counter store in Valkey**, fixed windows keyed by user (or IP when signed out). The API and Better Auth use the same store, so limits survive restarts and hold across instances.
- **Auth, per IP:** 10 sign-ins per minute, 10 sign-ups per hour, 3 password reset mails per minute. The API passes the client IP to Better Auth in its own header and overwrites whatever the client sent, so it can't be spoofed.
- **API, per user:** 600 requests per minute overall, 20 compiles per minute, 300 uploads per minute, 30 new projects and 60 invite links per hour, 20 invite uses per minute.
- **Quotas:** 100 owned projects and 1 GB of uploaded files per user (configurable). Uploads count against the project owner, whoever uploads them, and each file counts once.
- **Collab:** at most 20 WebSocket connections per user. A doc over 50 MB becomes read-only, so the database can't be filled through edits.

## Alternatives

- **`@fastify/rate-limit`**: would cover the API but not Better Auth, which needs its own store anyway. A 20-line counter serves both.
- **Limits only at the reverse proxy**: it only sees IPs, not users or projects.

## Consequences

- The client IP is only right when the API sees the real client or its proxy is trusted (`TRUST_PROXY`). Behind Docker or a tunnel this has to be set, or every client shares one IP and its limits.
- In dev, everything comes through the Vite proxy from 127.0.0.1, so all local users share the per-IP auth limits.
- The quota check and the upload aren't atomic: parallel uploads can go slightly over the quota.
