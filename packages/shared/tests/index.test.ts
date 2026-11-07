import { expect, test } from "vite-plus/test";
import { CompileRequest, DocumentId } from "../src/index.ts";

test("accepts valid source", () => {
  expect(CompileRequest.safeParse({ source: "\\documentclass{article}" }).success).toBe(true);
});

test("rejects too long source", () => {
  expect(CompileRequest.safeParse({ source: "a".repeat(1_000_001) }).success).toBe(false);
});

test("document id", () => {
  expect(DocumentId.safeParse("aB3_-xYz12").success).toBe(true);
  expect(DocumentId.safeParse("short").success).toBe(false);
  expect(DocumentId.safeParse("../../etc/passwd").success).toBe(false);
});
