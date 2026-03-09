"use client";

import React from "react";
import type { Note } from "@/lib/apiClient";
import { formatDateTime } from "@/lib/utils";

type Props = {
  note: Note;
  active?: boolean;
  onSelect: () => void;
  onTogglePinned: () => void;
  onToggleFavorite: () => void;
};

function Icon({ name }: { name: "pin" | "star" | "doc" }) {
  const common: React.CSSProperties = { width: 16, height: 16, display: "inline-block" };
  if (name === "pin") {
    return (
      <span aria-hidden="true" style={common}>
        📌
      </span>
    );
  }
  if (name === "star") {
    return (
      <span aria-hidden="true" style={common}>
        ★
      </span>
    );
  }
  return (
    <span aria-hidden="true" style={common}>
      🗒️
    </span>
  );
}

export default function NoteListItem({
  note,
  active,
  onSelect,
  onTogglePinned,
  onToggleFavorite,
}: Props) {
  return (
    <div
      className="nm-btn"
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onSelect();
      }}
      style={{
        width: "100%",
        textAlign: "left",
        background: active ? "rgba(59, 130, 246, 0.14)" : "rgba(255,255,255,0.03)",
        borderColor: active ? "rgba(59, 130, 246, 0.55)" : "var(--border)",
        padding: 12,
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 10,
      }}
      aria-current={active ? "true" : "false"}
    >
      <div style={{ minWidth: 0 }}>
        <div className="nm-row" style={{ gap: 8, marginBottom: 4 }}>
          <Icon name="doc" />
          <div
            style={{
              fontFamily: "var(--mono)",
              fontSize: 13,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {note.title?.trim() ? note.title : "Untitled"}
          </div>
          {note.is_pinned ? <span className="nm-badge">PINNED</span> : null}
          {note.is_favorite ? <span className="nm-badge">FAV</span> : null}
        </div>
        <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.3 }}>
          {note.content?.trim() ? note.content.trim().slice(0, 90) : "No content yet…"}
        </div>
        <div className="nm-muted" style={{ fontSize: 11, marginTop: 8, fontFamily: "var(--mono)" }}>
          {formatDateTime(note.updated_at || note.created_at) || ""}
        </div>
      </div>

      <div className="nm-row" style={{ gap: 8, alignSelf: "start" }}>
        <button
          type="button"
          className="nm-btn"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePinned();
          }}
          style={{ padding: "8px 10px" }}
          aria-label={note.is_pinned ? "Unpin note" : "Pin note"}
          title={note.is_pinned ? "Unpin" : "Pin"}
        >
          <Icon name="pin" />
        </button>
        <button
          type="button"
          className="nm-btn"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          style={{ padding: "8px 10px" }}
          aria-label={note.is_favorite ? "Unfavorite note" : "Favorite note"}
          title={note.is_favorite ? "Unfavorite" : "Favorite"}
        >
          <Icon name="star" />
        </button>
      </div>
    </div>
  );
}
