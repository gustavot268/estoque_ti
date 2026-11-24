-- Verificação prévia da migração 20261124120000_localizacao_em_hierarquia
-- (ADR 0011). SOMENTE LEITURA: não altera nada.
--
-- Rodar no banco de produção ANTES de subir a versão que contém a migração:
--
--   psql "<url do banco>" -f prisma/verificacoes/0011-localizacao-em-hierarquia.sql
--
-- Cada consulta lista o que impediria a conversão. Se TODAS voltarem vazias
-- (0 linhas), a migração pode ser aplicada. Se alguma trouxer linhas, corrija
-- esses itens pelo próprio app (tela de edição ou "Gerenciar listas") e rode
-- esta verificação de novo. A migração faz exatamente as mesmas checagens e,
-- se encontrar algum problema, para sem alterar nada.

BEGIN TRANSACTION READ ONLY;

\echo '1) Locais de armazenamento fora do padrão "Nº armário":'
SELECT nome AS local
FROM "locais_armazenamento"
WHERE nome_normalizado !~ '^[0-9]+ *[º°o]? *armario$'
ORDER BY nome;

\echo '2) Números de armário repetidos:'
SELECT substring(nome_normalizado FROM '^([0-9]+)')::INTEGER AS numero, string_agg(nome, ', ') AS locais
FROM "locais_armazenamento"
WHERE nome_normalizado ~ '^[0-9]+ *[º°o]? *armario$'
GROUP BY 1 HAVING count(*) > 1;

\echo '3) Andares "15º andar" encontrados (precisa ser exatamente 1 se houver locais):'
SELECT nome AS andar FROM "andares" WHERE nome_normalizado ~ '^15 *[º°o]? *andar$';

\echo '4) Orientações em uso que não são "Prateleira de cima" nem "Prateleira de baixo":'
SELECT o.nome AS orientacao,
       (SELECT count(*) FROM "equipamentos" e WHERE e.orientacao_id = o.id)
     + (SELECT count(*) FROM "materiais" m WHERE m.orientacao_id = o.id) AS itens
FROM "orientacoes" o
WHERE o.nome_normalizado NOT IN ('prateleira de cima', 'prateleira de baixo')
  AND (EXISTS (SELECT 1 FROM "equipamentos" e WHERE e.orientacao_id = o.id)
    OR EXISTS (SELECT 1 FROM "materiais" m WHERE m.orientacao_id = o.id));

\echo '5) Itens com armário mas fora do 15º andar:'
SELECT 'equipamento' AS tipo, e.id, c.nome || ' ' || e.modelo AS item, a.nome AS andar, l.nome AS local
FROM "equipamentos" e
JOIN "andares" a ON a.id = e.andar_id
JOIN "categorias" c ON c.id = e.categoria_id
JOIN "locais_armazenamento" l ON l.id = e.local_armazenamento_id
WHERE a.nome_normalizado !~ '^15 *[º°o]? *andar$'
UNION ALL
SELECT 'material', m.id, cm.nome || ' ' || m.tipo, a.nome, l.nome
FROM "materiais" m
JOIN "andares" a ON a.id = m.andar_id
JOIN "categorias_material" cm ON cm.id = m.categoria_id
JOIN "locais_armazenamento" l ON l.id = m.local_armazenamento_id
WHERE a.nome_normalizado !~ '^15 *[º°o]? *andar$';

\echo '6) Itens com orientação mas sem local de armazenamento:'
SELECT 'equipamento' AS tipo, e.id, c.nome || ' ' || e.modelo AS item
FROM "equipamentos" e JOIN "categorias" c ON c.id = e.categoria_id
WHERE e.orientacao_id IS NOT NULL AND e.local_armazenamento_id IS NULL
UNION ALL
SELECT 'material', m.id, cm.nome || ' ' || m.tipo
FROM "materiais" m JOIN "categorias_material" cm ON cm.id = m.categoria_id
WHERE m.orientacao_id IS NOT NULL AND m.local_armazenamento_id IS NULL;

\echo 'Totais atuais (para conferir depois da migração):'
SELECT (SELECT count(*) FROM "equipamentos") AS equipamentos,
       (SELECT count(*) FROM "materiais") AS materiais,
       (SELECT count(*) FROM "equipamentos" WHERE local_armazenamento_id IS NOT NULL)
     + (SELECT count(*) FROM "materiais" WHERE local_armazenamento_id IS NOT NULL) AS itens_com_local,
       (SELECT count(*) FROM "equipamentos" WHERE orientacao_id IS NOT NULL)
     + (SELECT count(*) FROM "materiais" WHERE orientacao_id IS NOT NULL) AS itens_com_orientacao;

ROLLBACK;
