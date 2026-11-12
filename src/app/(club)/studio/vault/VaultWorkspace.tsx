"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Portrait } from "@/components/ui/Portrait";
import type { StudioPost } from "@/server/services/studio";

type StagedFile = {
  id: string;
  name: string;
  sizeBytes: number;
  kind: "image" | "video";
  previewUrl: string;
  progress: number;
};

const ACCESS_LABELS: Record<StudioPost["access"], string> = {
  preview: "Everyone",
  members: "Members",
  vip: "VIP",
  ppv: "Pay-per-view",
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function VaultWorkspace({
  posts,
  uploadsEnabled,
}: {
  posts: StudioPost[];
  uploadsEnabled: boolean;
}) {
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"all" | "image" | "set" | "video">("all");
  const [accessFilter, setAccessFilter] = useState<"all" | StudioPost["access"]>("all");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [previewItem, setPreviewItem] = useState<StudioPost | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (kindFilter !== "all" && p.mediaKind !== kindFilter) return false;
      if (accessFilter !== "all" && p.access !== accessFilter) return false;
      if (q && !p.teaser.toLowerCase().includes(q) && !p.body.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, query, kindFilter, accessFilter]);

  function toggleSelect(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllVisible() {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((p) => p.id));
    }
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added: StagedFile[] = Array.from(files).map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      name: file.name,
      sizeBytes: file.size,
      kind: file.type.startsWith("video/") ? "video" : "image",
      previewUrl: URL.createObjectURL(file),
      progress: 100,
    }));
    setStaged((prev) => [...added, ...prev]);
  }

  function removeStaged(id: string) {
    setStaged((prev) => {
      const target = prev.find((f) => f.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((f) => f.id !== id);
    });
  }

  return (
    <div className="mt-8 space-y-8">
      {/* Upload & Capture Dock */}
      <section
        aria-labelledby="vault-upload-heading"
        className="rounded-[var(--radius-xl)] border border-line bg-ink-2/90 p-6 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)] md:p-8"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="eyebrow text-gold">Private Media Ingestion</p>
            <h2 id="vault-upload-heading" className="mt-1 font-display text-[24px] text-ivory">
              Upload from desktop, phone gallery, or camera
            </h2>
            <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-stone">
              {uploadsEnabled
                ? "Select photos or videos to stage in your private creator vault. All media is delivered via short-lived signed URLs after server-side entitlement checks."
                : "Local staging preview is active. Live object-storage ingestion is gated by FEATURE_UPLOADS until the production R2/S3 bucket is connected."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*"
              className="sr-only"
              aria-label="Choose files or gallery media"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*,video/*"
              capture="environment"
              className="sr-only"
              aria-label="Capture photo or video with camera"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <Button variant="outline" size="sm" onClick={() => cameraInputRef.current?.click()}>
              Camera capture
            </Button>
            <Button size="sm" onClick={() => fileInputRef.current?.click()}>
              Select files / Gallery
            </Button>
          </div>
        </div>

        {staged.length > 0 && (
          <div className="mt-6 border-t border-line pt-6">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[13px] font-medium text-ivory">
                Staged on this device ({staged.length})
              </p>
              <button
                type="button"
                onClick={() => {
                  staged.forEach((f) => URL.revokeObjectURL(f.previewUrl));
                  setStaged([]);
                }}
                className="text-[12px] text-stone underline decoration-line-strong underline-offset-4 hover:text-ivory"
              >
                Clear staged files
              </button>
            </div>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {staged.map((f) => (
                <li
                  key={f.id}
                  className="overflow-hidden rounded-[var(--radius-lg)] border border-gold/30 bg-ink p-3"
                >
                  <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-md)] bg-ink-3">
                    {f.kind === "video" ? (
                      <video
                        src={f.previewUrl}
                        controls
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={f.previewUrl}
                        alt={f.name}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute left-2 top-2">
                      <Badge tone="vip">{f.kind}</Badge>
                    </span>
                  </div>
                  <div className="mt-3">
                    <p className="truncate text-[13px] font-medium text-ivory" title={f.name}>
                      {f.name}
                    </p>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-ash">
                      <span>{formatBytes(f.sizeBytes)}</span>
                      <span>{uploadsEnabled ? "Ready" : "Local preview"}</span>
                    </div>
                    <div
                      aria-label="Upload progress"
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-3"
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-gold to-pink"
                        style={{ width: `${f.progress}%` }}
                      />
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <Link
                        href="/studio/posts/new"
                        className="text-[12px] text-gold underline decoration-gold/40 underline-offset-4 hover:text-gold-soft"
                      >
                        Attach to post
                      </Link>
                      <button
                        type="button"
                        onClick={() => removeStaged(f.id)}
                        className="text-[12px] text-danger hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Search, Filters & Multi-Selection Bar */}
      <section aria-label="Vault search and filters" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-line bg-ink-2 p-4">
          <div className="flex min-w-[240px] flex-1 items-center gap-3">
            <label htmlFor="vault-search" className="sr-only">
              Search media by teaser or caption
            </label>
            <input
              id="vault-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search vault by caption or teaser…"
              className="h-10 w-full max-w-md rounded-full border border-line bg-ink px-4 text-[14px] text-ivory placeholder:text-ash/60 focus:border-gold focus:outline-none"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "image", "set", "video"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKindFilter(k)}
                aria-pressed={kindFilter === k}
                className={`rounded-full px-3.5 py-1.5 text-[12px] uppercase tracking-[0.14em] transition-colors ${
                  kindFilter === k
                    ? "border border-gold/40 bg-gold/[0.14] text-gold-soft"
                    : "border border-line text-stone hover:text-ivory"
                }`}
              >
                {k === "all" ? "All types" : k}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(["all", "preview", "members", "vip", "ppv"] as const).map((acc) => (
              <button
                key={acc}
                type="button"
                onClick={() => setAccessFilter(acc)}
                aria-pressed={accessFilter === acc}
                className={`rounded-full px-3 py-1.5 text-[12px] transition-colors ${
                  accessFilter === acc
                    ? "border border-pink/40 bg-pink/[0.14] text-pink-soft"
                    : "border border-line text-stone hover:text-ivory"
                }`}
              >
                {acc === "all" ? "All access" : ACCESS_LABELS[acc]}
              </button>
            ))}
          </div>
        </div>

        {filtered.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 px-1 text-[13px] text-stone">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={selectAllVisible}
                className="text-gold-soft underline decoration-gold/40 underline-offset-4 hover:text-ivory"
              >
                {selectedIds.length === filtered.length ? "Clear selection" : "Select all visible"}
              </button>
              {selectedIds.length > 0 && (
                <span className="text-ivory">
                  {selectedIds.length} item{selectedIds.length === 1 ? "" : "s"} selected
                </span>
              )}
            </div>
            <span>
              Showing {filtered.length} of {posts.length} vault item{posts.length === 1 ? "" : "s"}
            </span>
          </div>
        )}
      </section>

      {/* Vault Media Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-xl)] border border-line bg-ink-2 p-10 text-center">
          <p className="eyebrow text-gold">Creator Vault</p>
          <h3 className="mt-3 font-display text-[28px] text-ivory">
            {posts.length === 0 ? "Your vault has no published or draft releases yet" : "No releases match that filter"}
          </h3>
          <p className="mx-auto mt-2 max-w-md text-[14px] leading-relaxed text-stone">
            {posts.length === 0
              ? "Every image, gallery set, and video release you draft or publish in Studio is organized here with server-enforced access tiers."
              : "Try clearing the search query or switching the media type and access filters above."}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {posts.length === 0 ? (
              <Button href="/studio/posts/new" size="sm">
                Create first release
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setKindFilter("all");
                  setAccessFilter("all");
                }}
              >
                Reset filters
              </Button>
            )}
          </div>
        </div>
      ) : (
        <ul aria-label="Vault media items" className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item, idx) => {
            const isSelected = selectedIds.includes(item.id);
            return (
              <li
                key={item.id}
                className={`group overflow-hidden rounded-[var(--radius-xl)] border bg-ink-2 transition-colors ${
                  isSelected ? "border-gold shadow-[0_0_28px_-10px_rgba(216,173,82,0.45)]" : "border-line hover:border-gold/35"
                }`}
              >
                <div className="relative aspect-[4/5] overflow-hidden bg-ink-3">
                  <Portrait
                    alt={item.teaser}
                    study={{
                      hair: (["wrap", "bun", "crop", "long"] as const)[idx % 4],
                      light: idx % 2 === 0 ? "left" : "right",
                      adorn: (["crown", "hoops", "collar", "none"] as const)[idx % 4],
                      glow: 0.75,
                    }}
                    className="h-full w-full"
                  />
                  <div className="absolute inset-x-3 top-3 flex items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={item.state === "published" ? "vip" : item.state === "scheduled" ? "member" : "neutral"}>
                        {item.state}
                      </Badge>
                      <Badge tone="neutral">
                        {item.mediaKind === "set" ? `Set · ${item.mediaCount}` : item.mediaKind}
                      </Badge>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleSelect(item.id)}
                      aria-pressed={isSelected}
                      aria-label={`Select ${item.teaser}`}
                      className={`flex h-8 w-8 items-center justify-center rounded-full border text-[12px] transition-colors ${
                        isSelected
                          ? "border-gold bg-gold text-ink"
                          : "border-line-strong bg-ink/80 text-ivory hover:border-gold"
                      }`}
                    >
                      {isSelected ? "✓" : ""}
                    </button>
                  </div>
                </div>
                <div className="p-5">
                  <div className="flex items-center justify-between gap-2 text-[11px] uppercase tracking-[0.16em] text-gold-soft">
                    <span>{ACCESS_LABELS[item.access]}</span>
                    <span className="text-ash">
                      {new Date(item.updatedAt).toLocaleDateString("en-GB", { dateStyle: "medium" })}
                    </span>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[15px] font-medium text-ivory">{item.teaser}</p>
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[13px]">
                    <button
                      type="button"
                      onClick={() => setPreviewItem(item)}
                      className="text-stone transition-colors hover:text-ivory"
                    >
                      Preview
                    </button>
                    <Link
                      href={`/studio/posts/${item.id}`}
                      className="text-gold underline decoration-gold/40 underline-offset-4 hover:text-gold-soft"
                    >
                      Manage / Delete
                    </Link>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Preview Modal */}
      {previewItem && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="vault-preview-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/85 p-5 backdrop-blur-md"
        >
          <div className="w-full max-w-lg rounded-[var(--radius-xl)] border border-line bg-ink-2 p-6 shadow-2xl md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="eyebrow text-gold">
                  {previewItem.mediaKind} · {ACCESS_LABELS[previewItem.access]}
                </p>
                <h3 id="vault-preview-title" className="mt-1 font-display text-[26px] text-ivory">
                  {previewItem.teaser}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                aria-label="Close preview"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-line text-stone hover:text-ivory"
              >
                ✕
              </button>
            </div>
            {previewItem.body && (
              <p className="mt-4 text-[14px] leading-relaxed text-stone">{previewItem.body}</p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-3 border-t border-line pt-4">
              <Button variant="outline" size="sm" onClick={() => setPreviewItem(null)}>
                Close
              </Button>
              <Button href={`/studio/posts/${previewItem.id}`} size="sm">
                Edit or Delete Release
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

