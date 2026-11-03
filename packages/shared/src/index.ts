import * as z from "zod";

const COMPILE_QUEUE = "compile";
const MAX_SOURCE_LENGTH = 1_000_000;

const CompileRequest = z.object({
  source: z.string().max(MAX_SOURCE_LENGTH),
});

const CompileJobData = z.object({
  source: z.string().max(MAX_SOURCE_LENGTH),
});

const CompileError = z.object({
  line: z.number().int().positive().nullable(),
  message: z.string(),
});

const CompileResult = z.object({
  status: z.enum(["success", "error"]),
  log: z.string(),
  errors: z.array(CompileError),
});

type CompileRequest = z.infer<typeof CompileRequest>;
type CompileError = z.infer<typeof CompileError>;
type CompileResult = z.infer<typeof CompileResult>;
type CompileJobData = z.infer<typeof CompileJobData>;

export { COMPILE_QUEUE, CompileError, CompileJobData, CompileRequest, CompileResult };
