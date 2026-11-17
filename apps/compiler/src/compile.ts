import type { CompileJobData, CompileResult } from "@backslash/shared";
import { spawn } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { env } from "./config.ts";
import { parseLog } from "./parse-log.ts";

const MAX_LOG_LENGTH = 200_000;
/** -jobname: the PDF is output.pdf whatever the main file is called */
const OUTPUT = "output";

type RunResult = { code: number | null; timedOut: boolean; output: string };

function runLatexmk(cwd: string, mainFile: string, timeoutMs: number): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "latexmk",
      [
        "-pdf",
        "-norc",
        "-interaction=nonstopmode",
        "-halt-on-error",
        "-no-shell-escape",
        // errors as "file:line: msg", so we know which file they're in
        "-file-line-error",
        `-jobname=${OUTPUT}`,
        mainFile,
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

/** Writes project files into `dir`; paths are validated upstream, re-checked here (path traversal). */
async function writeFiles(dir: string, files: CompileJobData["files"]) {
  for (const { path, content } of files) {
    const target = resolve(dir, path);
    if (!target.startsWith(dir + sep)) throw new Error(`Invalid path: ${path}`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

export async function compileJob(
  jobId: string,
  { files, mainFile }: CompileJobData,
): Promise<CompileResult> {
  const dir = resolve(env.COMPILE_DIR, jobId);
  await mkdir(dir, { recursive: true });
  await writeFiles(dir, files);

  const run = await runLatexmk(dir, mainFile, env.COMPILE_TIMEOUT_MS);

  const texLog = await readFile(join(dir, `${OUTPUT}.log`), "utf8").catch(() => null);
  const log = (texLog ?? run.output).slice(0, MAX_LOG_LENGTH);

  if (run.timedOut) {
    return {
      status: "error",
      log,
      errors: [{ file: null, line: null, message: "Compilation timed out" }],
    };
  }

  const projectFiles = new Set(files.map((f) => f.path));
  const errors = texLog ? parseLog(texLog, projectFiles) : [];
  const hasPdf = await exists(join(dir, `${OUTPUT}.pdf`));

  if (run.code === 0 && hasPdf) {
    return { status: "success", log, errors };
  }

  return {
    status: "error",
    log,
    errors:
      errors.length > 0 ? errors : [{ file: null, line: null, message: "Compilation failed" }],
  };
}
