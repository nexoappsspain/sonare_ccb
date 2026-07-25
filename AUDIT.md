# Auditoria de Qualidade — CCB Sonare Music

**Data:** 2025-07-25
**Escopo:** auditoria READ-ONLY de código contra o checklist oficial de entrega (26 itens). Sem npm/tsc/build (build já validado). `node_modules`, `nm_old` e `.next` ignorados.
**Resultado geral:** 25 ✅ / 1 ⚠️ / 0 ❌

## Tabela de conformidade

| # | Item | Status | Evidência (arquivo:linha) |
|---|------|--------|---------------------------|
| 1 | PWA instalável (manifest + SW via next-pwa + ícones) | ✅ | `public/manifest.json` (start_url, display standalone, 3 ícones); `next.config.mjs:3-17` (`@ducanh2912/next-pwa`, dest public, register); `public/sw.js` + `workbox-f1770938.js` gerados com precache completo; `public/icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` — verificados via `file`: PNGs válidos 192x192/512x512; `app/[locale]/layout.tsx:14` (`manifest: "/manifest.json"`) |
| 2 | loading.tsx + error.tsx em todas as 7 rotas | ✅ | Presentes em: `app/[locale]/`, `/studio/`, `/studio/project/[id]/`, `/auth/login/`, `/auth/register/`, `/settings/`, `/settings/profile/` (14 arquivos confirmados por listagem; conteúdo amostrado em `app/[locale]/loading.tsx` e `error.tsx` — componentes válidos com role="status"/role="alert") |
| 3 | Todas as rotas com page.tsx (URL direta) | ✅ | `page.tsx` existe em todas as 7 rotas (listagem); amostrados `app/[locale]/page.tsx` (DashboardClient), `/studio/page.tsx`, `/studio/project/[id]/page.tsx` (StudioShell com projectId) |
| 4 | Gravação de microfone (getUserMedia + StudioShell) | ✅ | `lib/audio/recorder.ts:82` (`navigator.mediaDevices.getUserMedia`, MediaRecorder, constraints de qualidade musical); integração `components/studio/StudioShell.tsx:300-410` (startRecording/stopRecording com count-in, warmup de permissão, persistência via `saveAudioBlob`) |
| 5 | Importação MP3/WAV/OGG/M4A (accept + drag-drop) | ✅ | `StudioShell.tsx:67` (`ACCEPTED_AUDIO = ".mp3,.wav,.ogg,.m4a,audio/*"`), input file `:735-744`; drag-drop `components/studio/Timeline.tsx:119-139` (onDragOver/onDrop → `onImportFiles`); validação de decode com rollback em `StudioShell.tsx:414-443` |
| 6 | Timeline multi-pista sem limite | ✅ | `tracks` é array sem teto em `lib/store/projectStore.ts:113-144` (`addTrack`); `Timeline.tsx:230-232` mapeia todas as pistas; nenhum limite encontrado |
| 7 | Controles por pista: volume, mute, solo, pan, trim, renomear | ✅ | `components/studio/Track.tsx`: renomear inline `:94-103`, mute `:112`, solo `:123`, volume `:164-176`, pan `:182-194`, trimStart/trimEnd/offset `:206-258` |
| 8 | Cores rotativas por pista (TRACK_COLORS 8) | ✅ | `lib/store/projectStore.ts:16-25` (8 cores), `:130` (`TRACK_COLORS[tracks.length % 8]`); classes estáticas anti-purge em `components/studio/trackColors.ts` |
| 9 | Metrônomo BPM 40-240 com toggle | ✅ | `components/studio/Metronome.tsx:18-19` (MIN 40 / MAX 240, slider + input numérico), toggle `:62-70`; toggle também no transporte `TransportControls.tsx:160-161`; engine `lib/audio/metronome.ts` |
| 10 | Efeitos: reverb, delay, compressor, EQ, noise gate + presets (voice/wind/strings/keys) | ✅ | `lib/audio/effects.ts:145-180` (5 fábricas Tone.js; noise gate custom `NoiseGateNode:83-129`), `FX_PRESETS:231-253` (voice/wind/strings/keys); UI `components/studio/FxRack.tsx:18-25, 87-95` |
| 11 | Entrada MIDI (Web MIDI) + sampler 8 timbres | ✅ | `lib/audio/midi.ts:60-66` (`requestMIDIAccess`, hot-plug, note on/off); 8 timbres `lib/audio/instruments.ts:21-30` (SAMPLER_IDS, todos sintetizados via PolySynth); roteamento para pista selecionada `StudioShell.tsx:464-518`; seletor `InstrumentSelector.tsx:24-45` |
| 12 | Exportação MP3 (128/192/320) e WAV (16/24) — mixdown + pista individual | ✅ | `lib/audio/exporter.ts:233` (encodeWav 16/24), `:255` (encodeMp3 128/192/320 com yields), `:151` (renderMixdown offline respeitando mute/solo/trim/pan/volume/FX); UI `components/studio/ExportDialog.tsx:19-22, 79-115` (modo mixdown/track, formatos e qualidades) |
| 13 | NextAuth Credentials + JWT, sem OAuth | ✅ | `lib/auth/auth.config.ts:8` (`strategy: "jwt"`), `:11-37` (único provider Credentials com bcrypt.compare); nenhum provider OAuth no repositório |
| 14 | Registro/login email/senha (API register + bcrypt) | ✅ | `app/api/auth/register/route.ts:25-33` (bcrypt.hash 10 rounds, 409 email duplicado, zod); `components/auth/RegisterForm.tsx:85,105` (POST /api/auth/register + signIn automático); `components/auth/LoginForm.tsx:51` (`signIn("credentials")`) |
| 15 | Salvar/carregar metadados no PostgreSQL (/api/projects + Prisma + soft-delete) | ✅ | `app/api/projects/route.ts` (GET lista com `deletedAt: null`, POST cria; só metadados, teto 256 KB); `app/api/projects/[id]/route.ts:126-147` (DELETE = soft delete `deletedAt: new Date()`; escopo por usuário com 404) |
| 16 | Exportar/importar .sonare (exporter.ts + dashboard) | ⚠️ | Importação OK: `lib/audio/exporter.ts:380-403` + `DashboardClient.tsx:174-202` (input `.sonare`, restaura áudio no IndexedDB). **Exportação SEM gatilho de UI**: `exportProjectSonare` (`exporter.ts:309`) não tem nenhum caller; a chave i18n `dashboard.exportSonare` existe mas não é usada em nenhum componente; a rota server `app/api/export/route.ts` também não é chamada por nenhum cliente (greps `exportProjectSonare`, `/api/export`, `exportSonare` em `components/`, `app/`, `hooks/` → zero chamadas). Usuário não consegue exportar .sonare |
| 17 | Seletor PT/EN/ES persistente (LanguageSwitcher + middleware) | ✅ | `components/shared/LanguageSwitcher.tsx:49-61` (localStorage + cookie NEXT_LOCALE, swap do segmento de locale); `middleware.ts:26-31` (next-intl, locales pt/es/en, localePrefix always); presente em `AppHeader.tsx:31` e `SettingsClient.tsx:75` |
| 18 | Acessibilidade: botões com aria-label, inputs com label | ✅ | Varredura brace-aware de todos os `.tsx` em `app/` e `components/`: **0 `<button>` sem aria-label**; todos os `<input>` têm `aria-label` ou `<label htmlFor>` associado (verificado par a par em LoginForm, RegisterForm, ProfileClient, DashboardClient, ProjectCard). `AccessibleButton` exige `ariaLabel` obrigatório por tipo (`components/shared/AccessibleButton.tsx:14`) |
| 19 | Zero emojis na interface | ✅ | Varredura regex Unicode (U+1F000–1FAFF, 2600–27BF, 2B00–2BFF, FE0F, setas) em `app/`, `components/`, `lib/` → nenhuma ocorrência |
| 20 | Atalhos Espaço/R/M/S/Delete no StudioShell | ✅ | `components/studio/StudioShell.tsx:534-585` (Space=play/pause, R=record, M=mute, S=solo da pista selecionada, Delete=excluir com confirmação; ignora inputs/modificadores/repeat) |
| 21 | Auto-save a cada 30s | ✅ | `lib/store/projectStore.ts:28` (`AUTOSAVE_INTERVAL_MS = 30_000`), `:209-224` (`startAutosaveInterval`, só salva se dirty, não limpa flag se editou durante o write); iniciado em `StudioShell.tsx:155` |
| 22 | beforeunload com projeto não salvo | ✅ | `StudioShell.tsx:157-165` (listener condicionado a `isDirty`, com cleanup) |
| 23 | Áudio bruto nunca em estado React nem no servidor | ✅ | `lib/store/projectStore.ts:12-14` (store guarda só `audioKey`); grep `useState<Blob`/`useState(new Blob` → 0 ocorrências; Blobs circulam em refs/locais (`StudioShell.tsx:305,312`, `recorderRef`); APIs rejeitam corpos >256 KB e validam metadados com zod (`app/api/projects/route.ts:25,72-81`); áudio fica no IndexedDB (`lib/db/indexedDB.ts:62-78`) |
| 24 | README com instalação, env vars, como rodar | ✅ | `README.md`: instalação `:28-32`, env `:36-44` + tabela `:80-88`, PostgreSQL/Prisma `:46-67`, `npm run dev` `:69-75`, deploy Vercel `:90-101`, atalhos, formatos |
| 25 | Paridade i18n pt/es/en | ✅ | Comparação programática das 3 árvores JSON achatadas: **206 chaves em cada**, zero chaves faltantes ou extras |
| 26 | Soft-delete + auditoria (deletedAt, createdAt/updatedAt) | ✅ | `prisma/schema.prisma:16-18` (User) e `:29-31` (Project): `createdAt @default(now())`, `updatedAt @updatedAt`, `deletedAt DateTime?`; soft delete efetivo em `app/api/projects/[id]/route.ts:141-145`; filtros `deletedAt: null` em todas as consultas cloud e no login (`auth.config.ts:23`) |

