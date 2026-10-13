/**
 * Validação de arquivo de imagem anexado a um equipamento (foto).
 *
 * Função pura, sem I/O: recebe os bytes já lidos e o tipo MIME declarado
 * pelo navegador, nunca confia só nesse tipo declarado — confere a
 * assinatura real dos bytes (requisito 14.8, mesma postura de "o servidor é
 * a autoridade final" já aplicada a todo campo de texto). Um arquivo
 * `.jpg.svg` renomeado, por exemplo, nunca passa: a extensão/nome não
 * importa, só o conteúdo.
 */

export const TIPOS_DE_IMAGEM_PERMITIDOS = ["image/jpeg", "image/png", "image/webp"] as const;
export type TipoDeImagemPermitido = (typeof TIPOS_DE_IMAGEM_PERMITIDOS)[number];

/** 5 MB — generoso para uma foto de equipamento, contido para não inflar o banco. */
export const TAMANHO_MAXIMO_DA_FOTO_EM_BYTES = 5 * 1024 * 1024;

const ASSINATURA_JPEG = [0xff, 0xd8, 0xff];
const ASSINATURA_PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function bytesComecamCom(bytes: Uint8Array, assinatura: readonly number[]): boolean {
  if (bytes.length < assinatura.length) {
    return false;
  }
  return assinatura.every((byte, indice) => bytes[indice] === byte);
}

/** WEBP não tem uma assinatura de prefixo simples: é um container RIFF com a marca "WEBP" no byte 8. */
function ehAssinaturaWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 12) {
    return false;
  }
  const marcaRiff = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  const marcaWebp = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return marcaRiff === "RIFF" && marcaWebp === "WEBP";
}

function ehTipoDeImagemPermitido(valor: string): valor is TipoDeImagemPermitido {
  return (TIPOS_DE_IMAGEM_PERMITIDOS as readonly string[]).includes(valor);
}

export type ResultadoDeValidacaoDeImagem =
  | { readonly valida: true }
  | { readonly valida: false; readonly motivo: string };

export function validarImagem(
  bytes: Uint8Array,
  tipoMimeDeclarado: string,
): ResultadoDeValidacaoDeImagem {
  if (bytes.length === 0) {
    return { valida: false, motivo: "O arquivo está vazio." };
  }
  if (bytes.length > TAMANHO_MAXIMO_DA_FOTO_EM_BYTES) {
    const limiteEmMb = TAMANHO_MAXIMO_DA_FOTO_EM_BYTES / (1024 * 1024);
    return { valida: false, motivo: `A foto excede o tamanho máximo de ${limiteEmMb} MB.` };
  }
  if (!ehTipoDeImagemPermitido(tipoMimeDeclarado)) {
    return {
      valida: false,
      motivo: "Formato de imagem não aceito. Envie um arquivo JPEG, PNG ou WEBP.",
    };
  }

  const assinaturaValida =
    tipoMimeDeclarado === "image/jpeg"
      ? bytesComecamCom(bytes, ASSINATURA_JPEG)
      : tipoMimeDeclarado === "image/png"
        ? bytesComecamCom(bytes, ASSINATURA_PNG)
        : ehAssinaturaWebp(bytes);

  if (!assinaturaValida) {
    return {
      valida: false,
      motivo:
        "O conteúdo do arquivo não corresponde a uma imagem válida do tipo informado — " +
        "renomear a extensão de outro tipo de arquivo não é aceito.",
    };
  }

  return { valida: true };
}
