import { execFile, spawn } from "node:child_process";
import { lstatSync, readlinkSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const MAX_OUTPUT_LENGTH = 200_000;
const DISK_LIMIT_BYTES = 512 * 1024 * 1024;
const TMP_LIMIT_BYTES = 64 * 1024 * 1024;
const MEMORY_LIMIT_KB = 2 * 1024 * 1024;
const MAX_PROCESSES = 64;
/** exit code of the sandbox when the project files don't fit in /work */
export const INPUT_TOO_LARGE = 90;

/** -jobname: the PDF is output.pdf whatever the main file is called */
export const OUTPUT = "output";

/** What TeX Live needs from the host, all read-only. Missing paths are skipped. */
const READ_ONLY_PATHS = [
  "/usr",
  "/opt",
  "/etc/texmf",
  "/etc/fonts",
  "/etc/ld.so.cache",
  "/var/lib/texmf",
];
const ROOT_LINKS = ["/bin", "/sbin", "/lib", "/lib64", "/lib32"];

function rootLinkArgs() {
  return ROOT_LINKS.flatMap((path) => {
    try {
      return lstatSync(path).isSymbolicLink()
        ? ["--symlink", readlinkSync(path), path]
        : ["--ro-bind", path, path];
    } catch {
      return [];
    }
  });
}

/**
 * A fresh sandbox per run: no network, no host env, only TeX Live and the job's own files.
 * The input dir is mounted read-only at /in, the build runs in a size-limited tmpfs at /work
 * and files it writes are copied to the output dir (mounted at /out) when it ends.
 */
function bwrapArgs(inputDir: string, outputDir: string) {
  return [
    "--unshare-all",
    "--die-with-parent",
    "--new-session",
    "--clearenv",
    "--setenv",
    "PATH",
    "/usr/local/bin:/usr/bin:/bin",
    "--setenv",
    "HOME",
    "/tmp",
    "--setenv",
    "max_print_line",
    "10000",
    "--setenv",
    "openout_any",
    "p",
    ...READ_ONLY_PATHS.flatMap((path) => ["--ro-bind-try", path, path]),
    ...rootLinkArgs(),
    "--proc",
    "/proc",
    "--dev",
    "/dev",
    "--size",
    String(TMP_LIMIT_BYTES),
    "--tmpfs",
    "/tmp",
    "--size",
    String(DISK_LIMIT_BYTES),
    "--tmpfs",
    "/work",
    "--ro-bind",
    inputDir,
    "/in",
    "--bind",
    outputDir,
    "/out",
    "--chdir",
    "/work",
  ];
}

const SCRIPT = `
cp -R /in/. /work/ || exit ${INPUT_TOO_LARGE}
touch /tmp/.started
ulimit -u ${MAX_PROCESSES} -v ${MEMORY_LIMIT_KB}
latexmk -pdf -norc -interaction=nonstopmode -halt-on-error -no-shell-escape -file-line-error \\
  -jobname=${OUTPUT} "./$1"
code=$?
find . -type f -newer /tmp/.started -exec cp --parents -- {} /out/ \\;
exit $code
`;

export type LatexmkRun = { code: number | null; timedOut: boolean; output: string };

/** Compiles `mainFile` from `inputDir`; the files the build produced end up in `outputDir`. */
export function runLatexmk(
  inputDir: string,
  outputDir: string,
  mainFile: string,
  timeoutMs: number,
): Promise<LatexmkRun> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "bwrap",
      [...bwrapArgs(inputDir, outputDir), "sh", "-c", SCRIPT, "sh", mainFile],
      { detached: true, stdio: ["ignore", "pipe", "pipe"] },
    );

    let output = "";
    const append = (chunk: Buffer) => {
      if (output.length < MAX_OUTPUT_LENGTH) output += chunk.toString();
    };
    child.stdout.on("data", append);
    child.stderr.on("data", append);

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {}
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

/** Fails when bubblewrap or latexmk can't run, so the worker never compiles unsandboxed. */
export async function checkSandbox() {
  const dir = await mkdtemp(join(tmpdir(), "backslash-sandbox-"));
  try {
    await promisify(execFile)("bwrap", [...bwrapArgs(dir, dir), "sh", "-c", "command -v latexmk"]);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Compile sandbox unavailable (needs bubblewrap >= 0.10 and latexmk): ${detail}`,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
