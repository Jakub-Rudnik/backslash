# 1. Sandbox every compile with bubblewrap

- Status: accepted
- Date: 2026-11-18

## Context

LaTeX documents are untrusted input. Even without shell escape, `\input{/any/path}` reads any file the compiler process can read and puts it into the PDF: `.env` secrets, other users' blobs and compile dirs, the host user's home. Writes were already limited to the job dir (`openout_any=p`), reads were not. Disk use of a single compile was unbounded.

## Decision

Every compile runs in a fresh [bubblewrap](https://github.com/containers/bubblewrap) sandbox, created for that job only and gone when it ends:

- Read-only TeX Live (`/usr`, `/etc/texmf`, `/var/lib/texmf`, ...). No `/home`, no app files, no blobs, no other jobs.
- The job's input files mounted read-only. The build runs in a size-limited tmpfs; the files it produced are copied to the job's output dir at the end.
- No network, no host environment variables, own PID namespace.
- Limits: tmpfs size (disk), `ulimit` on memory and processes, wall-clock timeout.
- The worker refuses to start when the sandbox can't run, so compiles never fall back to running unsandboxed.

## Alternatives

- **No sandbox**, as in the Overleaf Community Edition: only safe with fully trusted users.
- **A Docker container per compile**, as Overleaf's sandboxed compiles do: the same isolation, but ~0.3-0.5 s startup per compile, and the worker needs `docker.sock`, which is root on the host.
- **A long-lived pod or sandbox per user or project**, stopped after inactivity: needs routing to the right pod, an idle reaper and access to the Kubernetes API from the app. State left over from one compile can leak into the next. The useful part, warm incremental compiles, comes from a per-project cache instead (ADR 2).

## Consequences

- Sandbox startup costs milliseconds, so one sandbox per compile is cheap.
- Linux only, needs bubblewrap >= 0.10 and unprivileged user namespaces. In Docker, the compiler container needs a seccomp profile that allows creating namespaces.
- It shares the host kernel, like a container. If a stronger boundary is needed later (gVisor, Firecracker), only the runner in `apps/compiler/src/sandbox.ts` changes.
- tmpfs counts against RAM: worst case is the disk limit times the worker concurrency.
