# CCB Sonare Music

Estúdio de gravação multitrack (DAW) que roda 100% no navegador, pensado para
músicos — grave voz e instrumentos, monte trilhas, aplique efeitos, mixe e
exporte. Funciona **offline** (PWA) e sincroniza **somente metadados** com a
nuvem quando você faz login.

> **Privacidade por arquitetura:** o áudio fica **100% local** (IndexedDB do
> dispositivo). A nuvem (PostgreSQL) guarda **apenas metadados** do projeto —
> nome, BPM e a "receita" das trilhas (cortes, volume, pan, efeitos). O áudio
> bruto **nunca sobe** para o servidor.

## Stack

- **Next.js 14** (App Router) + **TypeScript strict**
- **Prisma 5 + PostgreSQL** — apenas metadados (User, Project)
- **NextAuth v5** (beta) — credenciais (email/senha), sessão JWT
- **Tone.js** — engine de áudio, instrumentos sampler e efeitos
- **wavesurfer.js** — formas de onda na timeline
- **Zustand** — estado do studio; **idb-keyval** — persistência local
- **Zod** — validação de todo input de API
- **next-intl** — i18n pt-BR / es / en
- **lamejs + wav-encoder** — exportação MP3/WAV no cliente
- **Tailwind CSS**, **next-pwa**, **Lucide** (ícones)

## Como rodar local

### 1. Instalar dependências

```bash
npm install
```

### 2. Configurar variáveis de ambiente

```bash
cp .env.example .env
```

Edite o `.env` (veja a tabela de variáveis abaixo). Gere o segredo da sessão:

```bash
openssl rand -base64 32
```

### 3. Subir o PostgreSQL

**Opção A — Docker local:**

```bash
docker run --name sonare-pg \
  -e POSTGRES_PASSWORD=pass \
  -e POSTGRES_DB=sonare \
  -p 5432:5432 \
  -d postgres:16
```

Nesse caso: `DATABASE_URL="postgresql://postgres:pass@localhost:5432/sonare?schema=public"`

