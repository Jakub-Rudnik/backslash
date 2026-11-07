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

// Collaborative documents
const DOC_TEXT_FIELD = "source";
const DocumentId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

// Y.Map in the collab doc holding the latest compile, so every collaborator sees it
const DOC_BUILD_FIELD = "build";
const SharedBuild = z.object({
  jobId: z.string(),
  status: z.enum(["success", "error"]),
  errors: z.array(CompileError),
  by: z.string(),
  at: z.number(),
});

const DEFAULT_SOURCE = String.raw`\documentclass{article}
\begin{document}
Hello, \LaTeX!
\end{document}
`;

type CompileRequest = z.infer<typeof CompileRequest>;
type CompileError = z.infer<typeof CompileError>;
type CompileResult = z.infer<typeof CompileResult>;
type CompileJobData = z.infer<typeof CompileJobData>;
type SharedBuild = z.infer<typeof SharedBuild>;

export {
  COMPILE_QUEUE,
  CompileError,
  CompileJobData,
  CompileRequest,
  CompileResult,
  DEFAULT_SOURCE,
  DOC_BUILD_FIELD,
  DOC_TEXT_FIELD,
  DocumentId,
  SharedBuild,
};
