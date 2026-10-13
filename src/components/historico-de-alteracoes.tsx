/**
 * Histórico de alterações de um equipamento ou material (registros de
 * auditoria), mais recente primeiro — usado nas telas de detalhes.
 */

import type { ResultadoAuditoria, TipoAcaoAuditoria } from "@prisma/client";
import { formatarDataEHora } from "../domain/data-e-hora";

const ROTULOS_DE_ACAO: Record<TipoAcaoAuditoria, string> = {
  CRIACAO: "Cadastro",
  EDICAO: "Edição",
  MUDANCA_STATUS: "Mudança de status",
  // Valor antigo do banco; hoje a localização é o andar.
  MUDANCA_LOCALIZACAO: "Mudança de andar",
  ARQUIVAMENTO: "Arquivamento",
  RESTAURACAO: "Restauração",
  EXPORTACAO: "Exportação",
  ACESSO_NEGADO: "Tentativa de acesso negada",
  // Ações de lista controlada nunca referenciam um equipamento ou material,
  // então nunca aparecem num histórico — os rótulos existem só para satisfazer
  // o `Record` exaustivo sobre `TipoAcaoAuditoria`.
  LISTA_CRIACAO: "Criação de valor de lista",
  LISTA_EDICAO: "Edição de valor de lista",
  LISTA_EXCLUSAO: "Exclusão de valor de lista",
};

const ROTULOS_DE_RESULTADO: Record<ResultadoAuditoria, string> = {
  SUCESSO: "sucesso",
  FALHA: "falha",
};

type RegistroDoHistorico = {
  readonly id: string;
  readonly tipoAcao: TipoAcaoAuditoria;
  readonly ocorridoEm: Date;
  readonly usuarioNome: string | null;
  readonly resultado: ResultadoAuditoria;
};

export function HistoricoDeAlteracoes({
  registros,
}: {
  readonly registros: readonly RegistroDoHistorico[];
}) {
  return (
    <section aria-labelledby="historico" className="flex flex-col gap-2">
      <h2 id="historico" className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        Histórico de alterações
      </h2>
      {registros.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">Nenhum registro de histórico.</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {registros.map((registro) => (
            <li
              key={registro.id}
              className="flex flex-wrap items-baseline gap-2 rounded border border-zinc-200 px-3 py-2 text-sm dark:border-zinc-800"
            >
              <span className="font-medium">{ROTULOS_DE_ACAO[registro.tipoAcao]}</span>
              <span className="text-zinc-600 dark:text-zinc-400">
                {formatarDataEHora(registro.ocorridoEm)}
                {registro.usuarioNome !== null && ` · ${registro.usuarioNome}`} ·{" "}
                {ROTULOS_DE_RESULTADO[registro.resultado]}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
