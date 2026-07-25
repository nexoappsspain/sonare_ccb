import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

export default function LoginLoading() {
  const t = useTranslations("common");
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
    >
      <Loader2
        className="h-8 w-8 animate-spin text-accent"
        aria-label={t("loading")}
      />
    </div>
  );
}
