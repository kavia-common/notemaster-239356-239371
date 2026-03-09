"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api, type Note, type NoteCreate, type NotesListParams } from "@/lib/apiClient";
import { debounce } from "@/lib/utils";
import { getErrorMessage } from "@/lib/errors";
import TagPill from "@/components/TagPill";
import NoteListItem from "@/components/NoteListItem";

type LoadState = "idle" | "loading" | "error";

function sortNotes(notes: Note[]): Note[] {
  // Keep pinned at top, then most recently updated.
  return [...notes].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
    const ad = new Date(a.updated_at || a.created_at || 0).getTime();
    const bd = new Date(b.updated_at || b.created_at || 0).getTime();
    return bd - ad;
  });
}

export default function Home() {
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [onlyPinned, setOnlyPinned] = useState(false);
  const [onlyFavorite, setOnlyFavorite] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [editorTitle, setEditorTitle] = useState("");
  const [editorContent, setEditorContent] = useState("");
  const [editorTagsRaw, setEditorTagsRaw] = useState("");

  const [saving, setSaving] = useState<LoadState>("idle");
  const [savingMessage, setSavingMessage] = useState<string>("");
  const lastSavedPayload = useRef<string>("");

  const params: NotesListParams = useMemo(
    () => ({
      q: query.trim() || undefined,
      tag: selectedTag || undefined,
      pinned: onlyPinned ? true : undefined,
      favorite: onlyFavorite ? true : undefined,
      limit: 200,
      offset: 0,
    }),
    [query, selectedTag, onlyPinned, onlyFavorite]
  );

  const notesKey = useMemo(() => ["notes", params] as const, [params]);
  const { data: notesResp, error: notesErr, isLoading: notesLoading, mutate: mutateNotes } = useSWR(
    notesKey,
    async () => api.listNotes(params),
    {
      revalidateOnFocus: false,
    }
  );

  const { data: tagsResp, mutate: mutateTags } = useSWR(
    "tags",
    async () => api.listTags(),
    { revalidateOnFocus: false }
  );

  const notes = useMemo(() => sortNotes(notesResp?.items || []), [notesResp?.items]);
  const tags = tagsResp?.items || [];

  const selectedNote = useMemo(() => {
    if (!selectedId) return null;
    return notes.find((n) => n.id === selectedId) || null;
  }, [notes, selectedId]);

  // Keep editor in sync when selecting a note
  useEffect(() => {
    if (!selectedNote) return;

    setEditorTitle(selectedNote.title || "");
    setEditorContent(selectedNote.content || "");
    setEditorTagsRaw((selectedNote.tags || []).join(", "));

    lastSavedPayload.current = JSON.stringify({
      title: selectedNote.title || "",
      content: selectedNote.content || "",
      tags: selectedNote.tags || [],
    });
    setSaving("idle");
    setSavingMessage("");
  }, [selectedNote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // When notes change and nothing is selected, select first note
  useEffect(() => {
    if (selectedId) return;
    if (notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  const parsedEditorTags = useMemo(() => {
    return editorTagsRaw
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }, [editorTagsRaw]);

  const doAutosave = useMemo(
    () =>
      debounce(async () => {
        if (!selectedId) return;

        const payload = {
          title: editorTitle,
          content: editorContent,
          tags: parsedEditorTags,
        };

        const payloadKey = JSON.stringify(payload);
        if (payloadKey === lastSavedPayload.current) return;

        try {
          setSaving("loading");
          setSavingMessage("autosaving…");
          const updated = await api.updateNote(selectedId, payload);
          lastSavedPayload.current = payloadKey;

          // Update list quickly without refetch if possible
          mutateNotes(
            (prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                items: prev.items.map((n) => (n.id === updated.id ? updated : n)),
              };
            },
            { revalidate: false }
          );

          mutateTags(undefined, { revalidate: true });
          setSaving("idle");
          setSavingMessage("saved");
          setTimeout(() => setSavingMessage(""), 900);
        } catch (e: unknown) {
          setSaving("error");
          setSavingMessage(getErrorMessage(e) || "autosave failed");
        }
      }, 650),
    [selectedId, editorTitle, editorContent, parsedEditorTags, mutateNotes, mutateTags]
  );

  // Trigger autosave on editor changes
  useEffect(() => {
    if (!selectedId) return;
    doAutosave();
  }, [selectedId, editorTitle, editorContent, parsedEditorTags, doAutosave]);

  async function handleCreateNote() {
    try {
      setSaving("loading");
      setSavingMessage("creating…");

      const payload: NoteCreate = {
        title: "New Note",
        content: "",
        tags: selectedTag ? [selectedTag] : [],
        is_pinned: false,
        is_favorite: false,
      };

      const created = await api.createNote(payload);

      await mutateNotes(undefined, { revalidate: true });
      await mutateTags(undefined, { revalidate: true });

      setSelectedId(created.id);
      setSaving("idle");
      setSavingMessage("created");
      setTimeout(() => setSavingMessage(""), 900);
    } catch (e: unknown) {
      setSaving("error");
      setSavingMessage(getErrorMessage(e) || "create failed");
    }
  }

  async function handleDeleteSelected() {
    if (!selectedId) return;
    const ok = confirm("Delete this note? This cannot be undone.");
    if (!ok) return;

    try {
      setSaving("loading");
      setSavingMessage("deleting…");
      await api.deleteNote(selectedId);

      const nextId =
        notes.find((n) => n.id !== selectedId)?.id || (notes.length > 1 ? notes[1].id : null);

      setSelectedId(nextId);
      await mutateNotes(undefined, { revalidate: true });
      await mutateTags(undefined, { revalidate: true });

      setSaving("idle");
      setSavingMessage("deleted");
      setTimeout(() => setSavingMessage(""), 900);
    } catch (e: unknown) {
      setSaving("error");
      setSavingMessage(getErrorMessage(e) || "delete failed");
    }
  }

  async function togglePinned(note: Note) {
    try {
      const updated = await api.setPinned(note.id, !note.is_pinned);
      mutateNotes(
        (prev) => {
          if (!prev) return prev;
          return { ...prev, items: prev.items.map((n) => (n.id === updated.id ? updated : n)) };
        },
        { revalidate: false }
      );
    } catch (e: unknown) {
      alert(getErrorMessage(e) || "Failed to update pin");
    }
  }

  async function toggleFavorite(note: Note) {
    try {
      const updated = await api.setFavorite(note.id, !note.is_favorite);
      mutateNotes(
        (prev) => {
          if (!prev) return prev;
          return { ...prev, items: prev.items.map((n) => (n.id === updated.id ? updated : n)) };
        },
        { revalidate: false }
      );
    } catch (e: unknown) {
      alert(getErrorMessage(e) || "Failed to update favorite");
    }
  }

  const connectivityHint = useMemo(() => {
    const base = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001 (fallback)";
    return base;
  }, []);

  return (
    <main className="nm-shell">
      {/* Sidebar: Tags */}
      <aside className="nm-card nm-col-sidebar" aria-label="Tags sidebar">
        <div className="nm-card-header">
          <div className="nm-title">
            <span>NoteMaster</span>
            <span className="nm-badge">retro ui</span>
          </div>
          <div className="nm-muted" style={{ marginTop: 8, fontSize: 12, lineHeight: 1.35 }}>
            API: <span style={{ fontFamily: "var(--mono)" }}>{connectivityHint}</span>
          </div>
        </div>

        <div className="nm-card-body">
          <div className="nm-row" style={{ justifyContent: "space-between" }}>
            <div className="nm-title" style={{ fontSize: 12 }}>
              Tags
            </div>
            <span className="nm-badge">{tags.length}</span>
          </div>

          <div className="nm-sep" />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <TagPill
              tag="all"
              selected={selectedTag === null}
              onClick={() => setSelectedTag(null)}
            />
            {tags.length === 0 ? (
              <div className="nm-muted" style={{ fontSize: 12 }}>
                No tags yet. Add tags in the editor.
              </div>
            ) : (
              tags.map((t) => (
                <TagPill
                  key={t}
                  tag={t}
                  selected={selectedTag === t}
                  onClick={() => setSelectedTag(selectedTag === t ? null : t)}
                />
              ))
            )}
          </div>

          <div className="nm-sep" />

          <div className="nm-muted" style={{ fontSize: 12, lineHeight: 1.4 }}>
            Tip: Use <span className="nm-kbd">,</span> to separate tags.
          </div>
        </div>
      </aside>

      {/* Notes list */}
      <section className="nm-card nm-col-notes" aria-label="Notes list">
        <div className="nm-card-header">
          <div className="nm-row" style={{ justifyContent: "space-between" }}>
            <div className="nm-title">
              Notes <span className="nm-badge">{notesResp?.total ?? notes.length}</span>
            </div>

            <div className="nm-row" style={{ gap: 8 }}>
              <button type="button" className="nm-btn nm-btn-primary" onClick={handleCreateNote}>
                + New
              </button>
              <button type="button" className="nm-btn" onClick={() => mutateNotes()} title="Refresh">
                ↻
              </button>
            </div>
          </div>

          <div className="nm-row" style={{ marginTop: 12, gap: 10 }}>
            <input
              className="nm-input"
              placeholder="Search notes (title/content)…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search notes"
            />
          </div>

          <div className="nm-row" style={{ marginTop: 10, flexWrap: "wrap", gap: 8 }}>
            <button
              type="button"
              className="nm-btn"
              onClick={() => setOnlyPinned((v) => !v)}
              aria-pressed={onlyPinned ? "true" : "false"}
              style={{
                borderColor: onlyPinned ? "rgba(59, 130, 246, 0.7)" : "var(--border-strong)",
                background: onlyPinned ? "rgba(59, 130, 246, 0.16)" : "rgba(255,255,255,0.03)",
              }}
            >
              📌 Pinned
            </button>
            <button
              type="button"
              className="nm-btn"
              onClick={() => setOnlyFavorite((v) => !v)}
              aria-pressed={onlyFavorite ? "true" : "false"}
              style={{
                borderColor: onlyFavorite ? "rgba(245, 158, 11, 0.75)" : "var(--border-strong)",
                background: onlyFavorite ? "rgba(245, 158, 11, 0.14)" : "rgba(255,255,255,0.03)",
              }}
            >
              ★ Favorite
            </button>
            {(selectedTag || query || onlyPinned || onlyFavorite) && (
              <button
                type="button"
                className="nm-btn"
                onClick={() => {
                  setSelectedTag(null);
                  setQuery("");
                  setOnlyPinned(false);
                  setOnlyFavorite(false);
                }}
                title="Clear filters"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>

        <div className="nm-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {notesLoading ? (
            <div className="nm-muted">Loading notes…</div>
          ) : notesErr ? (
            <div className="nm-muted" style={{ color: "rgba(239,68,68,0.95)" }}>
              Could not load notes. ({notesErr.message})
              <div style={{ marginTop: 10, fontSize: 12 }}>
                If you’re running static export, ensure the backend supports CORS and{" "}
                <span style={{ fontFamily: "var(--mono)" }}>NEXT_PUBLIC_API_BASE_URL</span> points to
                it.
              </div>
            </div>
          ) : notes.length === 0 ? (
            <div className="nm-muted">
              No notes yet. Click <span className="nm-kbd">+ New</span> to create one.
            </div>
          ) : (
            notes.map((n) => (
              <NoteListItem
                key={n.id}
                note={n}
                active={selectedId === n.id}
                onSelect={() => setSelectedId(n.id)}
                onTogglePinned={() => togglePinned(n)}
                onToggleFavorite={() => toggleFavorite(n)}
              />
            ))
          )}
        </div>
      </section>

      {/* Editor */}
      <section className="nm-card" aria-label="Editor">
        <div className="nm-card-header">
          <div className="nm-row" style={{ justifyContent: "space-between" }}>
            <div className="nm-title">
              Editor
              {selectedNote?.id ? <span className="nm-badge">id: {String(selectedNote.id)}</span> : null}
            </div>

            <div className="nm-row" style={{ gap: 8 }}>
              <span
                className="nm-badge"
                style={{
                  color:
                    saving === "error"
                      ? "rgba(239,68,68,0.95)"
                      : saving === "loading"
                        ? "rgba(245,158,11,0.95)"
                        : "var(--muted)",
                  borderColor:
                    saving === "error"
                      ? "rgba(239,68,68,0.55)"
                      : saving === "loading"
                        ? "rgba(245,158,11,0.55)"
                        : "var(--border-strong)",
                }}
                aria-live="polite"
              >
                {savingMessage || "ready"}
              </span>

              <button type="button" className="nm-btn" onClick={handleDeleteSelected} disabled={!selectedId}>
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="nm-card-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {!selectedId ? (
            <div className="nm-muted">Select a note to start editing.</div>
          ) : (
            <>
              <label style={{ display: "grid", gap: 6 }}>
                <span className="nm-muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  Title
                </span>
                <input
                  className="nm-input"
                  value={editorTitle}
                  onChange={(e) => setEditorTitle(e.target.value)}
                  placeholder="Untitled"
                />
              </label>

              <label style={{ display: "grid", gap: 6 }}>
                <span className="nm-muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  Tags (comma separated)
                </span>
                <input
                  className="nm-input"
                  value={editorTagsRaw}
                  onChange={(e) => setEditorTagsRaw(e.target.value)}
                  placeholder="work, ideas, personal"
                />
              </label>

              <div className="nm-row" style={{ flexWrap: "wrap", gap: 8 }}>
                {parsedEditorTags.length === 0 ? (
                  <span className="nm-muted" style={{ fontSize: 12 }}>
                    No tags
                  </span>
                ) : (
                  parsedEditorTags.map((t) => <TagPill key={t} tag={t} selected={false} />)
                )}
              </div>

              <label style={{ display: "grid", gap: 6, flex: 1 }}>
                <span className="nm-muted" style={{ fontFamily: "var(--mono)", fontSize: 12 }}>
                  Content
                </span>
                <textarea
                  className="nm-textarea"
                  value={editorContent}
                  onChange={(e) => setEditorContent(e.target.value)}
                  placeholder="Start typing… autosave will kick in."
                />
              </label>

              <div className="nm-row" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
                <div className="nm-muted" style={{ fontSize: 12 }}>
                  Autosave: <span className="nm-kbd">650ms</span> debounce
                </div>
                {selectedNote ? (
                  <div className="nm-row" style={{ gap: 10 }}>
                    <button
                      type="button"
                      className="nm-btn"
                      onClick={() => togglePinned(selectedNote)}
                      title={selectedNote.is_pinned ? "Unpin" : "Pin"}
                    >
                      📌 {selectedNote.is_pinned ? "Unpin" : "Pin"}
                    </button>
                    <button
                      type="button"
                      className="nm-btn"
                      onClick={() => toggleFavorite(selectedNote)}
                      title={selectedNote.is_favorite ? "Unfavorite" : "Favorite"}
                    >
                      ★ {selectedNote.is_favorite ? "Unfavorite" : "Favorite"}
                    </button>
                  </div>
                ) : null}
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