**Opção B — Neon (free tier):** crie um projeto em [neon.tech](https://neon.tech)
e cole a connection string fornecida em `DATABASE_URL`.

### 4. Criar o schema no banco

```bash
npx prisma db push
```

### 5. Rodar

```bash
npm run dev
```

Abra `http://localhost:3000` (redireciona para `/{locale}` — pt, es ou en).

> O studio **não exige login**: criar conta só é necessário para salvar/carregar
> projetos na nuvem.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `DATABASE_URL` | Sim | Connection string PostgreSQL (local ou Neon). |
| `NEXTAUTH_URL` | Sim | URL base da app (ex.: `http://localhost:3000`). |
| `NEXTAUTH_SECRET` | Sim | Segredo da sessão JWT — gere com `openssl rand -base64 32`. |
| `AUTH_SECRET` | Sim | Alias exigido pelo NextAuth v5; use o **mesmo valor** de `NEXTAUTH_SECRET`. |
| `NEXT_PUBLIC_APP_URL` | Não | URL pública de produção (links compartilháveis). |

## Deploy na Vercel

1. Faça push do repositório para o GitHub/GitLab e clique em **Import Project**
   na Vercel.
2. O **build command padrão** (`npm run build`, que roda `prisma generate &&
   next build`) já está correto — não precisa alterar nada.
3. Em **Environment Variables**, cadastre: `DATABASE_URL` (Neon ou outro
   Postgres gerenciado), `NEXTAUTH_URL` (URL do deploy), `NEXTAUTH_SECRET` e
   `AUTH_SECRET` (mesmo valor, gerado com `openssl rand -base64 32`) e
   `NEXT_PUBLIC_APP_URL`.
4. Deploy. Se o banco for novo, rode `npx prisma db push` apontando para o
   `DATABASE_URL` de produção (uma única vez).

## Estrutura de pastas (resumo)

```
app/
  [locale]/            Páginas localizadas (dashboard, studio, auth, settings)
  api/
    auth/              NextAuth handler + registro + perfil
    projects/          CRUD cloud de metadados (GET lista / POST cria)
    projects/[id]/     GET detalhe / PUT parcial / DELETE soft-delete
    export/            .sonare "receita" (metadados) server-side
components/
  dashboard/           Lista local + cloud, import/export, sync
  studio/              Timeline, mixer, transporte, FX rack, metrônomo
  shared/              Header, toasts, dialogs, language switcher
hooks/                 useAudioEngine, useAuth
lib/
  audio/               Engine, efeitos, instrumentos, recorder, exporter, MIDI
  auth/                auth.config + schemas Zod (login, registro, cloud)
  db/                  prisma (singleton) + indexedDB (áudio e projetos locais)
  i18n/                config + mensagens pt/es/en
  store/               projectStore (Zustand)
prisma/schema.prisma   User, Project (tracks Json, soft-delete, @@index)
types/                 Project, Track, TrackMetadata, SonareFile
middleware.ts          next-intl (studio é público por decisão de produto)
```

## Funcionalidades

1. **Gravação multitrack** de voz/instrumentos via microfone (Web Audio API).
2. **Timeline visual** com formas de onda (wavesurfer) e posicionamento por offset.
3. **Edição de clipes** — trim de início/fim por trilha.
4. **Mixer por trilha** — volume, pan, mute e solo.
5. **Cadeia de efeitos por trilha** — reverb, delay, compressor, EQ de 3 bandas
   e noise gate, com parâmetros ajustáveis e bypass.
6. **Trilhas MIDI** com instrumentos sampler (piano acústico/elétrico, órgão,
   strings, flauta, clarinete, baixo acústico/elétrico).
7. **Metrônomo** com BPM ajustável (40–240) por projeto.
8. **Transporte completo** — play/pause, stop, gravação armada, loop de UI.
9. **Autosave local** — cada alteração é persistida automaticamente no IndexedDB.
10. **Funciona offline (PWA)** — instalável, sem necessidade de rede ou conta.
11. **Exportação WAV** (16/24-bit) com mixdown offline real (OfflineAudioContext,
    incluindo aproximações dos efeitos).
12. **Exportação MP3** (128/192/320 kbps) via lamejs, sem travar a UI.
13. **Arquivo .sonare** — projeto portátil (metadados + áudio embutido em base64)
    gerado no cliente; importação restaura trilhas e áudio.
14. **Sincronização cloud de metadados** — salve a estrutura do projeto na nuvem
    (PostgreSQL) e carregue em outro dispositivo; exportação .sonare "receita"
    (só metadados) também disponível server-side para compartilhamento leve.
15. **Autenticação e perfil** — registro/login com credenciais (NextAuth v5,
    senha com bcrypt), edição de nome e instrumento principal.
16. **Lixeira com soft-delete** — projetos excluídos na nuvem são apenas marcados
    (`deletedAt`), preservando auditoria via timestamps.
17. **Interface trilíngue (pt/es/en)** e acessível (ARIA, toasts, diálogos de
    confirmação).

## Atalhos de teclado (studio)

| Tecla | Ação |
| --- | --- |
| `Espaço` | Play / pause |
| `R` | Armar/iniciar gravação |
| `M` | Mute da trilha selecionada |
| `S` | Solo da trilha selecionada |
| `Delete` | Excluir a trilha selecionada (com confirmação) |

Os atalhos são ignorados enquanto você digita em campos de texto.

## Formatos de exportação

| Formato | Conteúdo | Onde é gerado |
| --- | --- | --- |
| `.wav` | Mixdown final (44,1 kHz estéreo, 16/24-bit) | Cliente (`lib/audio/exporter.ts`) |
| `.mp3` | Mixdown final (128/192/320 kbps) | Cliente (`lib/audio/exporter.ts`) |
| `.sonare` completo | Metadados + áudio de todas as trilhas (base64) | Cliente (`lib/audio/exporter.ts`) |
| `.sonare` receita | Apenas metadados (`audio: {}`), compartilhamento leve | Servidor (`/api/export`) |

## Licença

Projeto privado — CCB Sonare Music.
