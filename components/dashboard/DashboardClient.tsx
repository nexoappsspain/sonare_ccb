"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import {
  Cloud,
  CloudOff,
  CloudUpload,
  Download,
  FileDown,
  FolderOpen,
  HardDrive,
  Loader2,
  LogIn,
  Plus,
  Upload,
} from "lucide-react";
import type { Project, Track } from "@/types";
import {
  deleteProject,
  duplicateProject,
  getAudioBlob,
  getProject,
  listProjects,
  saveAudioBlob,
  saveProject,
} from "@/lib/db/indexedDB";
import { exportProjectSonare, importProjectSonare } from "@/lib/audio/exporter";
import { downloadBlob } from "@/lib/utils";
import { DEFAULT_BPM, useProjectStore } from "@/lib/store/projectStore";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/shared/AppHeader";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { ProjectCard } from "@/components/shared/ProjectCard";
import { useToast } from "@/components/shared/ToastProvider";

/** Normalized, metadata-only view of a project returned by /api/projects. */
interface CloudProjectSummary {
  id: string;
  name: string;
  bpm: number;
  trackCount: number;
  updatedAt?: string;
}

/**
 * Defensive normalization of the GET /api/projects payload: the route is
 * delivered in a later stage, so any non-conforming body degrades to an
 * empty list instead of breaking the dashboard.
 */
function normalizeCloudList(data: unknown): CloudProjectSummary[] {
  // API contract: { projects: [...] }. Accept a bare array defensively.
  const list: unknown = Array.isArray(data)
    ? data
    : data && typeof data === "object"
      ? (data as Record<string, unknown>).projects
      : undefined;
  if (!Array.isArray(list)) return [];
  const result: CloudProjectSummary[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.id !== "string" || typeof record.name !== "string") {
      continue;
    }
    result.push({
      id: record.id,
      name: record.name,
      bpm: typeof record.bpm === "number" ? record.bpm : DEFAULT_BPM,
      trackCount:
        typeof record.trackCount === "number"
          ? record.trackCount
          : Array.isArray(record.tracks)
            ? record.tracks.length
            : 0,
      updatedAt:
        typeof record.updatedAt === "string" ? record.updatedAt : undefined,
    });
  }
  return result;
}

