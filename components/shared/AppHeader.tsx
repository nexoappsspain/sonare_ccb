"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { Music2 } from "lucide-react";
import { LanguageSwitcher } from "@/components/shared/LanguageSwitcher";
import { UserMenu } from "@/components/shared/UserMenu";

/**
 * Shared application header: logo (links to the localized home), language
 * switcher and user menu. Used by the studio shell and the dashboard.
 */
export function AppHeader() {
  const t = useTranslations("common");
  const locale = useLocale();

  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-panel px-3 sm:px-4">
      <Link
        href={`/${locale}`}
        className="flex min-w-0 items-center gap-2 rounded-lg px-1 py-1 text-neutral-100 transition-colors hover:text-accent"
        aria-label={t("appName")}
      >
        <Music2 className="h-5 w-5 shrink-0 text-accent" aria-hidden="true" />
        <span className="truncate text-sm font-semibold sm:text-base">
          {t("appName")}
        </span>
      </Link>
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="w-28 sm:w-36 [&_label]:sr-only">
          <LanguageSwitcher />
        </div>
        <UserMenu />
      </div>
    </header>
  );
}
