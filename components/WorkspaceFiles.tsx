"use client";

// The file area of a project: drop things on it, browse what is there.
//
// A folder drop is walked client-side with webkitGetAsEntry and uploaded one
// file per request — sequential on purpose, this Mac is short on memory and
// "14 of 60" is honest progress. .git and node_modules are skipped in the
// walk; nobody means to upload those.

import { useCallback, useEffect, useRef, useState } from "react";

interface Entry {
  name: string;
  dir: boolean;
  size: number;
  mtime: string;
}

interface Upload {
  file: File;
  rel: string;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const MAX_BYTES = 25 * 1024 * 1024;
const SKIP = new Set([".git", "node_modules"]);

async function walkEntry(entry: FileSystemEntry, prefix: string, out: Upload[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, rel: prefix + entry.name });
    return;
  }
  if (entry.isDirectory) {
    if (SKIP.has(entry.name)) return;
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // Chrome hands entries back a hundred at a time; read until an empty batch.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walkEntry(child, `${prefix}${entry.name}/`, out);
    }
  }
}

export function WorkspaceFiles({ projectId }: { projectId: string }) {
  const [path, setPath] = useState("");
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [preview, setPreview] = useState<{ name: string; text: string } | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (p: string) => {
      const res = await fetch(
        `/api/workspace/projects/${projectId}/files?path=${encodeURIComponent(p)}`,
        { cache: "no-store" },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error ?? "The files could not be read.");
        return;
      }
      setEntries(body.entries);
    },
    [projectId],
  );

  useEffect(() => {
    // Fetch-on-mount: every setState in load happens after an await, never
    // synchronously during the effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(path);
  }, [load, path]);

  const uploadAll = useCallback(
    async (uploads: Upload[]) => {
      setError(null);
      const tooBig = uploads.filter((u) => u.file.size > MAX_BYTES);
      const fit = uploads.filter((u) => u.file.size <= MAX_BYTES);
      if (fit.length === 0) {
        setError("Everything in that drop is over 25 MB.");
        return;
      }
      for (let i = 0; i < fit.length; i++) {
        setProgress(`${i + 1} of ${fit.length}`);
        const { file, rel } = fit[i];
        const target = path ? `${path}/${rel}` : rel;
        const last = i === fit.length - 1;
        const res = await fetch(
          `/api/workspace/projects/${projectId}/files?path=${encodeURIComponent(target)}${last ? "&commit=1" : ""}`,
          { method: "POST", body: file },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setError(`${rel}: ${body.error ?? "upload failed."}`);
          break;
        }
      }
      setProgress(null);
      if (tooBig.length > 0) {
        setError(`${tooBig.length} file${tooBig.length > 1 ? "s" : ""} over 25 MB skipped.`);
      }
      load(path);
    },
    [load, path, projectId],
  );

  const onDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setOver(false);
      const out: Upload[] = [];
      const entries = Array.from(e.dataTransfer.items)
        .map((item) => item.webkitGetAsEntry())
        .filter((entry): entry is FileSystemEntry => entry !== null);
      for (const entry of entries) await walkEntry(entry, "", out);
      if (out.length > 0) await uploadAll(out);
    },
    [uploadAll],
  );

  const onPick = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      if (files.length === 0) return;
      await uploadAll(
        files.map((file) => ({
          file,
          rel: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
        })),
      );
      e.target.value = "";
    },
    [uploadAll],
  );

  const openPreview = useCallback(
    async (name: string) => {
      const target = path ? `${path}/${name}` : name;
      const res = await fetch(
        `/api/workspace/projects/${projectId}/files?path=${encodeURIComponent(target)}&preview=1`,
        { cache: "no-store" },
      );
      if (!res.ok) return;
      setPreview({ name, text: await res.text() });
    },
    [path, projectId],
  );

  const remove = useCallback(
    async (name: string) => {
      if (!confirm(`Remove ${name}?`)) return;
      const target = path ? `${path}/${name}` : name;
      await fetch(
        `/api/workspace/projects/${projectId}/files?path=${encodeURIComponent(target)}`,
        { method: "DELETE" },
      );
      load(path);
    },
    [load, path, projectId],
  );

  const crumbs = path ? path.split("/") : [];

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={`rounded-card border-2 border-dashed px-6 py-8 text-center transition-colors ${
          over ? "border-indigo bg-indigo-tint" : "border-line bg-white"
        }`}
      >
        <p className="text-sm text-slate">
          {progress ? `Uploading ${progress}…` : "Drop files or a folder here"}
        </p>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="eyebrow mt-2 text-indigo pressable"
        >
          or choose files
        </button>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          onChange={onPick}
        />
      </div>

      {error && <p className="text-sm text-amber">{error}</p>}

      <nav className="eyebrow flex flex-wrap items-center gap-1 text-slate">
        <button type="button" className="hover:text-indigo" onClick={() => setPath("")}>
          Files
        </button>
        {crumbs.map((seg, i) => (
          <span key={i} className="flex items-center gap-1">
            <span>/</span>
            <button
              type="button"
              className="hover:text-indigo"
              onClick={() => setPath(crumbs.slice(0, i + 1).join("/"))}
            >
              {seg}
            </button>
          </span>
        ))}
      </nav>

      {entries && entries.length === 0 && (
        <p className="text-sm text-mute">Nothing here yet.</p>
      )}

      {entries && entries.length > 0 && (
        <ul className="inset-group">
          {entries.map((entry) => (
            <li key={entry.name} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm text-ink hover:text-indigo"
                onClick={() =>
                  entry.dir
                    ? setPath(path ? `${path}/${entry.name}` : entry.name)
                    : openPreview(entry.name)
                }
              >
                {entry.dir ? `${entry.name}/` : entry.name}
              </button>
              {!entry.dir && <span className="tabular text-xs text-mute">{fmtSize(entry.size)}</span>}
              <button
                type="button"
                aria-label={`Remove ${entry.name}`}
                className="text-mute hover:text-amber"
                onClick={() => remove(entry.name)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <div className="rounded-card border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line px-4 py-2">
            <span className="eyebrow text-slate">{preview.name}</span>
            <button
              type="button"
              className="text-mute hover:text-ink"
              onClick={() => setPreview(null)}
            >
              ×
            </button>
          </div>
          <pre className="max-h-96 overflow-auto px-4 py-3 text-xs text-ink">
            {preview.text}
          </pre>
        </div>
      )}
    </div>
  );
}
