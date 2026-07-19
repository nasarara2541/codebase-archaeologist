"use client";

import { useEffect, useState } from "react";

type CopyButtonProps = {
  value: string;
  label: string;
  className?: string;
};

export function CopyButton({ value, label, className = "copy-button" }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1_600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={copy}
      aria-label={`${label}: ${copied ? "copied" : "copy to clipboard"}`}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
