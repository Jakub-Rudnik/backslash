# 5. Deploy with Docker Compose behind Caddy

- Status: accepted
- Date: 2026-11-18

## Context

ADR 3 puts everything on one machine behind a TLS reverse proxy. The compile sandbox (ADR 1) creates user, mount and PID namespaces, which Docker blocks by default. The per-IP auth limits (ADR 4) need the real client IP, and clients must not be able to set it.

## Decision

- **One compose file in `deploy/`** with Caddy, api, collab, compiler, Postgres and Valkey. One multi-stage `Dockerfile` builds all images. Caddy serves the web build and proxies `/api` and `/collab`. Only Caddy publishes ports.
- **Caddy gets certificates itself** when `SITE_ADDRESS` is a domain. Behind a tunnel that terminates TLS, it serves plain HTTP and trusts the tunnel's `X-Forwarded-For` (`TRUSTED_PROXIES`).
- **Client IP:** Caddy replaces `X-Forwarded-*` from clients it doesn't trust. The API trusts private addresses (`TRUST_PROXY=uniquelocal`), which only Caddy and the other containers have, so it takes the client IP from Caddy's header.
- **Compiler container:** non-root, all capabilities dropped, `no-new-privileges`. It uses Docker's default seccomp profile plus `clone`, `unshare`, `mount`, `umount2` and `pivot_root`, so bwrap can create namespaces as an unprivileged user. `systempaths=unconfined` lets bwrap mount a fresh `/proc`, which the kernel refuses while Docker's masks are on `/proc`. `apparmor=unconfined` is set because Docker's AppArmor profile denies `mount`.
- **Migrations** run when api and collab start (under an advisory lock), so a deploy is `docker compose up -d --build`.

## Alternatives

- **`privileged: true` or `CAP_SYS_ADMIN`** for the compiler: works, but gives the container root-level control of the host.
- **bwrap with `--bind /proc`** instead of a new `/proc`: then the sandbox could see the worker's processes and their environment.
- **nginx or Traefik**: need extra setup for certificates; Caddy does HTTPS with one line.

## Consequences

- The compiler container can read unmasked `/proc` files, but runs as a non-root user without capabilities, so the root-only ones stay closed.
- Hosts that restrict unprivileged user namespaces (Ubuntu 23.10+ with `kernel.apparmor_restrict_unprivileged_userns=1`) need that setting turned off or an AppArmor profile that allows `userns`, or the compiler won't start.
- If Docker's address pools are changed to non-private ranges, `TRUST_PROXY` must be changed to match, or all clients share Caddy's IP.
