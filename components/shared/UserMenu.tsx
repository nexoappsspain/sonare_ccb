"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";
import { LogIn, LogOut, UserRound } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export function UserMenu() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const t = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();

  async function handleLogout() {
    await signOut({ redirect: false });
    router.push(`/${locale}/auth/login`);
    router.refresh();
  }

  if (isLoading) {
    return (
      <span
        className="text-sm text-neutral-500"
        role="status"
        aria-label={t("loading")}
      >
        {t("loading")}
      </span>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <Link
        href={`/${locale}/auth/login`}
        className="btn-secondary"
        aria-label={t("login")}
      >
        <LogIn className="h-4 w-4" aria-hidden="true" />
        {t("login")}
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="flex items-center gap-1.5 text-sm text-neutral-200">
        <UserRound className="h-4 w-4 text-neutral-400" aria-hidden="true" />
        {user.name ?? user.email}
      </span>
      <button
        type="button"
        onClick={handleLogout}
        className="btn-secondary"
        aria-label={t("logout")}
      >
        <LogOut className="h-4 w-4" aria-hidden="true" />
        {t("logout")}
      </button>
    </div>
  );
}
