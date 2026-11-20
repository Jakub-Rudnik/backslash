import type { CompileRequest, SharedBuild } from "@backslash/shared";
import { expect, test } from "vite-plus/test";
import { CompileTimeoutError } from "../src/features/compile/compile.backend.ts";
import { compileScheduler, type CompileRecord } from "../src/features/compile/compile.scheduler.ts";
import { CompileInputError } from "../src/features/compile/compile.service.ts";

type Run = { state: string; finish: (outcome?: Error) => void };

const ann = { id: "u1", name: "Ann" };
const bob = { id: "u2", name: "Bob" };
const cid = { id: "u3", name: "Cid" };

function setup() {
  let seq = 0;
  let state = "v1";
  const runs: Run[] = [];
  const published: SharedBuild[] = [];
  const records: CompileRecord[] = [];
  const log = { error: () => {} } as never;

  const scheduler = compileScheduler({
    nextSeq: async (projectId) => (projectId === "missing" ? null : ++seq),
    prepare: async () => ({ files: [], mainFile: state }) as unknown as CompileRequest,
    backend: {
      run: (_projectId, request) =>
        new Promise((resolve, reject) => {
          runs.push({
            state: request.mainFile,
            finish: (outcome) =>
              outcome
                ? reject(outcome)
                : resolve({ jobId: `job-${runs.length}`, status: "success", log: "", errors: [] }),
          });
        }),
      projectOf: async () => null,
      pdfPath: () => "",
    },
    publish: async (_projectId, build) => void published.push(build),
    record: async (compile) => void records.push(compile),
    log,
  });

  return {
    scheduler,
    runs,
    published,
    records,
    edit: (next: string) => {
      state = next;
    },
  };
}

test("requests during a compile collapse into one more compile of the latest state", async () => {
  const { scheduler, runs, published, edit } = setup();

  const first = scheduler.request("p1", ann);
  await expect.poll(() => runs.length).toBe(1);

  edit("v2");
  const second = scheduler.request("p1", bob);
  edit("v3");
  const third = scheduler.request("p1", cid);
  expect(await first).toBe(1);
  expect(await second).toBe(2);
  expect(await third).toBe(2);

  runs[0]!.finish();
  await expect.poll(() => runs.length).toBe(2);
  expect(runs[1]!.state).toBe("v3");
  runs[1]!.finish();

  await expect.poll(() => published.length).toBe(2);
  expect(published.map((b) => [b.seq, b.by, b.status])).toEqual([
    [1, "Ann", "success"],
    [2, "Bob", "success"],
  ]);
  expect(runs).toHaveLength(2);
});

test("projects compile independently", async () => {
  const { scheduler, runs } = setup();
  void scheduler.request("p1", ann);
  void scheduler.request("p2", ann);
  await expect.poll(() => runs.length).toBe(2);
});

test("failures are published as error results and don't block the next compile", async () => {
  const { scheduler, runs, published, records } = setup();

  void scheduler.request("p1", ann);
  await expect.poll(() => runs.length).toBe(1);
  void scheduler.request("p1", bob);
  runs[0]!.finish(new CompileTimeoutError());
  await expect.poll(() => runs.length).toBe(2);
  runs[1]!.finish(new CompileInputError("Add a .tex file to compile"));

  await expect.poll(() => published.length).toBe(2);
  expect(published.map((b) => [b.status, b.jobId, b.errors[0]?.message])).toEqual([
    ["error", null, "Compilation timed out"],
    ["error", null, "Add a .tex file to compile"],
  ]);

  void scheduler.request("p1", ann);
  await expect.poll(() => runs.length).toBe(3);
  runs[2]!.finish(new Error("worker crashed"));
  await expect.poll(() => records.length).toBe(3);
  expect(records.map((r) => [r.projectId, r.userId, r.outcome])).toEqual([
    ["p1", "u1", "timeout"],
    ["p1", "u2", "error"],
    ["p1", "u1", "failed"],
  ]);
});

test("a missing project gets no compile", async () => {
  const { scheduler, runs } = setup();
  expect(await scheduler.request("missing", ann)).toBeNull();
  expect(runs).toHaveLength(0);
});
