/**
 * Foto anexada a um item do estoque (equipamento ou material): leitura e
 * validação do arquivo enviado pelo formulário, igual nos dois casos de uso.
 */

import { EntradaInvalidaError } from "../domain/erros";
import { validarImagem } from "../domain/imagem";

export type DadosDeFotoProcessada = {
  readonly foto: Buffer;
  readonly fotoTipoMime: string;
  readonly fotoNomeArquivo: string;
  readonly fotoTamanho: number;
};

/**
 * Lê e valida um arquivo de imagem enviado pelo formulário (requisito 14.8 —
 * o servidor nunca confia no que o navegador diz sobre o arquivo, só no
 * conteúdo real dos bytes, ver `validarImagem`). `null`/`undefined` ou um
 * arquivo vazio — o que o navegador envia quando o campo de arquivo é
 * deixado em branco — significam "nenhum arquivo novo enviado": devolve
 * `null`, não é erro.
 */
export async function processarArquivoDeFoto(
  arquivo: File | null | undefined,
): Promise<DadosDeFotoProcessada | null> {
  if (arquivo === null || arquivo === undefined || arquivo.size === 0) {
    return null;
  }

  const bytes = new Uint8Array(await arquivo.arrayBuffer());
  const resultado = validarImagem(bytes, arquivo.type);
  if (!resultado.valida) {
    throw new EntradaInvalidaError({ foto: [resultado.motivo] });
  }

  return {
    foto: Buffer.from(bytes),
    fotoTipoMime: arquivo.type,
    fotoNomeArquivo: arquivo.name.slice(0, 255),
    fotoTamanho: bytes.length,
  };
}

/**
 * O que gravar na edição: uma foto nova substitui; `remover` sem foto nova
 * limpa; nenhum dos dois não toca no campo (mantém a foto atual) — por isso as
 * chaves de foto só aparecem no objeto quando um dos dois casos se aplica.
 */
export function alteracaoDaFoto(
  novaFoto: DadosDeFotoProcessada | null,
  remover: boolean | undefined,
):
  | DadosDeFotoProcessada
  | { foto: null; fotoTipoMime: null; fotoNomeArquivo: null; fotoTamanho: null }
  | Record<string, never> {
  if (novaFoto !== null) {
    return novaFoto;
  }
  if (remover === true) {
    return { foto: null, fotoTipoMime: null, fotoNomeArquivo: null, fotoTamanho: null };
  }
  return {};
}
