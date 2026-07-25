# Contexto para o Agente — CCB Sonare Music

> Este arquivo serve como "memória" entre sessões. Leia antes de qualquer tarefa.

## O que é este projeto

DAW (estúdio de gravação multitrack) que roda 100% no navegador. Grave voz/instrumentos, monte trilhas, aplique efeitos, mixe e exporte. PWA offline.

## Stack

- Next.js 14 (App Router) + TypeScript strict
- Prisma 5 + PostgreSQL (apenas metadados de projeto)
- NextAuth v5 (credenciais, JWT)
- Tone.js (áudio), wavesurfer.js (waveforms), Zustand (estado), idb-keyval (persistência local)
- Tailwind CSS, next-pwa, Lucide icons
- i18n pt-BR / es / en via next-intl

## Como rodar local

```bash
# 1. Instalar dependências
npm install

# 2. Copiar variáveis de ambiente (se não existir .env)
cp .env.example .env

# 3. Gerar secrets (substituir no .env)
openssl rand -base64 32

# 4. PostgreSQL (Docker - porta 5433)
docker run --name sonare-pg -e POSTGRES_PASSWORD=pass -e POSTGRES_DB=sonare -p 5433:5432 -d postgres:16

# 5. Sincronizar schema do banco
npx prisma db push

# 6. Rodar
npm run dev
```

URL local: http://localhost:3000

## Variáveis de ambiente (.env)

```
DATABASE_URL="postgresql://postgres:pass@localhost:5433/sonare?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<gerar com openssl>"
AUTH_SECRET="<mesmo valor de NEXTAUTH_SECRET>"
NEXT_PUBLIC_APP_URL="https://ccb-sonare-music.vercel.app"
```

## Histórico importante

- **package-lock.json**: o lockfile original tinha referências a um mirror npm morto (`npm.mirrors.msh.team`). Se `npm install` falhar com `ENOTFOUND`, delete `package-lock.json` e rode `npm install` novamente.
- **PostgreSQL**: o Docker mapeia a porta 5433 (não 5432). Verifique com `docker port sonare-pg`.
- **Repositório GitHub**: `https://github.com/nexoappsspain/sonare_ccb` — conta `nexoappsspain` tem acesso.
- **Vercel**: já deployado. Build command é `npm run build` (executa `prisma generate && next build`).

## Pendências conhecidas

1. **Exportação .sonare sem botão de UI** (AUDIT.md item 16): a função `exportProjectSonare()` existe mas nenhum componente a invoca. Botão "Exportar .sonare" precisa ser adicionado no `DashboardClient` ou `ProjectCard`.
2. **Testes no celular**: houve problemas com gravação no mobile que foram corrigidos por outro agente. Verificar se a gravação funciona em dispositivos móveis.

## Comandos úteis

```bash
# Type check
npx tsc --noEmit

# Lint
npm run lint

# Build completo
npm run build

# Prisma studio (visualizar banco)
npx prisma studio
```

## Estrutura principal

```
app/[locale]/          - Páginas (dashboard, studio, auth, settings)
app/api/               - API routes (auth, projects, export)
components/studio/     - Interface do DAW (timeline, mixer, FX, transporte)
lib/audio/             - Engine de áudio, efeitos, MIDI, exportação
lib/db/                - Prisma (singleton) + IndexedDB
lib/store/             - Zustand (projectStore)
prisma/schema.prisma   - User, Project (tracks Json, soft-delete)
```
