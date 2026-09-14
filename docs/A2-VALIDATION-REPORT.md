# LYDRA — Relatório A.2

Data: 12/09/2026. Base: ZIP A.1 entregue, preservando arquitetura e escopo.

## A. Resumo executivo

**PARTE A — REPROVADA**

As correções de código da A.2 foram realizadas. SSR atualizado, middleware efetivamente compilado,
contratos concretos validados em runtime e SELECT restritivo de Storage adicionados.
Audit, instalação, lint, typecheck, 90 testes unitários, build e smoke público passaram.
Não foi possível provar a cadeia de migrations/RLS/Storage com Supabase funcional nem executar
Advisors, smoke autenticado e GitHub Actions. Esses gates não são considerados verdes.

## B. Correções realizadas

- SSR 0.12.7 exato, com lockfile atualizado pelo npm, sem upgrades oportunistas.
- Sessões malformadas retornam tratamento controlado; serviço indisponível vira 503 retryable,
  e erro desconhecido permanece 500 sanitizado. Logs não recebem a exceção bruta nem tokens.
- Middleware movido de `middleware.ts` para `src/middleware.ts`: o build anterior tinha manifesto
  vazio. O novo build inclui o middleware; o smoke exige sua presença e testa cookies adulterados.
- Headers de cache do SSR propagados; no-store preservado em chamadas repetidas a setAll.
- SELECT RESTRICTIVE protege o bucket contra policy permissiva futura; leitura owner-only preservada.
- Signup de email desligado no config local; anonymous Auth, signup global necessário e demais
  providers já desligados preservados. Antiabuso hospedado preparado em runbook operacional.
- SupplierComparison/NormalizedItem/ComparisonResult concretos; Zod strict sem coerções/defaults.
  Repositories validam status e JSON retornado do DB antes da API.
- Regressões de cookies, contratos, erros do middleware, policy drift, uploads e compensação real.
  Cinco mocks antigos de sessão passaram a usar erros tipados reais do Supabase, mantendo os testes.
- Workflow ampliado com smoke de produção autenticado obrigatório; nenhuma etapa tolera falha.

## C. Dependências

| Pacote | A.1 | A.2 |
|---|---:|---:|
| @supabase/ssr | 0.5.2 | 0.12.7 |
| cookie (transitiva do SSR) | 0.7.2 | 1.1.1 |
| @types/cookie | 0.6.0 | Removida automaticamente pelo npm |
| @supabase/supabase-js | 2.116.0 | 2.116.0 |
| Next.js | 15.5.25 | 15.5.25 |
| React | 18.3.1 | 18.3.1 |

