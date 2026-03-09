"use client";

import React from "react";
import { stableTagColor } from "@/lib/utils";

type Props = {
  tag: string;
  selected?: boolean;
  onClick?: () => void;
};

export default function TagPill({ tag, selected, onClick }: Props) {
  const c = stableTagColor(tag);
  return (
    <button
      type="button"
      onClick={onClick}
      className="nm-btn"
      style={{
        padding: "6px 10px",
        borderRadius: 999,
        borderColor: selected ? "rgba(233, 240, 255, 0.55)" : c.border,
        background: selected ? "rgba(233, 240, 255, 0.08)" : c.bg,
        color: selected ? "#ffffff" : c.text,
        fontFamily: "var(--mono)",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.02em",
      }}
      aria-pressed={selected ? "true" : "false"}
    >
      #{tag}
    </button>
  );
}
