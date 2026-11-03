import { expect, test } from "vite-plus/test";
import { CompileRequest } from "../src/index.ts";

test("accepts valid source", () => {
  expect(CompileRequest.safeParse({ source: "\\documentclass{article}" }).success).toBe(true);
});

test("rejects too long source", () => {
  expect(CompileRequest.safeParse({ source: "a".repeat(1_000_001) }).success).toBe(false);
});
