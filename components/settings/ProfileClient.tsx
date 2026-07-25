"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { ArrowLeft, Loader2, Save, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/shared/AppHeader";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { useToast } from "@/components/shared/ToastProvider";

/** Keys mirrored from settings.instruments.* (18 options). */
const INSTRUMENT_KEYS = [
  "clarinet",
  "accordion",
  "flute",
  "violin",
  "guitar",
  "electricGuitar",
  "bass",
  "piano",
  "electricPiano",
  "organ",
  "drums",
  "percussion",
  "voice",
  "saxophone",
  "trumpet",
  "trombone",
  "cello",
  "other",
] as const;

export function ProfileClient() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tInstruments = useTranslations("settings.instruments");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const { user, isAuthenticated, isLoading } = useAuth();

  const [name, setName] = useState("");
  const [instrument, setInstrument] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  /* Guests have no profile to edit: send them to the login page. */
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.replace(`/${locale}/auth/login`);
    }
  }, [isLoading, isAuthenticated, locale, router]);

  /* Pre-fill the form once the session is available. */
  useEffect(() => {
    if (user) {
      setName(user.name ?? "");
      setInstrument(user.instrument ?? "");
    }
  }, [user]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim().length < 2) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          instrument: instrument || undefined,
        }),
      });
      if (res.status === 401) {
        toast.error(tErrors("unauthorized"));
        router.replace(`/${locale}/auth/login`);
        return;
      }
      if (!res.ok) {
        toast.error(tErrors("generic"));
        return;
      }
      toast.success(t("profileSaved"));
      router.refresh();
    } catch {
      toast.error(tErrors("networkError"));
    } finally {
      setIsSaving(false);
    }
  }

  if (isLoading || !isAuthenticated || !user) {
    return (
      <div className="flex min-h-dvh flex-col">
        <AppHeader />
        <main className="flex flex-1 items-center justify-center">
          <LoadingSpinner />
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 sm:px-6">
        <div className="card p-6 sm:p-8">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <UserRound className="h-10 w-10 text-accent" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-neutral-100">
              {t("editProfile")}
            </h1>
            <p className="text-sm text-neutral-400">{user.email}</p>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="profile-name"
                className="text-sm text-neutral-300"
              >
                {t("name")}
              </label>
              <input
                id="profile-name"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="input-field"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="profile-instrument"
                className="text-sm text-neutral-300"
              >
                {t("mainInstrument")}
              </label>
              <select
                id="profile-instrument"
                value={instrument}
                onChange={(event) => setInstrument(event.target.value)}
                className="input-field"
              >
                <option value="">{t("mainInstrument")}</option>
                {INSTRUMENT_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {tInstruments(key)}
                  </option>
                ))}
              </select>
            </div>

            <AccessibleButton
              type="submit"
              variant="primary"
              className="w-full"
              ariaLabel={t("saveChanges")}
              disabled={isSaving || name.trim().length < 2}
            >
              {isSaving ? (
                <Loader2
                  className="h-4 w-4 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {t("saveChanges")}
            </AccessibleButton>
          </form>

          <p className="mt-6 text-center text-sm">
            <Link
              href={`/${locale}/settings`}
              className="inline-flex items-center gap-1 text-accent hover:underline"
              aria-label={tCommon("back")}
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {tCommon("back")}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
