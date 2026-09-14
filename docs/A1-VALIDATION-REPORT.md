# LYDRA — PARTE A.1: REPROVADA

Data: 12/09/2026. Entrega de código corrigido e evidências; **não há aprovação final da foundation**.

## Bloqueadores objetivos restantes

1. **Reset/migrations e integração real não foram validados.** O ambiente não dispõe de Docker/Podman ou PostgreSQL local. `supabase start` falhou; o reset retorna `LegacyLocalDbRunningError`. A suíte de integração falha explicitamente com `INTEGRATION_INFRASTRUCTURE_REQUIRED`: seis arquivos de teste falharam na coleta e nenhum teste de integração foi executado. RLS, Storage, FKs e concorrência continuam sem comprovação de execução.

2. **CI verde não comprovado.** O workflow foi entregue, mas não houve execução de GitHub Actions nesta tarefa. Ele exige Supabase real/reset e não ignora falhas.

3. **Contrato interno de ComparisonResult ainda não está completamente definido no material fornecido.** O anexo fixa os campos externos, mas não a estrutura de `suppliers`/`normalizedItems`. Eles foram mantidos opacos, em um único tipo canônico, sem inventar campos financeiros. A integração do DTO final de C depende desse fechamento pelo integrador. Consulte `agent-a1-contracts.md`.

## Resultados executados

| Gate | Resultado | Evidência |
|---|---|---|
| Instalação por lockfile | PASSOU: npm ci | `docs/validation/install.log` |
| Dependency audit | PASSOU: 0 critical, 0 high, 0 moderate, 0 low | `audit-before.json`, `audit-after.json` |
| Lint | PASSOU | `lint.log` |
| Typecheck | PASSOU: next typegen + tsc --noEmit | `typecheck.log` |
| Unitários e Route Handlers | PASSOU: 58 testes, 8 arquivos; dependências de infra mockadas nos testes HTTP unitários | `unit.log` |
| Integração real | FALHOU por infraestrutura obrigatória ausente; 0 testes executados | `integration.log` |
| Migrations/reset | FALHOU por instância local ausente; não aplicado | `migrations-reset.log` |
| Build | PASSOU: Next 15.5.25 | `build.log` |
| Smoke HTTP de produção | PASSOU: homepage e 401 nas quatro operações protegidas | `smoke.log` |
| CI | Arquivo entregue, execução não comprovada | `.github/workflows/ci.yml` |

Os logs estão em `docs/validation/`. O smoke usa o servidor compilado e confirma rejeição sem sessão; não valida o fluxo autenticado com banco/Storage e não substitui integração/E2E completo. `supabase db advisors --local` também foi tentado e falhou com conexão recusada ao PostgreSQL local.

## Correções entregues

- Autenticação por cliente de sessão separado; cliente privilegiado sem cookies, com `server-only`, criado depois de `getUser`; owner derivado da sessão e filtros explícitos inclusive na listagem/contagem de documentos.
- Revogação de grants e remoção de policies de escrita das três tabelas; SELECT owner-only preservado. Policies restritivas vedam escrita direta no bucket, inclusive se outra policy permissiva existir.
- Bucket privado com restrições nativas de 10 MiB e PDF/PNG/JPEG/WebP; sem endpoint de public URL.
- UUID validado antes de PostgreSQL; filename sanitizado em path e metadata; magic bytes; corpo multipart limitado mesmo sem Content-Length.
- Limite de quatro protegido no insert por escrita/lock da linha pai; revalidação de draft; identidade do documento imutável impede movimentações.
- Cleanup best-effort preserva o erro original mesmo se a remoção falhar ou lançar exceção; requestId/envelope canônico e respostas privadas sem cache.
- Contratos centralizados em `src/contracts`; códigos compartilhados; versão numérica 1/null coerente com JSON e banco, via migration incremental.
- CI real com lockfile, audit, lint, typecheck, unitários, Supabase local/reset, SQL assertions, integração, build e smoke.

## Migrations novas

1. `supabase/migrations/20260912182928_a1_backend_authority.sql`
2. `supabase/migrations/20260912182931_a1_document_integrity.sql`

As oito migrations anteriores, as páginas, layout e `next.config.mjs` foram preservados byte a byte. Hashes em `preservation.json`. As migrations novas são incrementais/transacionais; dados antigos incompatíveis causam aborto explícito, sem exclusão automática nem fabricação de extrações. Não foram aplicadas em projeto remoto.

## Vulnerabilidades corrigidas

| Severidade agregada pelo npm | Antes | Depois |
|---|---:|---:|
| Critical | 2 | 0 |
| High | 5 | 0 |
| Moderate | 3 | 0 |
| Total | 10 | 0 |