export function DashboardClient() {
  const tDash = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tStudio = useTranslations("studio");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const newProject = useProjectStore((state) => state.newProject);

  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoadingLocal, setIsLoadingLocal] = useState(true);
  const [cloudProjects, setCloudProjects] = useState<CloudProjectSummary[]>([]);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [newName, setNewName] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Project | null>(null);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [savingCloudId, setSavingCloudId] = useState<string | null>(null);
  const [loadingCloudId, setLoadingCloudId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshProjects = useCallback(async () => {
    const list = await listProjects();
    setProjects(list);
  }, []);

  /* Initial load of the local (IndexedDB) project list. */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await listProjects();
        if (!cancelled) setProjects(list);
      } finally {
        if (!cancelled) setIsLoadingLocal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* Cloud list: only fetched while authenticated; any failure -> empty list. */
  useEffect(() => {
    if (!isAuthenticated) {
      setCloudProjects([]);
      setIsLoadingCloud(false);
      return;
    }
    let cancelled = false;
    setIsLoadingCloud(true);
    (async () => {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) {
          if (!cancelled) setCloudProjects([]);
          return;
        }
        const data: unknown = await res.json();
        if (!cancelled) setCloudProjects(normalizeCloudList(data));
      } catch {
        if (!cancelled) setCloudProjects([]);
      } finally {
        if (!cancelled) setIsLoadingCloud(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated]);

  /* ------------------------------ New project ----------------------------- */

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = newName.trim();
    if (!name) return;
    newProject(name);
    router.push(`/${locale}/studio`);
  }

  /* ---------------------------- Import .sonare ---------------------------- */

  async function handleImportFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so importing the same file twice still fires onChange.
    event.target.value = "";
    if (!file) return;

    setIsImporting(true);
    try {
      const { project, audio } = await importProjectSonare(file);
      for (const [audioKey, blob] of Object.entries(audio)) {
        await saveAudioBlob(audioKey, blob);
      }
      const now = new Date().toISOString();
      await saveProject({
        ...project,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: undefined,
        cloudId: undefined,
      });
      await refreshProjects();
      toast.success(tDash("importSuccess"));
    } catch {
      toast.error(tErrors("generic"));
    } finally {
      setIsImporting(false);
    }
  }

  /* --------------------------- Local project CRUD -------------------------- */

  function handleOpen(project: Project) {
    router.push(`/${locale}/studio/project/${project.id}`);
  }

  async function handleRename(project: Project, name: string) {
    await saveProject({
      ...project,
      name,
      updatedAt: new Date().toISOString(),
    });
    await refreshProjects();
  }

  async function handleDuplicate(project: Project) {
    await duplicateProject(project.id);
    await refreshProjects();
  }

  async function handleExportSonare(project: Project) {
    setExportingId(project.id);
    try {
      // Re-read the full project from IndexedDB (the list may be stale) and
      // embed every track's audio as base64 — slow on large projects.
      const full = await getProject(project.id);
      if (!full) {
        toast.error(tErrors("exportFailed"));
        return;
      }
      const blob = await exportProjectSonare(full, getAudioBlob);
      const safeName = full.name.replace(/[\\/:*?"<>|]+/g, "_");
      downloadBlob(blob, `${safeName}.sonare`);
      toast.success(tDash("exported"));
    } catch {
      toast.error(tErrors("exportFailed"));
    } finally {
      setExportingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!pendingDelete) return;
    await deleteProject(pendingDelete.id);
    setPendingDelete(null);
    await refreshProjects();
  }

  /* -------------------------------- Cloud sync ----------------------------- */

  async function handleSaveToCloud(project: Project) {
    setSavingCloudId(project.id);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: project.name,
          bpm: project.bpm,
          tracks: project.tracks,
        }),
      });
      if (res.status === 401) {
        toast.error(tDash("loginToSync"));
        return;
      }
      if (!res.ok) {
        toast.error(tErrors("networkError"));
        return;
      }
      toast.success(tDash("savedCloud"));
    } catch {
      toast.error(tErrors("networkError"));
    } finally {
      setSavingCloudId(null);
    }
  }

  async function handleLoadCloudProject(cloudId: string) {
    setLoadingCloudId(cloudId);
    try {
      const res = await fetch(`/api/projects/${cloudId}`);
      if (res.status === 401) {
        toast.error(tDash("loginToSync"));
        return;
      }
      if (!res.ok) {
        toast.error(tErrors("networkError"));
        return;
      }
      const data: unknown = await res.json();
      if (!data || typeof data !== "object") {
        toast.error(tErrors("generic"));
        return;
      }
      const record = data as Record<string, unknown>;
      const now = new Date().toISOString();
      const localProject: Project = {
        id: crypto.randomUUID(),
        name:
          typeof record.name === "string" && record.name.trim()
            ? record.name
            : tDash("newProject"),
        bpm: typeof record.bpm === "number" ? record.bpm : DEFAULT_BPM,
        tracks: Array.isArray(record.tracks)
          ? (record.tracks as Track[])
          : [],
        createdAt:
          typeof record.createdAt === "string" ? record.createdAt : now,
        updatedAt: now,
        cloudId,
      };
      await saveProject(localProject);
      await refreshProjects();
      toast.success(tStudio("projectLoaded"));
      router.push(`/${locale}/studio/project/${localProject.id}`);
    } catch {
      toast.error(tErrors("networkError"));
    } finally {
      setLoadingCloudId(null);
    }
  }

  /* --------------------------------- Render -------------------------------- */

  const formattedCloudDate = (iso: string): string =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-neutral-100 sm:text-2xl">
            {tDash("title")}
          </h1>
          <p className="mt-1 text-sm text-neutral-400">{tDash("subtitle")}</p>
        </div>

        {/* New project + import */}
        <section
          aria-labelledby="dashboard-new-project"
          className="card mb-8"
        >
          <h2
            id="dashboard-new-project"
            className="text-base font-semibold text-neutral-100"
          >
            {tDash("newProject")}
          </h2>
          <form
            onSubmit={handleCreate}
            className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-1">
              <label
                htmlFor="new-project-name"
                className="text-sm text-neutral-300"
              >
                {tDash("projectName")}
              </label>
              <input
                id="new-project-name"
                type="text"
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                maxLength={120}
                placeholder={tDash("projectName")}
                className="input-field"
              />
            </div>
            <div className="flex gap-2">
              <AccessibleButton
                type="submit"
                variant="primary"
                ariaLabel={tDash("create")}
                disabled={!newName.trim()}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                {tDash("create")}
              </AccessibleButton>
              <AccessibleButton
                variant="secondary"
                ariaLabel={tDash("importSonare")}
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
              >
                {isImporting ? (
                  <Loader2
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Upload className="h-4 w-4" aria-hidden="true" />
                )}
                {tDash("importSonare")}
              </AccessibleButton>
            </div>
            <label htmlFor="import-sonare-file" className="sr-only">
              {tDash("importSonare")}
            </label>
            <input
              ref={fileInputRef}
              id="import-sonare-file"
              type="file"
              accept=".sonare,application/json"
              className="hidden"
              aria-label={tDash("importSonare")}
              onChange={(event) => {
                void handleImportFile(event);
              }}
            />
          </form>
        </section>

        {/* Local projects */}
        <section aria-labelledby="dashboard-local-projects">
          <h2
            id="dashboard-local-projects"
            className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-100"
          >
            <HardDrive className="h-4 w-4 text-accent" aria-hidden="true" />
            {tDash("localProjects")}
          </h2>

          {isLoadingLocal ? (
            <LoadingSpinner />
          ) : projects.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 py-10 text-center">
              <FolderOpen
                className="h-10 w-10 text-neutral-500"
                aria-hidden="true"
              />
              <p className="text-sm text-neutral-400">{tDash("emptyLocal")}</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((project) => (
                <li key={project.id} className="flex flex-col gap-2">
                  <ProjectCard
                    project={project}
                    onOpen={handleOpen}
                    onRename={(target, name) => {
                      void handleRename(target, name);
                    }}
                    onDuplicate={(target) => {
                      void handleDuplicate(target);
                    }}
                    onDelete={setPendingDelete}
                  />
                  <div className="flex flex-wrap gap-2">
                    <AccessibleButton
                      variant="secondary"
                      size="sm"
                      ariaLabel={`${tDash("exportSonare")}: ${project.name}`}
                      onClick={() => {
                        void handleExportSonare(project);
                      }}
                      disabled={exportingId === project.id}
                    >
                      {exportingId === project.id ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <FileDown className="h-4 w-4" aria-hidden="true" />
                      )}
                      {tDash("exportSonare")}
                    </AccessibleButton>
                    <AccessibleButton
                      variant="secondary"
                      size="sm"
                      ariaLabel={`${tDash("saveToCloud")}: ${project.name}`}
                      onClick={() => {
                        void handleSaveToCloud(project);
                      }}
                      disabled={savingCloudId === project.id}
                    >
                      {savingCloudId === project.id ? (
                        <Loader2
                          className="h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                      ) : (
                        <CloudUpload className="h-4 w-4" aria-hidden="true" />
                      )}
                      {tDash("saveToCloud")}
                    </AccessibleButton>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Cloud projects */}
        <section
          aria-labelledby="dashboard-cloud-projects"
          className="mt-8"
        >
          <h2
            id="dashboard-cloud-projects"
            className="mb-3 flex items-center gap-2 text-base font-semibold text-neutral-100"
          >
            <Cloud className="h-4 w-4 text-accent" aria-hidden="true" />
            {tDash("cloudProjects")}
          </h2>

          {isAuthLoading ? (
            <LoadingSpinner />
          ) : !isAuthenticated ? (
            <div className="card flex flex-col items-center gap-3 py-10 text-center">
              <CloudOff
                className="h-10 w-10 text-neutral-500"
                aria-hidden="true"
              />
              <p className="text-sm text-neutral-400">
                {tDash("loginToSync")}
              </p>
              <Link
                href={`/${locale}/auth/login`}
                className="btn-primary"
                aria-label={tCommon("login")}
              >
                <LogIn className="h-4 w-4" aria-hidden="true" />
                {tCommon("login")}
              </Link>
            </div>
          ) : isLoadingCloud ? (
            <LoadingSpinner />
          ) : cloudProjects.length === 0 ? (
            <div className="card flex flex-col items-center gap-3 py-10 text-center">
              <Cloud
                className="h-10 w-10 text-neutral-500"
                aria-hidden="true"
              />
              <p className="text-sm text-neutral-400">{tDash("emptyCloud")}</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {cloudProjects.map((cloudProject) => (
                <li key={cloudProject.id}>
                  <article
                    className="card flex h-full flex-col gap-3"
                    aria-label={cloudProject.name}
                  >
                    <h3 className="truncate text-base font-semibold text-neutral-100">
                      {cloudProject.name}
                    </h3>
                    <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
                      <div className="flex items-center gap-1">
                        <dt className="sr-only">{tStudio("bpm")}</dt>
                        <dd>{cloudProject.bpm} BPM</dd>
                      </div>
                      <div className="flex items-center gap-1">
                        <dt className="sr-only">{tDash("tracks")}</dt>
                        <dd>
                          {cloudProject.trackCount} {tDash("tracks")}
                        </dd>
                      </div>
                      {cloudProject.updatedAt && (
                        <div className="flex items-center gap-1">
                          <dt className="sr-only">{tDash("lastModified")}</dt>
                          <dd>{formattedCloudDate(cloudProject.updatedAt)}</dd>
                        </div>
                      )}
                    </dl>
                    <div className="mt-auto border-t border-border pt-3">
                      <AccessibleButton
                        variant="secondary"
                        size="sm"
                        ariaLabel={`${tDash("load")}: ${cloudProject.name}`}
                        onClick={() => {
                          void handleLoadCloudProject(cloudProject.id);
                        }}
                        disabled={loadingCloudId === cloudProject.id}
                      >
                        {loadingCloudId === cloudProject.id ? (
                          <Loader2
                            className="h-4 w-4 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Download
                            className="h-4 w-4"
                            aria-hidden="true"
                          />
                        )}
                        {tDash("load")}
                      </AccessibleButton>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={tCommon("delete")}
        message={tDash("deleteConfirm")}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