Vitest, ESLint e TypeScript mantidos. O peer do SSR (^2.114.0 de Supabase JS) é atendido.
Referência consultada: [changelog Supabase SSR](https://github.com/supabase/ssr/blob/main/CHANGELOG.md).
A correção de cookies é funcional/de segurança; não foi inventado um advisory npm para ela.

Audit A.2: **0 critical, 0 high, 0 moderate, 0 low; 0 restantes**.
A A.1 já havia corrigido as dez entradas originais (2 critical, 5 high, 3 moderate);
seu relatório individual permanece em `agent-a1-dependencies.md`. A A.2 mantém o resultado zero.
Nenhum advisory ignorado, nenhum `audit fix --force`, nenhum override novo.
Deprecações do tooling legado aparecem em npm ci; não são advisories ativos neste audit.

## D. Migrations

Criada: `supabase/migrations/20260912192256_a2_storage_read_guard.sql`.
Adiciona somente SELECT RESTRICTIVE em storage.objects para anon/authenticated, exigindo
`auth.uid()` igual ao primeiro segmento nos objetos do bucket quote-documents.

As oito migrations originais e as duas A.1 foram preservadas byte a byte. São **11 migrations**.
Não houve repair, edição manual de DB, desativação de trigger ou remoção de constraint.
A nova migration não chegou a ser aplicada: `db reset` falhou por ausência de infraestrutura,
antes de executar SQL. A prova de reset não foi fabricada. Hashes em `preservation.json`.

## E. Contratos

`SupplierComparison`: documentId, supplierName nullable, CostAssessment canônico, deliveryDays
nullable, currency BRL/UNKNOWN e missingFields.
`NormalizedItem`: match exact/probable/unmatched e entries com documentId, itemIndex e ExtractedItem.
Unmatched tem uma entrada; matches têm pelo menos duas, de documentos distintos. Exact exige
unidades explicitamente iguais. Não há algoritmo de matching, conversão de unidade ou cálculos.

`ComparisonResult`: suppliers e normalizedItems concretos, três highlights canônicos nullable,
warnings e summary. Referências internas precisam apontar para fornecedores presentes;
itens não se repetem entre grupos. Campos extras de vencedor/ranking são rejeitados.
Os schemas de extração/custo preservam os tipos congelados, incluindo null, UNKNOWN,
not_informed e schemaVersion numérico 1. `src/core/domain/types.ts` segue usando os contratos,
sem um shape concorrente. Detalhes em `agent-a2-contracts.md`.

## F. Segurança

A escrita continua exclusivamente pelo backend depois de getUser, owner da sessão e validação.
Grants/RLS, FKs compostas, path server-controlled, máximo de quatro documentos concorrentes,
bucket privado/10 MiB/MIME, assinatura de arquivo, filename e cleanup da A.1 foram preservados.
Não foram implementados transições de B/C, process, feedback, history, UI, cálculo ou ranking.

A revisão estática não encontrou novo SECURITY DEFINER; funções/triggers existentes permanecem
com search_path fixo e EXECUTE restrito após hardening. Isso ainda requer comprovação no banco real.
As rotas/páginas existentes permanecem; hashes comprovam preservação de página, layout e next.config.
A chave privilegiada permanece em módulo server-only, importado apenas após validação de sessão.

Antiabuso de produção: runbook exige 30 anonymous sign-ins/hora/IP, providers não utilizados
desligados, preparação de CAPTCHA/Turnstile com token real pela futura UI e observação de crescimento
DB/Storage. Configurações hospedadas **não foram aplicadas/verificadas**. Não foi criada UI de CAPTCHA.
Fonte e sequência operacional: `agent-a2-auth-production.md`.

## G. Testes e comandos reais

| Gate | Comando | Resultado |
|---|---|---|
| Instalação | npm ci | PASS, exit 0 |
| Audit | npm audit --json | PASS, zero vulnerabilidades |
| Lint | npm run lint | PASS, exit 0 |
| Typecheck | npm run typecheck | PASS, exit 0 |
| Unit | npm run test:unit | PASS, 90 testes em 11 arquivos; baseline 58 preservado |
| Supabase start | npx --no-install supabase start -x … | FAIL: Docker e Podman ausentes |
| Migration clean reset | npm run test:migrations | FAIL: serviço local indisponível |
| Integration | npm run test:integration | FAIL: 7 suítes falham na coleta; 0 testes executados |
| Supabase/RLS/Storage | npm run test:security | FAIL no reset, segurança não validada |
| DB lint | npx --no-install supabase db lint --local --fail-on warning | FAIL: ECONNREFUSED 127.0.0.1:54322 |
| Inspeção performance local | npx --no-install supabase inspect db index-stats --local | FAIL: ECONNREFUSED |
| Build | npm run build | PASS, exit 0; Next 15.5.25, middleware compilado |
| Smoke público | npm run test:smoke | PASS: manifesto, homepage, 4 rotas sem sessão, 6 cookies malformados |
| Smoke autenticado | npm run test:smoke:security | FAIL: Supabase status indisponível |

A primeira passagem encontrou erro de tipagem no `this` do teste de compensação; corrigido com
`this: QuoteDocumentRepository`, sem any ou casts de ocultação. Lint/typecheck/unit/build/smoke
foram executados novamente. Logs `*-initial.log` são históricos; `gates.json` registra o resultado final.
Nenhum teste obrigatório retornou cedo como se tivesse passado; não há skip silencioso.

A suíte real entregue cobre A/B owner-only, nove escritas diretas negadas, FKs de documento e
feedback, concorrência 3→4 com oito tentativas, imutabilidade da identidade, bucket privado,
policy drift, uploads válidos de quatro formatos e seis inválidos, API autorizada e cross-owner404,
compensação após falha real de INSERT. **Cobertura escrita não equivale a cobertura executada.**
A suíte de unidade comprova parsing real SSR, envelopes, cleanup com erro retornado/lançado e
schemas; não substitui PostgreSQL/RLS/Storage. Não há E2E de UI final aplicável à Foundation.

## H. Advisors

Security Advisors: **NÃO EXECUTADO** para Lydra.
Performance Advisors: **NÃO EXECUTADO** para Lydra.
Nenhum projeto remoto disponível foi identificado como o projeto deste ZIP; nenhum foi alterado.
A tentativa de db lint/inspeção local falhou por falta de PostgreSQL e não é chamada de Advisors.
Sem resultados reais, não há alegação de “zero achados” dos Advisors.

## I. CI

Workflow real entregue em `.github/workflows/ci.yml`: npm ci, audit, lint, typecheck, unit,
Supabase start, reset/assertions/integração, build, smoke público e smoke autenticado.
Sem continue-on-error ou tolerância de falha. Apenas credenciais locais descartáveis nos testes.
**CI = NÃO EXECUTADA / NÃO COMPROVADA.** Este pacote não está vinculado a um repositório Lydra
identificado; não há run ID nem logs do GitHub Actions para declarar green.

## J. Arquivos criados (relativos à raiz lydra/)

- `docs/A2-VALIDATION-REPORT.md`
- `docs/integration-notes/agent-a2-auth-production.md`
- `docs/integration-notes/agent-a2-contracts.md`
- `docs/integration-notes/agent-a2-security-validation.md`
- `docs/validation-a2/audit.json`
- `docs/validation-a2/audit.log`
- `docs/validation-a2/build-initial.log`
- `docs/validation-a2/build-proof.json`
- `docs/validation-a2/build.log`
- `docs/validation-a2/changed-files.json`
- `docs/validation-a2/db-lint.log`
- `docs/validation-a2/gates.json`
- `docs/validation-a2/install.log`
- `docs/validation-a2/integration.log`
- `docs/validation-a2/lint-initial.log`
- `docs/validation-a2/lint.log`
- `docs/validation-a2/middleware-compile.log`
- `docs/validation-a2/migrations-reset.log`
- `docs/validation-a2/performance-inspect.log`
- `docs/validation-a2/preservation.json`
- `docs/validation-a2/smoke-authenticated.log`
- `docs/validation-a2/smoke-initial.log`
- `docs/validation-a2/smoke.log`
- `docs/validation-a2/supabase-start.log`
- `docs/validation-a2/supabase-tests.log`
- `docs/validation-a2/typecheck-initial.log`
- `docs/validation-a2/typecheck.log`
- `docs/validation-a2/unit-initial.log`
- `docs/validation-a2/unit.log`
- `src/contracts/schemas.ts`
- `src/core/auth/resolve-user.ts`
- `src/middleware.ts`
- `supabase/migrations/20260912192256_a2_storage_read_guard.sql`
- `tests/fixtures/contracts.ts`
- `tests/fixtures/uploads/valid.jpg`
- `tests/fixtures/uploads/valid.pdf`
- `tests/fixtures/uploads/valid.png`
- `tests/fixtures/uploads/valid.webp`
- `tests/integration/storage-drift.test.ts`
- `tests/unit/contracts.test.ts`
- `tests/unit/middleware-errors.test.ts`
- `tests/unit/session.test.ts`

## K. Arquivos modificados

- `.github/workflows/ci.yml`
- `docs/foundation.md`
- `docs/integration-notes/agent-a-auth-handoff.md`
- `package-lock.json`
- `package.json`
- `scripts/run-local-integration.mjs`
- `scripts/smoke-http.mjs`
- `src/contracts/index.ts`
- `src/core/auth/require-owner.ts`
- `src/core/repositories/comparisons.repository.ts`
- `src/core/repositories/quote-documents.repository.ts`
- `supabase/config.toml`
- `tests/fixtures/assert-migrated.sql`
- `tests/integration/http.test.ts`
- `tests/integration/repositories.test.ts`
- `tests/unit/route-handlers.test.ts`

Movido/removido da localização anterior: `middleware.ts` → `src/middleware.ts`.

## L. Auditoria final

As severidades abaixo distinguem bloqueios de evidência de advisories npm (estes são zero).

| Severidade | Achado restante | Evidência / condição de fechamento |
|---|---|---|
| CRITICAL | 0 conhecidos | Não equivale a certificação de infraestrutura não testada |
| HIGH — H01 | Garantias DB/RLS/Storage e migrations sem execução real | Disponibilizar Supabase descartável, executar cadeia completa/testes/Advisors e corrigir falhas reais |
| HIGH — H02 | Smoke autenticado e pipeline GitHub Actions sem execução comprovada | Executar test:smoke:security e workflow sobre a revisão entregue; guardar run ID/logs |
| MEDIUM — M01 | Proteções de Auth hospedado não verificadas | Aplicar providers/rate limit e validar handoff CAPTCHA conforme runbook antes de abertura pública |
| LOW | 0 identificados nesta rodada | — |
| INFO | Tooling legado possui avisos de depreciação | Mantido por escopo; audit atual zero, sem upgrade oportunista |

Não resta pendência de shape genérico em ComparisonResult. Nenhuma parte financeira foi implementada.

## M. Veredito e integração

**PARTE A — REPROVADA**

B pode integrar: **não**.  
C pode integrar: **não**.  
D pode integrar: **não**.  
E pode integrar: **não**.

A liberação para integração definitiva depende de H01/H02; produção também depende de M01.
Os contratos estão fechados, mas o aceite exige segurança executada em Supabase real e CI comprovada.

Integration notes criadas: `agent-a2-contracts.md`, `agent-a2-auth-production.md`,
`agent-a2-security-validation.md`. Todas estão em `docs/integration-notes/`.
