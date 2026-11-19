<p align="center">
  <img src=".github/assets/logo.svg" width="96" height="96" alt="backslash logo" />
</p>

<h1 align="center">backslash</h1>

<p align="center">A self-hosted LaTeX editor in the browser, for writing together.</p>

Write LaTeX with other people in real time, compile it to PDF on your own server and share projects with other accounts. It runs on one machine with Docker Compose.

> [!NOTE]
> backslash is in alpha (`0.x`). Things can still change or break between versions, including the database schema and the API. Versions follow [SemVer](https://semver.org) and are tagged as releases on GitHub.

## Features

- **Real-time collaboration.** Every project is one shared Yjs document. Edits merge without conflicts, and you see who else is in the project and where their cursor is.
- **Multi-file projects.** Folders, `.tex` and `.bib` files, images and other uploads. Drop in files, folders or a `.zip`, and download the whole project as a `.zip`.
- **Compile to PDF.** `latexmk` with `pdflatex` on a full TeX Live. Errors point to the file and line, and the PDF and the errors show up for everyone in the project.
- **Fast recompiles.** Each project keeps the `.aux`, `.toc` and `.bbl` files of its last build, so the next compile only reruns what changed. Clicks from several people at once become at most two compiles, and the newest PDF always wins.
- **Sharing.** Owner, editor and viewer roles. Invite people with a link, change their role or remove them, and they lose access right away, including open connections.
- **Accounts.** Email and password with password reset mails, or GitHub login.
- **Limits.** Rate limits and per-user quotas, so one account or script can't fill the disk or keep the compiler busy for everyone else.

## Compile sandbox

A LaTeX document is untrusted input. Even without shell escape, `\input{/etc/passwd}` reads any file the compiler can read and puts it in the PDF. So every compile runs in its own [bubblewrap](https://github.com/containers/bubblewrap) sandbox, created for that one job and gone when it ends:

- Only TeX Live is visible, read-only. No app files, no secrets, no other users' uploads or builds.
- No network, no environment variables of the host, its own process namespace.
- The project's files are read-only. The build runs in a size-limited tmpfs, with limits on memory, processes and time.
- Shell escape is off, and TeX can only write inside the build dir.
- The worker refuses to start when the sandbox can't run, so a compile never falls back to running unsandboxed.

Starting a sandbox takes milliseconds, so there's no Docker container per compile and no access to `docker.sock`. In Docker, the compiler container runs as a non-root user without capabilities; only the few syscalls bwrap needs to create namespaces are allowed. It still shares the host kernel, like any container. The reasoning behind this and the alternatives are in [ADR 1](docs/adr/0001-compile-sandbox.md) and [ADR 5](docs/adr/0005-docker-deployment.md).

## How it works

- `apps/web`: React app with CodeMirror for editing and pdf.js for the PDF.
- `apps/api`: Fastify. Accounts, projects, sharing, uploads and compile requests.
- `apps/collab`: Hocuspocus server that syncs the Yjs documents and stores them in Postgres.
- `apps/compiler`: worker that takes compile jobs from a Valkey queue and runs them in the sandbox.

Design decisions are written down in [`docs/adr`](docs/adr).

## Deployment

One machine with Docker Compose: Caddy (HTTPS, serves the web app, proxies `/api` and `/collab`), api, collab, the compiler with TeX Live, Postgres and Valkey.

1. Copy `deploy/.env.example` to `deploy/.env` and fill it in. Secrets: `openssl rand -hex 32`.
2. Start or update (builds the images; migrations run on startup):

   ```bash
   docker compose -f deploy/compose.yml up -d --build
   ```

- **VPS with a domain:** point the DNS record at the server, open ports 80 and 443, set `SITE_ADDRESS=latex.example.com` and `PUBLIC_URL=https://latex.example.com`. Caddy gets the certificate.
- **Cloudflare Tunnel or `tailscale serve`:** the tunnel terminates TLS and forwards to Caddy over HTTP. Set `SITE_ADDRESS=:80`, `HTTP_PORT=127.0.0.1:8080`, `TRUSTED_PROXIES=private_ranges` and `PUBLIC_URL` to the tunnel's URL, and point the tunnel at `http://localhost:8080`.
- **GitHub login** (optional): set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`, callback URL `<PUBLIC_URL>/api/auth/callback/github`.
- **Password reset mails** (optional): set `SMTP_URL` and `MAIL_FROM`.
- **Backups:** data lives in the volumes `postgres-data`, `blobs` (uploads) and `valkey-data`. Back up Postgres (`docker compose -f deploy/compose.yml exec postgres pg_dump -U backslash backslash`) and the `blobs` volume.
- **Ubuntu 23.10+:** the compiler needs unprivileged user namespaces, so set `sysctl kernel.apparmor_restrict_unprivileged_userns=0`. If the compiler exits with "Compile sandbox unavailable", check this first.

## Development

Setup and commands are in [`AGENTS.md`](AGENTS.md).

## License

[MIT](LICENSE)
