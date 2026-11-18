import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vite-plus/test";
import { checkSandbox, runLatexmk } from "../src/sandbox.ts";

const available = await checkSandbox().then(
  () => true,
  () => false,
);

const SECRET = "TOPSECRETVALUE";

describe.skipIf(!available)("compile sandbox", () => {
  let root: string;
  let input: string;
  let output: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "backslash-sandbox-test-"));
    input = join(root, "job.input");
    output = join(root, "job");
    await mkdir(input);
    await mkdir(output);
    await writeFile(join(root, "secret.tex"), SECRET);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function compile(body: string, timeoutMs = 20_000) {
    const source = `\\documentclass{article}\n\\begin{document}\n${body}\n\\end{document}\n`;
    await writeFile(join(input, "main.tex"), source);
    const run = await runLatexmk(input, output, "main.tex", timeoutMs);
    const log = await readFile(join(output, "output.log"), "utf8").catch(() => "");
    return { run, log };
  }

  test("compiles and returns only the files the build produced", async () => {
    const { run } = await compile("Hello");
    expect(run.code).toBe(0);
    const files = await readdir(output);
    expect(files).toContain("output.pdf");
    expect(files).not.toContain("main.tex");
  });

  test("can't read files outside the project by absolute path", async () => {
    const { run, log } = await compile(`\\input{${join(root, "secret.tex")}}`);
    expect(run.code).not.toBe(0);
    expect(log).toContain("not found");
    expect(log + run.output).not.toContain(SECRET);
  });

  test("can't read files outside the project by relative path", async () => {
    const { run, log } = await compile("\\input{../secret.tex}");
    expect(run.code).not.toBe(0);
    expect(log + run.output).not.toContain(SECRET);
  });

  test("can't read the host file system", async () => {
    const { run, log } = await compile(`\\input{${join(process.cwd(), "package.json")}}`);
    expect(run.code).not.toBe(0);
    expect(log).toContain("not found");
  });

  test("is killed when it runs too long", async () => {
    const started = Date.now();
    const { run } = await compile("\\loop\\iftrue\\repeat", 1500);
    expect(run.timedOut).toBe(true);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});
