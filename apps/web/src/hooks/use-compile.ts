import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { compile, pdfUrl } from "@/lib/api";

export function useCompile() {
  // last successful PDF; kept while recompiling or after a failed compile
  const [url, setUrl] = useState<string | null>(null);
  const mutation = useMutation({ mutationFn: compile });

  function run(source: string) {
    // per-call callbacks only fire for the latest mutate() call, so stale results are dropped
    mutation.mutate(source, {
      onSuccess: (result) => {
        if (result.status === "success") setUrl(pdfUrl(result.jobId));
      },
    });
  }

  return {
    run,
    pdfUrl: url,
    result: mutation.data,
    isPending: mutation.isPending,
    error: mutation.error,
  };
}
