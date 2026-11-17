import * as z from "zod";
import { FilePath, findPathConflict, isTexFile } from "./paths.ts";

const COMPILE_QUEUE = "compile";
const MAX_FILE_SIZE = 1_000_000;
const MAX_PROJECT_SIZE = 5_000_000;
const MAX_FILES = 200;
/** uploaded (binary) files: images, PDFs, fonts */
const MAX_BLOB_SIZE = 20 * 1024 * 1024;

/** sha256 of the blob content, hex */
const BlobHash = z.string().regex(/^[a-f0-9]{64}$/);

const TextFile = z.object({
  path: FilePath,
  content: z.string().max(MAX_FILE_SIZE),
});

/** stored in the blob store (by the API), the compiler copies it in by hash */
const BlobFile = z.object({
  path: FilePath,
  hash: BlobHash,
});

const ProjectFile = z.union([TextFile, BlobFile]);

const UploadedBlob = z.object({ hash: BlobHash, size: z.number().int().nonnegative() });

const CompileRequest = z
  .object({
    files: z.array(ProjectFile).min(1).max(MAX_FILES),
    mainFile: FilePath,
  })
  .superRefine(({ files, mainFile }, ctx) => {
    const size = files.reduce((sum, f) => sum + ("content" in f ? f.content.length : 0), 0);
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

type TextFile = z.infer<typeof TextFile>;
type BlobFile = z.infer<typeof BlobFile>;
type ProjectFile = z.infer<typeof ProjectFile>;
type UploadedBlob = z.infer<typeof UploadedBlob>;
type CompileRequest = z.infer<typeof CompileRequest>;
type CompileError = z.infer<typeof CompileError>;
type CompileResult = z.infer<typeof CompileResult>;
/** queue payload: the request plus the project it belongs to (for PDF access checks) */
type CompileJobData = CompileRequest & { projectId: string };
type SharedBuild = z.infer<typeof SharedBuild>;

export type { CompileJobData };
export {
  BlobFile,
  BlobHash,
  COMPILE_QUEUE,
  CompileError,
  CompileRequest,
  CompileResult,
  DEFAULT_SOURCE,
  DOC_BUILD_FIELD,
  MAX_BLOB_SIZE,
  MAX_FILE_SIZE,
  MAX_FILES,
  MAX_PROJECT_SIZE,
  ProjectFile,
  ProjectId,
  SharedBuild,
  TextFile,
  UploadedBlob,
};
export * from "./paths.ts";
export * from "./api.ts";