Nenhuma vulnerabilidade remanescente ou advisory ignorado. A investigação de cada pacote e de cada advisory está em `docs/integration-notes/agent-a1-dependencies.md`. Principais correções: Next/eslint-config-next 15.5.25, Vitest 4.1.11, Vite 8.3.0, PostCSS 8.5.28. O override de PostCSS instala versão corrigida compatível da mesma major; não mascara a falha.

## Integration notes

- **Nova:** `docs/integration-notes/agent-a1-security-handoff.md` — credenciais, owner, grants, constraints, concorrência e aplicação incremental.
- **Nova:** `docs/integration-notes/agent-a1-contracts.md` — contratos canônicos, versão numérica e lacuna do DTO de resultado.
- **Nova:** `docs/integration-notes/agent-a1-dependencies.md` — análise individual das dez entradas e respectivos advisories.
- **Atualizadas:** `agent-a-auth-handoff.md` e `agent-a-idempotency.md`.
- **Atualizada:** `docs/foundation.md` com execução reproduzível e limitações reais dos gates.

## Arquivos alterados

- `.env.example`
- `.eslintrc.json`
- `docs/foundation.md`
- `docs/integration-notes/agent-a-auth-handoff.md`
- `docs/integration-notes/agent-a-idempotency.md`
- `middleware.ts`
- `next-env.d.ts`
- `package-lock.json`
- `package.json`
- `src/app/api/comparisons/[id]/documents/route.ts`
- `src/app/api/comparisons/[id]/route.ts`
- `src/app/api/comparisons/route.ts`
- `src/core/domain/types.ts`
- `src/core/errors/app-error.ts`
- `src/core/errors/respond.ts`
- `src/core/repositories/comparisons.repository.ts`
- `src/core/repositories/quote-documents.repository.ts`
- `src/core/storage/sanitize-filename.ts`
- `src/core/supabase/server.ts`
- `src/core/validation/schemas.ts`
- `tests/integration/cross-owner-fk.test.ts`
- `tests/integration/helpers.ts`
- `tests/integration/migrations.test.ts`
- `tests/integration/repositories.test.ts`
- `tests/integration/rls.test.ts`
- `tests/integration/storage.test.ts`
- `vitest.config.ts`

## Arquivos adicionados

- `.github/workflows/ci.yml`
- `.gitignore`
- `docs/A1-VALIDATION-REPORT.md`
- `docs/integration-notes/agent-a1-contracts.md`
- `docs/integration-notes/agent-a1-dependencies.md`
- `docs/integration-notes/agent-a1-security-handoff.md`
- `docs/validation/audit-after.json`
- `docs/validation/audit-before.json`
- `docs/validation/audit.log`
- `docs/validation/build.log`
- `docs/validation/changed-files.json`
- `docs/validation/gates.json`
- `docs/validation/install.log`
- `docs/validation/integration.log`
- `docs/validation/lint.log`
- `docs/validation/migrations-reset.log`
- `docs/validation/preservation.json`
- `docs/validation/smoke.log`
- `docs/validation/typecheck.log`
- `docs/validation/unit.log`
- `scripts/migration-digest.d.mts`
- `scripts/migration-digest.mjs`
- `scripts/reset-local-db.mjs`
- `scripts/run-local-integration.mjs`
- `scripts/smoke-http.mjs`
- `src/contracts/index.ts`
- `src/core/supabase/backend.ts`
- `src/core/validation/file-signature.ts`
- `src/core/validation/upload-form.ts`
- `supabase/.gitignore`
- `supabase/config.toml`
- `supabase/migrations/20260912182928_a1_backend_authority.sql`
- `supabase/migrations/20260912182931_a1_document_integrity.sql`
- `tests/fixtures/assert-migrated.sql`
- `tests/integration/http.test.ts`
- `tests/setup.ts`
- `tests/unit/file-signature.test.ts`
- `tests/unit/route-handlers.test.ts`
- `tests/unit/upload-form.test.ts`

## Arquivos gerados excluídos do ZIP

- `tsconfig.tsbuildinfo` — cache de compilação; não é código-fonte.

O ZIP também exclui node_modules, .next, caches temporários e credenciais locais. Inclui lockfile, config local do Supabase, migrations, workflow, testes e relatório.

## Reprodução dos gates pendentes

Em ambiente com Docker/Podman funcionando e Node >=22.12:

```bash
npm ci
npx --no-install supabase start -x studio,postgres-meta,logflare,vector,realtime,edge-runtime,mailpit,imgproxy,supavisor
npm run test:security
```

`test:security` reseta exclusivamente o banco local descartável, aplica todas as migrations, executa asserções SQL e só então roda a integração. O workflow completo deve passar no GitHub Actions para comprovar o gate CI.
