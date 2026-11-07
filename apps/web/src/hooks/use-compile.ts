import { useMutation } from "@tanstack/react-query";
import { compile, type CompileResponse } from "@/lib/api";

type UseCompileOptions = {
  onStart?: () => void;
  onResult?: (result: CompileResponse, startedAt: number) => void;
  onSettled?: () => void;
};

export function useCompile({ onStart, onResult, onSettled }: UseCompileOptions = {}) {
  const mutation = useMutation({ mutationFn: compile });

  function run(source: string) {
    const startedAt = Date.now();
    onStart?.();
    // per-call callbacks only fire for the latest mutate() call, so stale results are dropped
    mutation.mutate(source, {
      onSuccess: (result) => onResult?.(result, startedAt),
      onSettled: () => onSettled?.(),
    });
  }

  return { run, isPending: mutation.isPending, error: mutation.error };
}