## Achados

### ⚠️ Item 16 — Exportação .sonare inacessível ao usuário — **SEVERIDADE: BLOCKER (para o item 16)**

- **O que existe:** `exportProjectSonare()` completo e correto em `lib/audio/exporter.ts:309-336` (serializa metadados + áudio em base64, schema zod na importação), e a rota server `POST /api/export` (`app/api/export/route.ts`) que gera o .sonare "receita".
- **O que falta:** nenhum botão/menu/dialog invoca a exportação. Greps por `exportProjectSonare`, `/api/export` e `exportSonare` em `components/`, `app/`, `hooks/` retornam **zero chamadas** — a chave de tradução `dashboard.exportSonare` está órfã. O `ExportDialog` exporta apenas MP3/WAV.
- **Impacto:** a metade "exportar" do item 16 não é exercitável pelo usuário final. Correção estimada: adicionar um botão "Exportar .sonare" no `DashboardClient`/`ProjectCard` (ou no `ExportDialog`) chamando `exportProjectSonare(project, getAudioBlob)` + `downloadBlob`.

## Observações menores (não alteram status)

1. **MINOR:** `Timeline.tsx:190-191` — `aria-valuenow`/`aria-valuetext` do ruler leem `audioEngine.position` não-reativo (só atualiza em re-render). Contraste com o playhead visual, que é atualizado por frame. Impacto a11y limitado (ruler tem setas de teclado funcionais).
2. **MINOR:** `projectStore.setBpm` faz clamp 30–300 enquanto a UI do metrônomo restringe 40–240. Comportamento consistente na prática (a UI é a única via de edição), mas o clamp do store é mais permissivo que o especificado.
3. **MINOR:** `deleteProject` local (`indexedDB.ts:105-121`) apaga os blobs de áudio ao fazer soft-delete do projeto — se um dia houver "lixeira/restaurar" local, o áudio já não existirá. Coerente hoje (não há restore local).

