import { useMutation } from "@tanstack/react-query";
import type { CompileRequest } from "@backslash/shared";
import { compile, type CompileResponse } from "@/lib/api";

type UseCompileOptions = {
  onStart?: () => void;
  onResult?: (result: CompileResponse, startedAt: number) => void;
  onSettled?: () => void;
};

export function useCompile({ onStart, onResult, onSettled }: UseCompileOptions = {}) {
  const mutation = useMutation({ mutationFn: compile });

  function run(request: CompileRequest) {
    const startedAt = Date.now();
    onStart?.();
    // per-call callbacks only fire for the latest mutate() call, so stale results are dropped
    mutation.mutate(request, {
      onSuccess: (result) => onResult?.(result, startedAt),
      onSettled: () => onSettled?.(),
    });
  }

  return { run, isPending: mutation.isPending, error: mutation.error };
}
