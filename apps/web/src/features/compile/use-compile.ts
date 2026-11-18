import type { SharedBuild } from "@backslash/shared";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

const RESULT_TIMEOUT_MS = 150_000;

/**
 * Asks the server to compile. The server answers with the number of the compile that will
 * include the current state; it's pending until a result with that number reaches the doc.
 */
export function useCompile(projectId: string, latest: SharedBuild | null) {
  const [requesting, setRequesting] = useState(false);
  const [waitingFor, setWaitingFor] = useState<number | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const waiting = waitingFor !== null && (latest?.seq ?? 0) < waitingFor;

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => {
      setWaitingFor(null);
      setError(new Error("No compile result from the server, try again"));
    }, RESULT_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [waiting, waitingFor]);

  async function run() {
    setRequesting(true);
    setError(null);
    try {
      const { seq } = await api.compile(projectId);
      setWaitingFor(seq);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setRequesting(false);
    }
  }

  return { run, isPending: requesting || waiting, error };
}
