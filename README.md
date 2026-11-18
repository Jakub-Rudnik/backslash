<p align="center">
  <img src=".github/assets/logo.svg" width="96" height="96" alt="backslash logo" />
</p>

<h1 align="center">backslash</h1>

<p align="center">LaTeX editor in the browser.</p>

## Development

- Requirements: Node, Docker, TeX Live with `latexmk`, and bubblewrap (`bwrap`, Linux) for the compile sandbox.

- Start Postgres, Valkey and Mailpit (dev inbox for password reset mails at http://localhost:8025):

```bash
docker compose up -d
```

- Configure the apps: copy `.env.example` to `.env` in `apps/api`, `apps/collab` and `apps/compiler`. `BETTER_AUTH_SECRET` and `INTERNAL_SECRET` must be the same in `api` and `collab` (`openssl rand -base64 32`). GitHub login is optional: set `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` (callback URL `<PUBLIC_URL>/api/auth/callback/github`). Migrations run on startup.

- API tests use a separate database:

```bash
docker compose exec postgres psql -U backslash -c "create database backslash_test"
```

- Check everything is ready:

```bash
vp run ready
```

- Run the tests:

```bash
vp run -r test
```

- Build the monorepo:

```bash
vp run -r build
```

- Run the development server:

```bash
vp run dev
```

## Deployment

One machine with Docker Compose: Caddy (HTTPS, serves the web app, proxies `/api` and `/collab`), api, collab, the compiler with TeX Live, Postgres and Valkey. See ADR 5 for the security setup.

- Configure: copy `deploy/.env.example` to `deploy/.env` and fill it in. Secrets: `openssl rand -hex 32`.

- Start or update (builds the images; migrations run on startup):

```bash
docker compose -f deploy/compose.yml up -d --build
```

- **VPS with a domain:** point the DNS record at the server, open ports 80 and 443, set `SITE_ADDRESS=latex.example.com` and `PUBLIC_URL=https://latex.example.com`. Caddy gets the certificate.
- **Cloudflare Tunnel or `tailscale serve`:** the tunnel terminates TLS and forwards to Caddy over HTTP. Set `SITE_ADDRESS=:80`, `HTTP_PORT=127.0.0.1:8080`, `TRUSTED_PROXIES=private_ranges` and `PUBLIC_URL` to the tunnel's URL, and point the tunnel at `http://localhost:8080`.
- Data lives in the volumes `postgres-data`, `blobs` (uploads) and `valkey-data`. Back up Postgres (`docker compose -f deploy/compose.yml exec postgres pg_dump -U backslash backslash`) and the `blobs` volume.
- The compiler needs unprivileged user namespaces. On Ubuntu 23.10+ that means `sysctl kernel.apparmor_restrict_unprivileged_userns=0`; if the compiler exits with "Compile sandbox unavailable", check this first.

## Architecture decisions

See [`docs/adr`](docs/adr).
