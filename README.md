<p align="center">
  <img src=".github/assets/logo.svg" width="96" height="96" alt="backslash logo" />
</p>

<h1 align="center">backslash</h1>

<p align="center">LaTeX editor in the browser.</p>

## Development

- Start Postgres and Valkey:

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
