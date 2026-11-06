import type { CompileJobData, CompileResult } from "@backslash/shared";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./config.ts";
import { parseLog } from "./parse-log.ts";

const MAX_LOG_LENGTH = 200_000;

type RunResult = { code: number | null; timedOut: boolean; output: string };

function runLatexmk(cwd: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "latexmk",
      [
        "-pdf",
        "-norc",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        "main.tex",
      ],
      {
        cwd,
        // own process group so the timeout also kills pdflatex spawned by latexmk
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: {
          ...process.env,
          // don't wrap log lines at 79 chars
          max_print_line: "10000",
          // block writes outside the job dir. NOTE: reads are NOT restricted
          // (\input{/etc/passwd} works) - needs a sandbox (docker/bwrap)
          openout_any: "p",
        },
      },
    );

    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < MAX_LOG_LENGTH) output += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // already exited
      }
    }, timeoutMs);

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, timedOut, output });
    });
  });
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function compileJob(
  jobId: string,
  { source }: CompileJobData,
): Promise<CompileResult> {
  const dir = join(env.COMPILE_DIR, jobId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "main.tex"), source);

  const run = await runLatexmk(dir, env.COMPILE_TIMEOUT_MS);

  const texLog = await readFile(join(dir, "main.log"), "utf8").catch(() => null);
  const log = (texLog ?? run.output).slice(0, MAX_LOG_LENGTH);

  if (run.timedOut) {
    return {
      status: "error",
      log,
      errors: [{ line: null, message: "Compilation timed out" }],
    };
  }

  const errors = texLog ? parseLog(texLog) : [];
  const hasPdf = await exists(join(dir, "main.pdf"));

  if (run.code === 0 && hasPdf) {
    return { status: "success", log, errors };
  }

  return {
    status: "error",
    log,
    errors: errors.length > 0 ? errors : [{ line: null, message: "Compilation failed" }],
  };
}
