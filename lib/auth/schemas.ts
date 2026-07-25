import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
});

export const registerSchema = z.object({
  name: z.string().trim().min(2),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  instrument: z.string().trim().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;

/* ---------------------------------------------------------------------------
 * Cloud project metadata (Estágio 7)
 *
 * SOMENTE metadados Track[] sobem para o PostgreSQL (coluna Json) — o áudio
 * bruto (Blob) nunca sai do IndexedDB do dispositivo. A validação abaixo é
 * pragmaticamente estrutural: exige o mínimo que identifica uma trilha
 * (id + name) e faz passthrough do restante, porque o shape completo de Track
 * evolui com o studio. O limite rígido de tamanho (corpo JSON <= 256 KB,
 * HTTP 413) é aplicado nas rotas, não aqui.
 * ------------------------------------------------------------------------- */

/** Estrutura mínima de uma trilha: todo TrackMetadata tem id e name. */
const trackMetadataSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
  })
  .passthrough();

/** Máximo de trilhas por projeto na nuvem — proteção contra abuso. */
const MAX_CLOUD_TRACKS = 64;

export const cloudProjectSchema = z.object({
  name: z.string().trim().min(1).max(120),
  bpm: z.number().int().min(40).max(240).default(120),
  tracks: z.array(trackMetadataSchema).max(MAX_CLOUD_TRACKS).default([]),
});

/** Atualização parcial: ao menos um campo deve estar presente. */
export const cloudProjectUpdateSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    bpm: z.number().int().min(40).max(240).optional(),
    tracks: z.array(trackMetadataSchema).max(MAX_CLOUD_TRACKS).optional(),
  })
  .refine(
    (value) =>
      value.name !== undefined ||
      value.bpm !== undefined ||
      value.tracks !== undefined,
    { message: "atLeastOneField" },
  );

export type CloudProjectInput = z.infer<typeof cloudProjectSchema>;
export type CloudProjectUpdateInput = z.infer<typeof cloudProjectUpdateSchema>;
