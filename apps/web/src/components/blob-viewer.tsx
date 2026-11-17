import type { DocBlobFile } from "@backslash/shared/doc";
import { Download04Icon, File01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { PdfViewer } from "@/components/pdf-viewer";
import { buttonVariants } from "@/components/ui/button";
import { blobUrl, fetchBlob } from "@/lib/api";
import { formatSize, previewType } from "@/lib/mime";

function useObjectUrl(blob: Blob | undefined) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) return;
    const next = URL.createObjectURL(blob);
    // object URL is an external resource owned by this effect
    // oxlint-disable-next-line react/set-state-in-effect
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [blob]);
  return url;
}

/** Preview of an uploaded (non-text) file: images, PDFs, otherwise just info + download. */
export function BlobViewer({
  projectId,
  file,
  className,
}: {
  projectId: string;
  file: DocBlobFile;
  className?: string;
}) {
  const type = previewType(file.path);
  const name = file.path.slice(file.path.lastIndexOf("/") + 1);
  const { data, error } = useQuery({
    queryKey: ["blob", projectId, file.hash, type],
    queryFn: () => fetchBlob(projectId, file.hash, type ?? ""),
    enabled: type !== null,
    // content-addressed, never changes
    staleTime: Infinity,
  });
  const url = useObjectUrl(data);

  const info = (
    <div className="flex items-center gap-3 border-b px-3 py-2 text-sm">
      <HugeiconsIcon icon={File01Icon} className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 truncate font-mono text-xs">{file.path}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{formatSize(file.size)}</span>
      <a
        href={blobUrl(projectId, file.hash)}
        download={name}
        className={cn(buttonVariants({ variant: "outline", size: "xs" }), "ml-auto")}
      >
        <HugeiconsIcon icon={Download04Icon} data-icon="inline-start" />
        Download
      </a>
    </div>
  );

  let body;
  if (type === null) {
    body = <p className="text-sm text-muted-foreground">No preview for this file type.</p>;
  } else if (error) {
    body = <p className="text-sm text-destructive">Couldn't load file: {error.message}</p>;
  } else if (!url) {
    body = <p className="text-sm text-muted-foreground">Loading…</p>;
  } else if (type === "application/pdf") {
    return (
      <div className={cn("flex flex-col", className)}>
        {info}
        <PdfViewer url={url} className="min-h-0 flex-1 overflow-auto bg-muted p-4" />
      </div>
    );
  } else {
    body = (
      <img
        src={url}
        alt={file.path}
        className="max-h-full max-w-full bg-[repeating-conic-gradient(var(--muted)_0_25%,transparent_0_50%)] bg-size-[16px_16px] object-contain"
      />
    );
  }

  return (
    <div className={cn("flex flex-col", className)}>
      {info}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4">
        {body}
      </div>
    </div>
  );
}
