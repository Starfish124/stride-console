"use client";

// What the machine should know about this project. Every note here is
// prepended to every Claude run's prompt — stack, conventions, what not to
// touch. Save on blur, the ClientDetail pattern.

import { useEffect, useState } from "react";
import { Glyph } from "@/components/icons";

interface Note {
  id: string;
  title: string;
  body: string;
}

export function ProjectNotes({ projectId }: { projectId: string }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    // Fetch-on-mount: the setState happens after an await.
    void fetch(`/api/workspace/notes?projectId=${projectId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((list) => {
        if (live) setNotes(list);
      });
    return () => {
      live = false;
    };
  }, [projectId]);

  async function save(note: { id?: string; title: string; body: string }) {
    setError(null);
    const res = await fetch("/api/workspace/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectId, ...note }),
    });
    const saved = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(saved.error ?? "The note could not be saved.");
      return;
    }
    setNotes((all) => {
      const rest = all.filter((n) => n.id !== saved.id);
      return [...rest, saved];
    });
  }

  async function remove(id: string) {
    await fetch(`/api/workspace/notes?id=${id}`, { method: "DELETE" });
    setNotes((all) => all.filter((n) => n.id !== id));
  }

  return (
    <div className="rounded-card border border-line bg-white p-4">
      <p className="eyebrow flex items-center gap-2 text-slate">
        <Glyph name="IconLineageDoc" size={14} /> What the machine should know
      </p>
      <p className="mt-2 text-xs text-slate">
        Stack, conventions, what not to touch. Every run reads these first.
      </p>

      {notes.map((note) => (
        <div key={note.id} className="mt-3 rounded-input border border-line p-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex-1 truncate text-sm font-medium text-ink">{note.title}</p>
            <button
              type="button"
              aria-label={`Remove ${note.title}`}
              className="text-mute hover:text-amber"
              onClick={() => remove(note.id)}
            >
              ×
            </button>
          </div>
          <textarea
            defaultValue={note.body}
            rows={3}
            onBlur={(e) => {
              if (e.target.value !== note.body) {
                save({ id: note.id, title: note.title, body: e.target.value });
              }
            }}
            className="mt-1 w-full rounded-input border border-line px-2 py-1 text-xs text-ink"
          />
        </div>
      ))}

      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          save({ title, body: "" });
          setTitle("");
        }}
      >
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="New note, e.g. Stack"
          className="flex-1 rounded-input border border-line px-3 py-1.5 text-sm text-ink placeholder:text-mute"
        />
        <button type="submit" disabled={!title.trim()} className="eyebrow text-indigo pressable disabled:text-mute">
          Add
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-amber">{error}</p>}
    </div>
  );
}
