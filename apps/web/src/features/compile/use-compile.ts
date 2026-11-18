import { useMutation } from "@tanstack/react-query";
import { api, type CompileResponse } from "@/lib/api";

type UseCompileOptions = {
  onStart?: () => void;
  onResult?: (result: CompileResponse, startedAt: number) => void;
  onSettled?: () => void;
};

export function useCompile({ onStart, onResult, onSettled }: UseCompileOptions = {}) {
  const mutation = useMutation({ mutationFn: api.compile });

  function run(projectId: string) {
    const startedAt = Date.now();
    onStart?.();
    mutation.mutate(projectId, {
      onSuccess: (result) => onResult?.(result, startedAt),
      onSettled: () => onSettled?.(),
    });
  }

  return { run, isPending: mutation.isPending, error: mutation.error };
}
