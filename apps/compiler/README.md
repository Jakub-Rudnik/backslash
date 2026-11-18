# compiler

BullMQ worker consuming the `compile` queue. Writes the project files to `COMPILE_DIR/<jobId>.input/`, runs `latexmk -jobname=output -file-line-error <mainFile>` in a bubblewrap sandbox (see `docs/adr/0001-compile-sandbox.md`) and returns a `CompileResult` (errors carry project-relative file + line). The files the build produced, including `output.pdf`, land in `COMPILE_DIR/<jobId>/`, where the API serves the PDF from. After a successful build these files (minus the project's own) become the project's build cache in `CACHE_DIR/<projectId>/`, which the next compile starts from; a failed build clears it, and it expires 15 minutes after the last compile.

Requires Linux, `bwrap` (bubblewrap >= 0.10), `latexmk` + `pdflatex` and a running Valkey. The worker exits on startup when the sandbox can't run.

```bash
cp .env.example .env
vp run dev
```

`COMPILE_TIMEOUT_MS` must be lower than the API wait (60s).
