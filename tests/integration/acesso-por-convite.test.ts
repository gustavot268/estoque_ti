import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AcessoNegadoError,
  ConflitoDeUnicidadeError,
  EntradaInvalidaError,
  OperacaoNaoPermitidaError,
} from "../../src/domain/erros";
import {
  criarSessao,
  obterSessaoValida,
  VALIDADE_DA_SESSAO_EM_HORAS,
} from "../../src/infrastructure/repositorios/sessoes";
import {
  alterarPerfilDoAcesso,
  incluirAcesso,
  listarAcessos,
  removerAcesso,
} from "../../src/services/acessos";
import { registrarEntrada, registrarSaida } from "../../src/services/autenticacao";
import { criarAtorDeTeste, criarUsuarioDeTeste, obterClienteDeTeste } from "./suporte/ambiente";

const prisma = obterClienteDeTeste();

/**
 * Acesso por convite (ADR 0009) e sessões (ADR 0006), contra o banco isolado
 * de testes. A parte do protocolo com a Microsoft não roda aqui (precisa do
 * tenant real); os testes partem de uma identidade já validada.
 */
describe("acesso por convite e sessões", () => {
  const prefixo = `convite-${randomUUID().slice(0, 8)}`;
  const email = (nome: string) => `${prefixo}-${nome}@example.com`;
  const ADMIN_INICIAL = email("admin-inicial");

  let administracao: ReturnType<typeof criarAtorDeTeste>;
  let operacao: ReturnType<typeof criarAtorDeTeste>;
  const usuariosCriados: string[] = [];

  function identidade(nome: string) {
    return { entraObjectId: `${prefixo}-oid-${nome}`, email: email(nome), nome: `Pessoa ${nome}` };
  }

  beforeAll(async () => {
    const admin = await criarUsuarioDeTeste(prisma, { email: email("admin") });
    const operador = await criarUsuarioDeTeste(prisma, { email: email("operador") });
    usuariosCriados.push(admin.id, operador.id);
    administracao = criarAtorDeTeste(admin, "ADMINISTRACAO");
    operacao = criarAtorDeTeste(operador, "OPERACAO");
  });

  afterAll(async () => {
    const doTeste = { startsWith: prefixo };
    await prisma.acessoPermitido.deleteMany({ where: { email: doTeste } });
    const usuarios = await prisma.usuario.findMany({
      where: { OR: [{ id: { in: usuariosCriados } }, { email: doTeste }] },
      select: { id: true },
    });
    // Os registros de auditoria ficam (append-only — ADR 0008); só os usuários de teste saem.
    await prisma.sessao.deleteMany({ where: { usuarioId: { in: usuarios.map((u) => u.id) } } });
    await prisma.usuario.deleteMany({ where: { id: { in: usuarios.map((u) => u.id) } } });
  });

  describe("lista de acessos", () => {
    it("inclui com e-mail normalizado e audita ACESSO_CONCEDIDO com quem incluiu", async () => {
      const acesso = await incluirAcesso(
        prisma,
        administracao,
        { email: `  ${email("Normalizar").toUpperCase()} `, perfil: "CONSULTA" },
        ADMIN_INICIAL,
      );
      expect(acesso.email).toBe(email("normalizar"));
      expect(acesso.perfil).toBe("CONSULTA");

      const auditoria = await prisma.registroAuditoria.findFirst({
        where: { tipoAcao: "ACESSO_CONCEDIDO", correlacaoId: administracao.correlacaoId },
        orderBy: { ocorridoEm: "desc" },
      });
      expect(auditoria?.dadosPosteriores).toEqual({ email: acesso.email, perfil: "CONSULTA" });
      expect(auditoria?.usuarioEmail).toBe(administracao.email);
    });

    it("recusa e-mail repetido, e-mail inválido e o administrador inicial", async () => {
      await incluirAcesso(
        prisma,
        administracao,
        { email: email("repetido"), perfil: "CONSULTA" },
        ADMIN_INICIAL,
      );
      await expect(
        incluirAcesso(
          prisma,
          administracao,
          { email: email("REPETIDO"), perfil: "OPERACAO" },
          ADMIN_INICIAL,
        ),
      ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);
      await expect(
        incluirAcesso(
          prisma,
          administracao,
          { email: "sem-arroba", perfil: "CONSULTA" },
          ADMIN_INICIAL,
        ),
      ).rejects.toBeInstanceOf(EntradaInvalidaError);
      await expect(
        incluirAcesso(
          prisma,
          administracao,
          { email: ADMIN_INICIAL, perfil: "CONSULTA" },
          ADMIN_INICIAL,
        ),
      ).rejects.toBeInstanceOf(ConflitoDeUnicidadeError);
      await expect(
        incluirAcesso(
          prisma,
          administracao,
          { email: email("perfil"), perfil: "DONO" },
          ADMIN_INICIAL,
        ),
      ).rejects.toBeInstanceOf(EntradaInvalidaError);
    });

    it("o banco recusa e-mail fora do formato normalizado mesmo sem passar pela validação", async () => {
      await expect(
        prisma.acessoPermitido.create({ data: { email: email("MAIUSCULO"), perfil: "CONSULTA" } }),
      ).rejects.toThrow();
    });

    it("só Administração vê e mexe na lista", async () => {
      await expect(listarAcessos(prisma, operacao, ADMIN_INICIAL)).rejects.toBeInstanceOf(
        AcessoNegadoError,
      );
      await expect(
        incluirAcesso(prisma, operacao, { email: email("x"), perfil: "CONSULTA" }, ADMIN_INICIAL),
      ).rejects.toBeInstanceOf(AcessoNegadoError);
    });

    it("altera o perfil e audita o antes e o depois", async () => {
      const acesso = await incluirAcesso(
        prisma,
        administracao,
        { email: email("promover"), perfil: "CONSULTA" },
        ADMIN_INICIAL,
      );
      const alterado = await alterarPerfilDoAcesso(prisma, administracao, acesso.id, {
        perfil: "OPERACAO",
      });
      expect(alterado.perfil).toBe("OPERACAO");

      const auditoria = await prisma.registroAuditoria.findFirst({
        where: { tipoAcao: "ACESSO_ALTERADO", correlacaoId: administracao.correlacaoId },
        orderBy: { ocorridoEm: "desc" },
      });
      expect(auditoria?.dadosAnteriores).toEqual({ email: acesso.email, perfil: "CONSULTA" });
      expect(auditoria?.dadosPosteriores).toEqual({ email: acesso.email, perfil: "OPERACAO" });
    });

    it("ninguém altera nem remove o próprio acesso", async () => {
      const proprio = await incluirAcesso(
        prisma,
        administracao,
        { email: administracao.email, perfil: "ADMINISTRACAO" },
        ADMIN_INICIAL,
      );
      await expect(
        alterarPerfilDoAcesso(prisma, administracao, proprio.id, { perfil: "CONSULTA" }),
      ).rejects.toBeInstanceOf(OperacaoNaoPermitidaError);
      await expect(removerAcesso(prisma, administracao, proprio.id)).rejects.toBeInstanceOf(
        OperacaoNaoPermitidaError,
      );
    });
  });

  describe("entrada (login) e sessões", () => {
    it("fora da lista: não abre sessão, não cria usuário e registra ACESSO_NEGADO", async () => {
      const pessoa = identidade("desconhecida");
      const correlacaoId = randomUUID();
      const resultado = await registrarEntrada(prisma, pessoa, ADMIN_INICIAL, correlacaoId);

      expect(resultado.permitido).toBe(false);
      expect(
        await prisma.usuario.findUnique({ where: { entraObjectId: pessoa.entraObjectId } }),
      ).toBeNull();
      const auditoria = await prisma.registroAuditoria.findFirst({ where: { correlacaoId } });
      expect(auditoria?.tipoAcao).toBe("ACESSO_NEGADO");
      expect(auditoria?.resultado).toBe("FALHA");
      expect(auditoria?.usuarioEmail).toBe(pessoa.email);
    });

    it("na lista: cria o usuário, abre a sessão (8 h) e registra LOGIN", async () => {
      const pessoa = identidade("convidada");
      await incluirAcesso(
        prisma,
        administracao,
        { email: pessoa.email, perfil: "OPERACAO" },
        ADMIN_INICIAL,
      );

      const correlacaoId = randomUUID();
      const antes = Date.now();
      const resultado = await registrarEntrada(prisma, pessoa, ADMIN_INICIAL, correlacaoId);
      if (!resultado.permitido) {
        throw new Error("deveria ter entrado");
      }

      const sessao = await obterSessaoValida(prisma, resultado.token);
      expect(sessao?.usuario.email).toBe(pessoa.email);
      const horas = (resultado.expiraEm.getTime() - antes) / 3_600_000;
      expect(horas).toBeGreaterThan(VALIDADE_DA_SESSAO_EM_HORAS - 0.1);
      expect(horas).toBeLessThanOrEqual(VALIDADE_DA_SESSAO_EM_HORAS + 0.1);

      const auditoria = await prisma.registroAuditoria.findFirst({ where: { correlacaoId } });
      expect(auditoria?.tipoAcao).toBe("LOGIN");
      expect(auditoria?.dadosPosteriores).toEqual({ perfil: "OPERACAO" });
    });

    it("o administrador inicial entra mesmo sem estar na lista", async () => {
      const resultado = await registrarEntrada(
        prisma,
        { ...identidade("admin-inicial"), email: ADMIN_INICIAL },
        ADMIN_INICIAL,
        randomUUID(),
      );
      expect(resultado.permitido).toBe(true);
    });

    it("o banco guarda só o hash do token, nunca o token", async () => {
      const usuario = await criarUsuarioDeTeste(prisma, { email: email("hash") });
      usuariosCriados.push(usuario.id);
      const { token } = await criarSessao(prisma, usuario.id);
      const guardadas = await prisma.sessao.findMany({ where: { usuarioId: usuario.id } });
      expect(guardadas).toHaveLength(1);
      expect(guardadas[0]?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(guardadas[0]?.tokenHash).not.toBe(token);
    });

    it("sessão vencida e token adulterado não valem", async () => {
      const usuario = await criarUsuarioDeTeste(prisma, { email: email("vencida") });
      usuariosCriados.push(usuario.id);
      const dezHorasAtras = new Date(Date.now() - 10 * 3_600_000);
      const { token } = await criarSessao(prisma, usuario.id, dezHorasAtras);
      expect(await obterSessaoValida(prisma, token)).toBeNull();
      expect(await obterSessaoValida(prisma, `${token.slice(0, -1)}x`)).toBeNull();
      expect(await obterSessaoValida(prisma, "curto")).toBeNull();
    });

    it("'Sair' encerra a sessão no banco e registra LOGOUT", async () => {
      const pessoa = identidade("sair");
      await incluirAcesso(
        prisma,
        administracao,
        { email: pessoa.email, perfil: "CONSULTA" },
        ADMIN_INICIAL,
      );
      const entrada = await registrarEntrada(prisma, pessoa, ADMIN_INICIAL, randomUUID());
      if (!entrada.permitido) {
        throw new Error("deveria ter entrado");
      }

      const correlacaoId = randomUUID();
      await registrarSaida(prisma, entrada.token, correlacaoId);
      expect(await obterSessaoValida(prisma, entrada.token)).toBeNull();
      const auditoria = await prisma.registroAuditoria.findFirst({ where: { correlacaoId } });
      expect(auditoria?.tipoAcao).toBe("LOGOUT");
    });

    it("remover o acesso derruba na hora as sessões abertas daquele e-mail", async () => {
      const pessoa = identidade("removida");
      const acesso = await incluirAcesso(
        prisma,
        administracao,
        { email: pessoa.email, perfil: "OPERACAO" },
        ADMIN_INICIAL,
      );
      const entrada = await registrarEntrada(prisma, pessoa, ADMIN_INICIAL, randomUUID());
      if (!entrada.permitido) {
        throw new Error("deveria ter entrado");
      }
      expect(await obterSessaoValida(prisma, entrada.token)).not.toBeNull();

      await removerAcesso(prisma, administracao, acesso.id);

      expect(await obterSessaoValida(prisma, entrada.token)).toBeNull();
      const auditoria = await prisma.registroAuditoria.findFirst({
        where: { tipoAcao: "ACESSO_REVOGADO", correlacaoId: administracao.correlacaoId },
        orderBy: { ocorridoEm: "desc" },
      });
      expect(auditoria?.dadosAnteriores).toEqual({ email: pessoa.email, perfil: "OPERACAO" });
    });
  });
});
