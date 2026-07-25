/**
 * CCB Sonare Music — Middleware global.
 *
 * Hoje este middleware faz APENAS a resolução de locale (next-intl).
 * Por que /studio NÃO é protegido aqui (decisão de produto):
 *
 *   O studio funciona 100% offline — projetos e áudio vivem no IndexedDB do
 *   dispositivo e o usuário pode gravar, mixar e exportar sem nunca criar
 *   conta. Exigir login para abrir /studio quebraria o uso offline (PWA) e
 *   a proposta "abra e toque".
 *
 *   Login é exigido SOMENTE para recursos de nuvem, e essa proteção é feita
 *   SERVER-SIDE nas próprias rotas de API (auth() -> 401 { error:
 *   "unauthorized" }): /api/projects, /api/projects/[id], /api/export e
 *   /api/auth/profile. Isso é mais seguro que gatear páginas no middleware,
 *   pois o dado sensível nunca sai do servidor sem sessão válida.
 *
 * O matcher abaixo exclui /api (rotas tratam a própria auth), assets do
 * Next (_next/_vercel) e arquivos estáticos com extensão — não alterá-lo
 * sem garantir que essas exclusões continuem válidas.
 */

import createMiddleware from "next-intl/middleware";
import { locales, defaultLocale } from "@/lib/i18n/config";

export default createMiddleware({
  locales,
  defaultLocale,
  localeDetection: true,
  localePrefix: "always",
});

export const config = {
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
