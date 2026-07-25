import type { Metadata } from "next";
import { getTranslations, unstable_setRequestLocale } from "next-intl/server";
import { StudioShell } from "@/components/studio/StudioShell";

export async function generateMetadata({
  params: { locale },
}: {
  params: { locale: string; id: string };
}): Promise<Metadata> {
  unstable_setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "studio" });
  return { title: t("title") };
}

export default function ProjectStudioPage({
  params: { locale, id },
}: {
  params: { locale: string; id: string };
}) {
  unstable_setRequestLocale(locale);
  return <StudioShell projectId={id} />;
}
