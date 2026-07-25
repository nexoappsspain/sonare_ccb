"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Music2, Pencil, Copy, Trash2, Check, X } from "lucide-react";
import type { Project } from "@/types";
import { AccessibleButton } from "@/components/shared/AccessibleButton";

export interface ProjectCardProps {
  project: Project;
  onOpen: (project: Project) => void;
  onRename: (project: Project, newName: string) => void;
  onDuplicate: (project: Project) => void;
  onDelete: (project: Project) => void;
}

/**
 * Project card for the dashboard. Rename happens through an inline
 * input (never window.prompt) with explicit save/cancel actions.
 */
export function ProjectCard({
  project,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: ProjectCardProps) {
  const t = useTranslations("common");
  const tDash = useTranslations("dashboard");
  const tStudio = useTranslations("studio");
  const locale = useLocale();

  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isRenaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isRenaming]);

  const formattedDate = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(project.updatedAt));

  function startRename() {
    setDraftName(project.name);
    setIsRenaming(true);
  }

  function commitRename() {
    const trimmed = draftName.trim();
    if (trimmed && trimmed !== project.name) {
      onRename(project, trimmed);
    }
    setIsRenaming(false);
  }

  function cancelRename() {
    setDraftName(project.name);
    setIsRenaming(false);
  }

  return (
    <article className="card flex flex-col gap-3" aria-label={project.name}>
      {isRenaming ? (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            commitRename();
          }}
        >
          <label htmlFor={`rename-${project.id}`} className="sr-only">
            {tDash("projectName")}
          </label>
          <input
            ref={inputRef}
            id={`rename-${project.id}`}
            type="text"
            value={draftName}
            onChange={(event) => setDraftName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") cancelRename();
            }}
            className="input-field"
            maxLength={120}
          />
          <AccessibleButton
            variant="icon"
            size="icon"
            ariaLabel={t("save")}
            onClick={commitRename}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="icon"
            ariaLabel={t("cancel")}
            onClick={cancelRename}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
        </form>
      ) : (
        <h3 className="truncate text-base font-semibold text-neutral-100">
          {project.name}
        </h3>
      )}

      <dl className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-400">
        <div className="flex items-center gap-1">
          <dt className="sr-only">{tStudio("bpm")}</dt>
          <dd>{project.bpm} BPM</dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">{tDash("tracks")}</dt>
          <dd>
            {project.tracks.length} {tDash("tracks")}
          </dd>
        </div>
        <div className="flex items-center gap-1">
          <dt className="sr-only">{tDash("lastModified")}</dt>
          <dd>{formattedDate}</dd>
        </div>
      </dl>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-border pt-3">
        <AccessibleButton
          variant="primary"
          size="sm"
          ariaLabel={`${tDash("openStudio")}: ${project.name}`}
          onClick={() => onOpen(project)}
        >
          <Music2 className="h-4 w-4" aria-hidden="true" />
          {tDash("openStudio")}
        </AccessibleButton>

        <div className="flex items-center gap-1">
          <AccessibleButton
            variant="icon"
            size="icon"
            ariaLabel={`${t("rename")}: ${project.name}`}
            onClick={startRename}
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="icon"
            ariaLabel={`${t("duplicate")}: ${project.name}`}
            onClick={() => onDuplicate(project)}
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="icon"
            ariaLabel={`${t("delete")}: ${project.name}`}
            onClick={() => onDelete(project)}
            className="text-red-400 hover:text-red-300"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
        </div>
      </div>
    </article>
  );
}
