"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { AlertTriangle } from "lucide-react";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("errors");
  const tCommon = useTranslations("common");

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div
        className="card mx-auto w-full max-w-md p-6 text-center"
        role="alert"
      >
        <AlertTriangle
          className="mx-auto h-8 w-8 text-red-400"
          aria-hidden="true"
        />
        <p className="mt-3 text-sm text-neutral-200">{t("generic")}</p>
        <button
          type="button"
          onClick={reset}
          className="btn-primary mt-4"
          aria-label={tCommon("tryAgain")}
        >
          {tCommon("tryAgain")}
        </button>
      </div>
    </div>
  );
}
