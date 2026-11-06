# compiler

BullMQ worker consuming the `compile` queue. Writes `main.tex` to `COMPILE_DIR/<jobId>/`, runs `latexmk`, returns a `CompileResult`. The API serves `main.pdf` from the same dir.

Requires `latexmk` + `pdflatex` on PATH and a running Valkey.

```bash
cp .env.example .env
vp run dev
```

`COMPILE_TIMEOUT_MS` must be lower than the API wait (60s).
