"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, X } from "lucide-react";
import { cn, downloadBlob } from "@/lib/utils";
import { getAudioBlob } from "@/lib/db/indexedDB";
import { encodeMp3, encodeWav, exportProjectSonare, renderMixdown } from "@/lib/audio/exporter";
import { useProjectStore } from "@/lib/store/projectStore";
import { useToast } from "@/components/shared/ToastProvider";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import type { Project } from "@/types";

export interface ExportDialogProps {
  open: boolean;
  onClose: () => void;
}

type ExportMode = "mixdown" | "track" | "project";
type ExportFormat = "mp3" | "wav";
type Mp3Bitrate = 128 | 192 | 320;
type WavBitDepth = 16 | 24;

/**
 * Export modal: full mixdown or a single track, MP3 (128/192/320 kbps) or
 * WAV (16/24-bit). Renders offline via renderMixdown, encodes and triggers
 * a browser download. Escape closes (disabled while rendering).
 */
export function ExportDialog({ open, onClose }: ExportDialogProps) {
  const t = useTranslations("studio");
  const tExport = useTranslations("export");
  const tDash = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const toast = useToast();
  const project = useProjectStore((state) => state.project);

  const [mode, setMode] = useState<ExportMode>("mixdown");
  const [trackId, setTrackId] = useState<string>("");
  const [format, setFormat] = useState<ExportFormat>("mp3");
  const [bitrate, setBitrate] = useState<Mp3Bitrate>(192);
  const [bitDepth, setBitDepth] = useState<WavBitDepth>(16);
  const [exporting, setExporting] = useState(false);

  const titleId = useId();
  const scopeId = useId();
  const trackSelectId = useId();
  const formatId = useId();
  const qualityId = useId();

  const audioTracks = project?.tracks.filter(
    (track) => track.kind === "audio" && track.audioKey !== "",
  ) ?? [];

  /* Reset per-open defaults once the dialog becomes visible. */
  useEffect(() => {
    if (open) {
      setMode("mixdown");
      setTrackId((current) => current || audioTracks[0]?.id || "");
      setExporting(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* Escape closes (unless a render is in flight). */
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !exporting) onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, exporting, onClose]);

  if (!open || !project) return null;

  const selectedTrack = audioTracks.find((track) => track.id === trackId) ?? audioTracks[0];
  const canExport =
    mode === "project"
      ? true
      : mode === "track"
        ? selectedTrack !== undefined
        : audioTracks.length > 0;

  async function handleExport() {
    if (!project) return;
    setExporting(true);
    try {
      // Full project archive (.sonare): metadata + every track's audio
      // embedded as base64. No mixdown render needed.
      if (mode === "project") {
        const blob = await exportProjectSonare(project, getAudioBlob);
        const safeName = project.name.replace(/[\\/:*?"<>|]+/g, "_");
        downloadBlob(blob, `${safeName}.sonare`);
        toast.success(tDash("exported"));
        onClose();
        return;
      }

      // For single-track export, build a temporary Project containing only
      // that track (audible) — renderMixdown needs no other changes.
      const renderProject: Project =
        mode === "track" && selectedTrack
          ? {
              ...project,
              tracks: [{ ...selectedTrack, mute: false, solo: false }],
            }
          : project;

      const buffer = await renderMixdown(renderProject, getAudioBlob);
      const baseName =
        mode === "track" && selectedTrack
          ? `${project.name} - ${selectedTrack.name}`
          : project.name;
      const safeBase = baseName.replace(/[\\/:*?"<>|]+/g, "_");

      if (format === "mp3") {
        const blob = await encodeMp3(buffer, bitrate);
        downloadBlob(blob, `${safeBase}.mp3`);
      } else {
        const blob = await encodeWav(buffer, bitDepth);
        downloadBlob(blob, `${safeBase}.wav`);
      }
      toast.success(t("exported"));
      onClose();
    } catch (error) {
      console.error(error);
      toast.error(tErrors("exportFailed"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={() => {
        if (!exporting) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-semibold text-neutral-100">
            {t("export")}
          </h2>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={tCommon("close")}
            onClick={onClose}
            disabled={exporting}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
        </div>

        <div className="mt-4 flex flex-col gap-4">
          {/* Scope */}
          <div className="flex flex-col gap-1">
            <label htmlFor={scopeId} className="text-xs text-neutral-400">
              {t("export")}
            </label>
            <select
              id={scopeId}
              value={mode}
              onChange={(event) => setMode(event.target.value as ExportMode)}
              aria-label={t("export")}
              className="input-field"
              disabled={exporting}
            >
              <option value="mixdown">{t("exportMixdown")}</option>
              <option value="track">{t("exportTrack")}</option>
              <option value="project">{tDash("exportSonare")}</option>
            </select>
          </div>

          {/* Track picker (single-track mode) */}
          {mode === "track" && (
            <div className="flex flex-col gap-1">
              <label htmlFor={trackSelectId} className="text-xs text-neutral-400">
                {t("track")}
              </label>
              <select
                id={trackSelectId}
                value={selectedTrack?.id ?? ""}
                onChange={(event) => setTrackId(event.target.value)}
                aria-label={`${t("exportTrack")} — ${t("track")}`}
                className="input-field"
                disabled={exporting || audioTracks.length === 0}
              >
                {audioTracks.map((track) => (
                  <option key={track.id} value={track.id}>
                    {track.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Format + quality only apply to rendered audio (not .sonare). */}
          {mode !== "project" && (
            <>
          <div className="flex flex-col gap-1">
            <label htmlFor={formatId} className="text-xs text-neutral-400">
              {t("format")}
            </label>
            <select
              id={formatId}
              value={format}
              onChange={(event) => setFormat(event.target.value as ExportFormat)}
              aria-label={t("format")}
              className="input-field"
              disabled={exporting}
            >
              <option value="mp3">{tExport("mp3")}</option>
              <option value="wav">{tExport("wav")}</option>
            </select>
          </div>

          {/* Quality */}
          <div className="flex flex-col gap-1">
            <label htmlFor={qualityId} className="text-xs text-neutral-400">
              {t("quality")}
            </label>
            <select
              id={qualityId}
              value={format === "mp3" ? String(bitrate) : String(bitDepth)}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (format === "mp3") {
                  setBitrate(value as Mp3Bitrate);
                } else {
                  setBitDepth(value as WavBitDepth);
                }
              }}
              aria-label={t("quality")}
              className="input-field"
              disabled={exporting}
            >
              {format === "mp3" ? (
                <>
                  <option value="128">{tExport("bitrate128")}</option>
                  <option value="192">{tExport("bitrate192")}</option>
                  <option value="320">{tExport("bitrate320")}</option>
                </>
              ) : (
                <>
                  <option value="16">{tExport("bit16")}</option>
                  <option value="24">{tExport("bit24")}</option>
                </>
              )}
            </select>
            <p className="text-xs text-neutral-500">{tExport("sampleRate")}</p>
          </div>
            </>
          )}

          {exporting && (
            <p className="flex items-center gap-2 text-sm text-neutral-300" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-accent" aria-hidden="true" />
              {t("exporting")}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <AccessibleButton
              variant="secondary"
              ariaLabel={tCommon("cancel")}
              onClick={onClose}
              disabled={exporting}
            >
              {tCommon("cancel")}
            </AccessibleButton>
            <AccessibleButton
              variant="primary"
              ariaLabel={tExport("download")}
              onClick={() => void handleExport()}
              disabled={exporting || !canExport}
              className={cn(exporting && "opacity-70")}
            >
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : null}
              {t("export")}
            </AccessibleButton>
          </div>
        </div>
      </div>
    </div>
  );
}
