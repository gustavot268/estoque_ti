/**
 * Texto do contador das listas do estoque (issue #24): "Exibindo 21–40 de 135
 * equipamentos", acima da tabela. Usado por equipamentos e por materiais — os
 * dois nomes são masculinos, o que o texto de "Nenhum…" assume.
 *
 * O intervalo sai do que a página realmente trouxe (`exibidos`), não de uma
 * conta sobre o tamanho de página: a última página pode vir incompleta.
 */

export interface ContagemDaLista {
  /** Total de registros que casam com a busca e os filtros. */
  total: number;
  /** Página atual, a partir de 1 (já validada no servidor). */
  pagina: number;
  tamanhoPagina: number;
  totalPaginas: number;
  /** Quantos registros vieram nesta página. */
  exibidos: number;
}

export interface NomeDoRegistro {
  singular: string;
  plural: string;
}

function numero(valor: number): string {
  return valor.toLocaleString("pt-BR");
}

export function textoDoContador(contagem: ContagemDaLista, nome: NomeDoRegistro): string {
  const { total, pagina, tamanhoPagina, totalPaginas, exibidos } = contagem;
  const nomeDoTotal = total === 1 ? nome.singular : nome.plural;

  if (total === 0) {
    return `Nenhum ${nome.singular} encontrado com os filtros atuais.`;
  }

  // Página além da última (endereço editado à mão, ou itens que saíram desde
  // que o link foi gerado): o servidor não corrige a página, então o texto
  // avisa em vez de mostrar um intervalo que não existe.
  if (exibidos === 0) {
    const paginas = totalPaginas === 1 ? "página" : "páginas";
    return `Nenhum ${nome.singular} nesta página. A lista tem ${numero(total)} ${nomeDoTotal} em ${numero(totalPaginas)} ${paginas}.`;
  }

  const inicio = (pagina - 1) * tamanhoPagina + 1;
  const fim = inicio + exibidos - 1;
  return `Exibindo ${numero(inicio)}–${numero(fim)} de ${numero(total)} ${nomeDoTotal}`;
}
