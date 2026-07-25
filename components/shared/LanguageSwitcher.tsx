"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { locales, type Locale } from "@/lib/i18n/config";

const STORAGE_KEY = "sonare-locale";
const COOKIE_KEY = "NEXT_LOCALE";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const LOCALE_LABELS: Record<Locale, string> = {
  pt: "Português",
  es: "Español",
  en: "English",
};

/**
 * Locale switcher without next-intl navigation helpers:
 * swaps the first pathname segment (always /pt|/es|/en because
 * localePrefix is "always") and persists the choice in
 * localStorage + NEXT_LOCALE cookie.
 */
export function LanguageSwitcher() {
  const t = useTranslations("settings");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  // Avoid hydration mismatch: the stored preference only applies on the client.
  const [current, setCurrent] = useState<Locale>(locale);

  useEffect(() => {
    setCurrent(locale);
  }, [locale]);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (
      stored &&
      (locales as readonly string[]).includes(stored) &&
      stored !== locale
    ) {
      switchLocale(stored as Locale);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Locale) {
    window.localStorage.setItem(STORAGE_KEY, next);
    document.cookie = `${COOKIE_KEY}=${next}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  }

  function switchLocale(next: Locale) {
    if (next === locale) return;
    persist(next);
    const segments = pathname.split("/");
    // pathname always starts with "/{locale}"
    segments[1] = next;
    router.push(segments.join("/") || `/${next}`);
  }

  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    switchLocale(event.target.value as Locale);
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="language-switcher" className="text-xs text-neutral-400">
        {t("selectLanguage")}
      </label>
      <select
        id="language-switcher"
        value={current}
        onChange={handleChange}
        aria-label={t("language")}
        className="input-field"
      >
        {locales.map((option) => (
          <option key={option} value={option}>
            {LOCALE_LABELS[option]}
          </option>
        ))}
      </select>
    </div>
  );
}