## Itens com conformidade total

Itens 1–15, 17–26: todos verificados com evidência direta de código (não apenas existência de arquivo). Destaques de robustez observados: validação zod em todas as rotas API, escopo por usuário sem vazamento de existência (404), rollback de importação de áudio inválido, StrictMode-safe engine sync, encoder MP3 com yields (não trava UI mobile), classes Tailwind de cor anti-purge.

## Veredito

**25/26 itens ✅. 1 ⚠️ (item 16, BLOCKER para o item):** exportação .sonare implementada na lib e no servidor, mas sem gatilho de UI. Fora isso, o projeto está em conformidade total com o checklist de entrega.

## Atualização v2

- **generateStaticParams defensivo nas 6 rotas estáticas** (`/[locale]`, `/auth/login`, `/auth/register`, `/settings`, `/settings/profile`, `/studio`): guarda contra array de locales vazio/não-array com fallback `{ locale: "pt" }`, preservando a tipagem da tupla readonly.
- **Monitoração ao vivo** (`lib/store/monitoringStore.ts` + integração na gravação): toggle de monitoração com escuta em tempo real da entrada durante a gravação, com parada garantida em todos os caminhos (stop/cancel/erro).
- **Mover clipe por drag horizontal**: arrasto do clipe na trilha via pointer events (com `setPointerCapture`) e slider acessível (teclado/ARIA) como alternativa.
- **Múltiplas takes**: armar pista e gravar sobre áudio existente abre `TakeChoiceDialog` para substituir (descarta take anterior) ou empilhar (preserva take anterior na lista de takes), com seletor de takes para swap do take ativo.
- **Takes preservados no .sonare**: `exporter.ts` ganhou `takeSchema` (zod) e coleta dos blobs das takes, incluindo takes no export/import do projeto.
- **Duplicar projeto inclui takes**: a duplicação copia também os blobs das takes além do blob do take ativo.
