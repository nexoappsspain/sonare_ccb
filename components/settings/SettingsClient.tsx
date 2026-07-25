"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  Info,
  Languages,
  LogIn,
  Moon,
  Pencil,
  UserRound,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/shared/AppHeader";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";

const APP_VERSION = "3.0.0";

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

function isInstrumentKey(
  value: string,
): value is (typeof INSTRUMENT_KEYS)[number] {
  return (INSTRUMENT_KEYS as readonly string[]).includes(value);
}

export function SettingsClient() {
  const t = useTranslations("settings");
  const tCommon = useTranslations("common");
  const tInstruments = useTranslations("settings.instruments");
  const locale = useLocale();
  const { user, isAuthenticated, isLoading } = useAuth();

  return (
    <div className="flex min-h-dvh flex-col">
      <AppHeader />

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6">
        <h1 className="mb-6 text-xl font-semibold text-neutral-100 sm:text-2xl">
          {t("title")}
        </h1>

        <div className="flex flex-col gap-4">
          {/* Language */}
          <section aria-labelledby="settings-language" className="card">
            <h2
              id="settings-language"
              className="flex items-center gap-2 text-base font-semibold text-neutral-100"
            >
              <Languages className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("language")}
            </h2>
            <div className="mt-3 max-w-xs">
              <LanguageSwitcher />
            </div>
          </section>

          {/* Theme (dark only for now) */}
          <section aria-labelledby="settings-theme" className="card">
            <h2
              id="settings-theme"
              className="flex items-center gap-2 text-base font-semibold text-neutral-100"
            >
              <Moon className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("theme")}
            </h2>
            <div className="mt-3 flex flex-col gap-1">
              <p className="flex items-center gap-2 text-sm text-neutral-200">
                <Moon className="h-4 w-4 text-neutral-400" aria-hidden="true" />
                {t("dark")}
              </p>
              <p className="text-xs text-neutral-400">{t("darkOnly")}</p>
            </div>
          </section>

          {/* Profile */}
          <section aria-labelledby="settings-profile" className="card">
            <h2
              id="settings-profile"
              className="flex items-center gap-2 text-base font-semibold text-neutral-100"
            >
              <UserRound className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("profile")}
            </h2>
            <div className="mt-3">
              {isLoading ? (
                <LoadingSpinner className="min-h-[4rem]" />
              ) : isAuthenticated && user ? (
                <div className="flex flex-col gap-3">
                  <dl className="flex flex-col gap-1 text-sm">
                    <div className="flex items-center gap-2">
                      <dt className="w-36 shrink-0 text-neutral-400">
                        {t("name")}
                      </dt>
                      <dd className="text-neutral-100">
                        {user.name ?? "—"}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="w-36 shrink-0 text-neutral-400">
                        E-mail
                      </dt>
                      <dd className="text-neutral-100">
                        {user.email ?? "—"}
                      </dd>
                    </div>
                    <div className="flex items-center gap-2">
                      <dt className="w-36 shrink-0 text-neutral-400">
                        {t("mainInstrument")}
                      </dt>
                      <dd className="text-neutral-100">
                        {user.instrument
                          ? isInstrumentKey(user.instrument)
                            ? tInstruments(user.instrument)
                            : user.instrument
                          : "—"}
                      </dd>
                    </div>
                  </dl>
                  <div>
                    <Link
                      href={`/${locale}/settings/profile`}
                      className="btn-secondary"
                      aria-label={t("editProfile")}
                    >
                      <Pencil className="h-4 w-4" aria-hidden="true" />
                      {t("editProfile")}
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-start gap-3">
                  <p className="text-sm text-neutral-400">
                    {t("profile")} — {tCommon("login")}
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
              )}
            </div>
          </section>

          {/* About */}
          <section aria-labelledby="settings-about" className="card">
            <h2
              id="settings-about"
              className="flex items-center gap-2 text-base font-semibold text-neutral-100"
            >
              <Info className="h-4 w-4 text-accent" aria-hidden="true" />
              {t("about")}
            </h2>
            <div className="mt-3 flex flex-col gap-1 text-sm">
              <p className="text-neutral-100">
                {tCommon("appName")} — {t("version")} {APP_VERSION}
              </p>
              <p className="text-neutral-400">{t("aboutDescription")}</p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
