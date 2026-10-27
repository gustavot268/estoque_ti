/**
 * Validação da tela "Usuários permitidos" (acesso por convite — ADR 0009).
 * O servidor é a autoridade final: os casos de uso aceitam `unknown` e passam
 * por aqui.
 */

import { z } from "zod";
import { normalizarEmail } from "../domain/acesso";
import { PERFIS_DE_ACESSO } from "../domain/ator";

const perfil = z.enum(PERFIS_DE_ACESSO, { error: () => "Escolha um perfil válido." });

export const esquemaIncluirAcesso = z.strictObject({
  email: z
    .string({ error: () => "Informe o e-mail." })
    .transform(normalizarEmail)
    .pipe(
      z
        .email({ error: () => "Informe um e-mail válido (ex.: nome@empresa.com)." })
        .max(254, { error: () => "O e-mail deve ter no máximo 254 caracteres." }),
    ),
  perfil,
});

export const esquemaAlterarAcesso = z.strictObject({ perfil });
