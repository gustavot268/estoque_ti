/**
 * Instrumentação — roda UMA vez, na inicialização de cada instância do
 * servidor Next.js, e precisa terminar antes de a aplicação atender qualquer
 * requisição.
 *
 * Doc: `node_modules/next/dist/docs/01-app/02-guides/instrumentation.md`
 *
 * Responsabilidade nesta etapa: validar as variáveis de ambiente na
 * inicialização (requisito 11) e derrubar o processo quando a configuração
 * estiver inválida — em especial na regra dura "modo de desenvolvimento
 * habilitado em produção" (requisito 14.15).
 *
 * Falhar aqui é intencional: é melhor o contêiner não subir do que subir com
 * uma configuração insegura e atender requisições.
 */

export async function register(): Promise<void> {
  // `register` é chamado em todos os runtimes. A configuração do servidor
  // (banco, segredos) só faz sentido no runtime Node.js.
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const [{ obterConfiguracao }, { logger }, { resumoSeguroDaConfiguracao }] = await Promise.all([
    import("./infrastructure/config/env"),
    import("./infrastructure/observability/logger"),
    import("./infrastructure/config/esquema-env"),
  ]);

  try {
    const configuracao = obterConfiguracao();
    // Resumo SEGURO: variáveis sensíveis aparecem apenas como
    // "definida"/"ausente", nunca com valor (nem mascarado parcialmente).
    logger.info("Configuração de ambiente validada.", {
      configuracao: resumoSeguroDaConfiguracao(configuracao),
    });
  } catch (erro) {
    // A mensagem do `ErroDeConfiguracaoError` lista os problemas em pt-BR e
    // não contém valor de segredo.
    logger.error("A aplicação não pôde iniciar: configuração de ambiente inválida.", { erro });
    throw erro;
  }
}
