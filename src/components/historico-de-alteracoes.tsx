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
  // Entrada/saída e lista de acessos também nunca referenciam um item.
  LOGIN: "Entrada no app",
  LOGOUT: "Saída do app",
  ACESSO_CONCEDIDO: "Acesso concedido",
  ACESSO_ALTERADO: "Acesso alterado",
  ACESSO_REVOGADO: "Acesso removido",
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
    <section
      aria-labelledby="historico"
      className="flex flex-col gap-4 rounded-2xl border border-borda bg-superficie p-4 shadow-cartao sm:p-6"
    >
      <h2 id="historico" className="text-base font-semibold text-texto">
        Histórico de alterações
      </h2>
      {registros.length === 0 ? (
        <p className="text-sm text-texto-suave">Nenhum registro de histórico.</p>
      ) : (
        // Linha do tempo: um traço vertical com um ponto por registro.
        <ol className="ml-1 flex flex-col gap-4 border-l-2 border-borda pl-5">
          {registros.map((registro) => (
            <li
              key={registro.id}
              className="relative flex flex-col gap-0.5 text-sm before:absolute before:top-1.5 before:-left-[26px] before:h-2.5 before:w-2.5 before:rounded-full before:bg-foco before:content-['']"
            >
              <span className="font-medium text-texto">{ROTULOS_DE_ACAO[registro.tipoAcao]}</span>
              <span className="text-texto-suave">
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
