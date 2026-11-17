# compiler

BullMQ worker consuming the `compile` queue. Writes the project files to `COMPILE_DIR/<jobId>/`, runs `latexmk -jobname=output -file-line-error <mainFile>` from the project root, returns a `CompileResult` (errors carry project-relative file + line). The API serves `output.pdf` from the same dir.

Requires `latexmk` + `pdflatex` on PATH and a running Valkey.

```bash
cp .env.example .env
vp run dev
```

`COMPILE_TIMEOUT_MS` must be lower than the API wait (60s).
