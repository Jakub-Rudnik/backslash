import * as z from "zod";
import { FilePath, findPathConflict, isTexFile } from "./paths.ts";

const COMPILE_QUEUE = "compile";
const MAX_FILE_SIZE = 1_000_000;
const MAX_PROJECT_SIZE = 5_000_000;
const MAX_FILES = 200;

const ProjectFile = z.object({
  path: FilePath,
  content: z.string().max(MAX_FILE_SIZE),
});

const CompileRequest = z
  .object({
    files: z.array(ProjectFile).min(1).max(MAX_FILES),
    mainFile: FilePath,
  })
  .superRefine(({ files, mainFile }, ctx) => {
    const size = files.reduce((sum, f) => sum + f.content.length, 0);
    if (size > MAX_PROJECT_SIZE) {
      ctx.addIssue({ code: "custom", path: ["files"], message: "Project too large" });
    }
    const conflict = findPathConflict(files.map((f) => f.path));
    if (conflict) {
      ctx.addIssue({ code: "custom", path: ["files"], message: `Path conflict: ${conflict}` });
    }
    if (!isTexFile(mainFile) || !files.some((f) => f.path === mainFile)) {
      ctx.addIssue({
        code: "custom",
        path: ["mainFile"],
        message: "Main file must be a .tex file",
      });
    }
  });

const CompileJobData = CompileRequest;

const CompileError = z.object({
  /** project-relative path, null when the error is outside the project files */
  file: FilePath.nullable(),
  line: z.number().int().positive().nullable(),
  message: z.string(),
});

const CompileResult = z.object({
  status: z.enum(["success", "error"]),
  log: z.string(),
  errors: z.array(CompileError),
});

// Collaborative projects: one Yjs doc per project, the room name is the project id
const ProjectId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

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

type ProjectFile = z.infer<typeof ProjectFile>;
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
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PROJECT_SIZE,
  ProjectFile,
  ProjectId,
  SharedBuild,
};
export * from "./paths.ts";
