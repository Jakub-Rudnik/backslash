# 3. Host the beta on a single machine

- Status: accepted
- Date: 2026-11-18

## Context

The first users are a handful of friends testing the app. Cost should stay close to zero, and the setup should not lock out a bigger deployment later.

## Decision

- **Now:** run everything on one machine (`docker compose` for Postgres and Valkey, the apps next to them) and share it privately over [Tailscale](https://tailscale.com), or over a Cloudflare Tunnel when testers can't install anything. No open ports, HTTPS from the tunnel.
- **Public beta:** one VPS (e.g. Hetzner, ~5-10 EUR/month) with the same compose setup behind a TLS reverse proxy.
- **Kubernetes** only when one machine is not enough, and then first for compile workers.

## Alternatives

- **Kubernetes or managed services from the start**: cost and operational work that buys nothing at this size.

## Consequences

- One machine is a single point of failure: backups of Postgres and the blob dir are required before real users rely on it.
- Compile workers consume a queue and keep no state outside the job and the project cache, so they scale out by adding replicas. Collab runs as one instance; scaling it needs routing projects to instances.
- Hosting on a personal computer makes the compile sandbox (ADR 1) mandatory before anyone else gets access.
