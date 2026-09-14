# A.1 — Autoridade, integridade e handoff B/C/D/E

## Credenciais e repositories

- Sessão: `await createSupabaseServerClient()` + `requireOwner()` (`getUser` real).
- Só depois da validação: `createSupabaseBackendClient()`; secret apenas server-side, guardado por `import "server-only"`.
- `service_role` bypassa RLS: não remova os filtros explícitos por owner.
- `QuoteDocumentRepository.countForComparison(comparisonId, ownerId)` e `listForComparison(comparisonId, ownerId)` agora exigem owner.
- `owner_id`, status, result, paths e extrações enviados pelo browser não são aceitos como autoridade. A comparação criada é draft/null; upload é uploaded/null.
- A UI continua iniciando Auth anônimo e usando os mesmos quatro endpoints. Writes pela Data API/Storage direto agora falham deliberadamente.
- Read-only owner RLS permanece. Não restabeleça policies/grants de escrita para acomodar B/C/E: essas partes devem operar pelo backend autenticado.

## Migrations e dados anteriores

Novas migrations:

1. `20260912182928_a1_backend_authority.sql`
2. `20260912182931_a1_document_integrity.sql`

As oito migrations originais não foram reescritas. Grants são explícitos para instalações novas, inclusive Supabase que já não concede exposição automática. Policies de Storage restritivas valem apenas para `quote-documents` e impedem bypass por outra policy permissiva.

A migration de integridade é transacional. Mais de quatro documentos existentes, paths não canônicos, nomes inválidos, tamanho/MIME fora do limite ou extrações incompatíveis causam aborto; não há exclusão automática para fazer o gate passar. Dados que tenham sido gravados na versão vulnerável precisam ter sua origem revisada: revogar permissões não comprova retroativamente a autenticidade de um resultado antigo.

`file_name` existente é reconciliado com o filename do path. `extraction_schema_version` textual migra uma vez para integer; runtime/DTO não fazem `1 ↔ "1"`. JSON exige `schemaVersion` numérico 1 e a coluna deve ser 1 na mesma gravação; ambos ausentes ficam null. Constraints não substituem o validador semântico de B.

## Concorrência e integração futura

O guard do insert escreve/trava a linha pai antes de contar e checar draft. Isso serializa inserts READ COMMITTED e provoca conflito de escrita em snapshots concorrentes de REPEATABLE READ/SERIALIZABLE, impedindo contagem baseada em snapshot antigo.

`comparison_id`, `owner_id`, `id` e `storage_path` de documentos são imutáveis. O MVP não oferece operação de movimentação. Nenhuma comparação pode receber o quinto upload; a rejeição do DB é traduzida para `TOO_MANY_DOCUMENTS` e a API tenta limpar o objeto recém-enviado.

C deve usar o mesmo agregado/lock ao iniciar processamento e carregar seus documentos. A.1 não implementa transições reais de B/C nem valida resultado financeiro. Completed, ranking, extração, feedback e histórico continuam fora desta entrega.

A limpeza de Storage após falha de DB é best-effort. Falha de remoção gera `documents.upload.cleanup_failed` com IDs técnicos; o erro original é preservado. Não prometa atomicidade entre Storage e PostgreSQL.

## Fontes técnicas consultadas

- [Supabase: securing the Data API](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase: bucket restrictions](https://supabase.com/docs/guides/storage/buckets/creating-buckets)
- [Mudança nos grants automáticos do Supabase](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Next.js 15: APIs assíncronas](https://nextjs.org/docs/app/guides/upgrading/version-15)
