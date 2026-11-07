import { Link01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ShareButton() {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      window.prompt("Copy this link:", window.location.href);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={copy}>
      <HugeiconsIcon icon={copied ? Tick02Icon : Link01Icon} data-icon="inline-start" />
      {copied ? "Copied" : "Share"}
    </Button>
  );
}
