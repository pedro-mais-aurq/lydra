# LYDRA — P5.1 — RELATÓRIO DE INTEGRAÇÃO

**P5.1 — REPROVADA para aprovação integral.**

O merge e a integração de produto estão implementados e passaram nos gates locais de código e no navegador com fronteiras externas simuladas. A aprovação integral fica bloqueada pela ausência de Supabase local funcional e de evidências de Auth/DB/RLS/Storage e extração com provider real. Não há declaração de prontidão para produção nem de CI remoto verde.

## 1. Baseline e integridade

Baseline: `lydra-parte-c1-com-b3-final(2).zip` (C1+B3). A2 e B3 foram referências de auditoria, sem sobreposição no consolidado. As únicas diferenças de código dessas referências para C são as extensões dos dois repositories; B também carregava um tsbuildinfo descartável.

70 arquivos verificados, 70 preservados byte a byte: contracts, core inteiro, extraction, comparison, APIs, Supabase/config/migrations, middleware, CI, package.json e package-lock.json. Hashes em `validation-p5-1/frozen-integrity.json`. A landing e layout raiz vêm de D sem alteração de conteúdo. Os assets e a ilustração também permanecem intactos.

## 2. Mapa de merge e decisões

| Arquivo/domínio | Origem mantida | Origem descartada | Decisão |
| --- | --- | --- | --- |
| contracts, core, auth, repositories, erros | C1+B3 | D antiga | Preservar owner explícito, backend autorizado e transições condicionais |
| APIs CRUD/upload/process | C1+B3 | APIs antigas de D | UI adapta-se aos envelopes e multipart existentes |
| extraction/comparison | C1+B3 | Nenhum código visual substitui esses domínios | Sem alteração de provider, engine ou matching |
| migrations/config Supabase | C1+B3 | Snapshot parcial de D | Onze migrations originais intactas; nenhuma nova |
| middleware | `src/middleware.ts` de C | `/middleware.ts` de D | Manter somente o middleware reconhecido pelo Next atual |
| package.json/lockfile, ESLint, CI | C1+B3 | D | Sem downgrade, upgrade ou dependência de aplicação nova |
| `vitest.config.ts` | C + transform JSX automático | Config de D | TSX novo exige transformação em testes; gates, include, ambiente, timeouts e versões mantidos |
| landing/layout/globals, marca/assets | D | Placeholders de C | Preservar identidade, paleta e layout aprovados |
| logo | D + Link do Next | Âncora interna de D | Corrigir erro de lint sem mudança visual |
| workspace/dropzone | D + integração P5.1 | Estado demonstrativo e metadata sem File | Preservar apresentação e usar upload real |
| resultado/processing | Novos componentes P5.1 sobre classes de D | Placeholders demonstrativos | GET como autoridade; nenhuma análise em montagem/refresh |
| notas/testes antigos trazidos por D | C1+B3 | D | Preservar as validações mais recentes |
| next-env/tsbuildinfo de D | Arquivos da baseline/gerados pelo Next | D | Não importar cache de compilação |

A lista integral dos conflitos e descartes está em `validation-p5-1/merge-manifest.json`. A adaptação foi precedida por comparação dos conflitos; não houve cópia integral de D sobre C.

## 3. Fluxo implementado

1. A ferramenta inicializa ou reutiliza a sessão anônima pelo cliente Supabase existente. Promise compartilhada evita chamadas duplicadas durante renderizações concorrentes/Strict Mode. Falha é explícita e impede chamadas de produto. Bootstrap é lazy ao entrar na ferramenta, como permitido na nota de Auth da A.
2. Título é obrigatório, aparado e limitado a 200 caracteres. Objetos File ficam em estado local. A validação de UX reutiliza os limites de A; a rota continua validando tamanho, MIME e assinatura real.
3. POST create seguido de uploads sequenciais com `FormData.file`. Um erro interrompe o lote; sucessos são mantidos e nunca reenviados automaticamente. Uma resposta perdida não causa replay automático de create/upload, que não são idempotentes.
4. Após todos os uploads confirmados, a ação explícita inicia o mesmo POST /process de C e navega para processing. A requisição em andamento é compartilhada na aba; nenhuma rota alternativa de análise foi criada.
5. Processing/result consultam GET existente, sem depender de navigation state. Polling serial a cada 2,5 s, cancelado no unmount, interrompido em estado terminal e limitado a 120 leituras. Quando pausado, mantém o último estado recebido e permite apenas consultar novamente.
6. Rota processing já concluída encaminha ao resultado. URL direta e refresh não chamam /process. Draft exibe os documentos efetivamente recebidos e exige ação explícita antes de processar.
7. Resultado usa suppliers, highlights, normalizedItems e summary canônicos. Frete/pagamento/garantia/evidências são associados por documentId. Null nunca vira zero, moeda UNKNOWN não vira BRL, partial permanece parcial. Textos de documentos são renderizados como texto React.
8. Retry depende do booleano recebido no erro real. Usa o mesmo id e endpoint; B3 reutiliza completed válido. Nada de novo upload, nova comparação ou segundo pipeline.

## 4. Limitações explícitas preservadas

- **retryable não é persistido pelo backend:** o DTO GET guarda apenas errorCode. A aba conserva code/retryable/requestId e updatedAt no sessionStorage (sem conteúdo documental, token ou owner). Só reutiliza o registro se estado failed, código e timestamp coincidirem com GET. Sem esse registro, outra aba/sessão não infere retryability pelo código e não oferece retry. Isso não substitui autorização server-side nem altera schema.
- **Processing interrompido:** crash/deploy/timeout de infraestrutura pode deixar o agregado em processing. O browser não faz takeover nem presume falha por tempo. Limitação original de C, sem migration/worker novo.
- **Falha de upload:** não há endpoint de delete nem deduplicação. A UI consulta o draft e o usuário pode analisar explicitamente os documentos confirmados se houver 2–4, ou preparar nova comparação. Não faz rollback fictício nem remove uploads salvos.
- **Sessão anônima:** reabertura funciona enquanto a sessão original permanecer disponível. Outro dispositivo ou limpeza dos cookies não recupera automaticamente o mesmo owner. [Documentação oficial](https://supabase.com/docs/guides/auth/auth-anonymous).
- **CAPTCHA:** bootstrap atual segue o ambiente local sem desafio, conforme nota A2. Se CAPTCHA estiver ativado no projeto hospedado, falta integrar seu token real antes da abertura pública; a falha de Auth é explícita. Rate limits/configurações públicas, retenção e revisão operacional continuam conforme `agent-a2-auth-production.md`.
- **Summary/warnings:** texto determinístico de C é exibido integralmente; pode conter IDs de documentos. Não foi reescrito para inventar nomes, ranking ou novas conclusões.

## 5. Testes executados e evidências

| Gate | Resultado | Evidência/alcance |
| --- | --- | --- |
| npm ci | PASS | Instalação com lockfile C, 407 pacotes; overlay-install.log |
| Overlay: lint | FAIL inicial → PASS corrigido | Apenas âncora interna da logo; corrigida com Link |
| Overlay: typecheck/unit/build | PASS após correção visual | 375 testes originais; logs overlay-* |
| Lint final | PASS | lint.log |
| Typecheck final | PASS | typecheck.log |
| Unit + integração de produto | PASS | 400 testes, 28 arquivos; unit.log |
| Build final | PASS | build.log; rotas de resultado/processing e middleware presentes |
| Smoke HTTP da baseline | PASS | homepage, 4 rotas sem sessão, 6 cookies malformados; smoke.log |
| Navegador Chromium | PASS | 9 cenários; browser/checks.json e screenshots |
| npm audit | PASS | 0 vulnerabilidades; audit.log |
| Integridade congelada | PASS | 70/70 hashes iguais à baseline |
| test:migrations via test:security | FAIL — infraestrutura | Supabase local não inicia; reset não validado |
| test:security | FAIL — infraestrutura | Falha no pré-requisito de migrations, sem validação de segurança real |
| test:integration | FAIL — infraestrutura | Oito suítes bloqueadas antes dos casos; zero casos reais validados |
| test:smoke:security | FAIL — infraestrutura | INTEGRATION_INFRASTRUCTURE_REQUIRED |
| Provider real / Auth e uploads em Supabase real | NOT EXECUTED | Sem credenciais/projeto Lydra identificado para esse ensaio |
| GitHub Actions remoto | NOT EXECUTED | Workflow preservado, nenhuma execução remota atestada |

`npm test` inclui as suítes de integração reais; não deve ser anunciado verde neste ambiente. Não foram removidos, enfraquecidos ou marcados skip os gates que exigem infraestrutura. Logs históricos A/B/C permanecem históricos, separados da evidência P5.1.

### Cobertura nova

- Auth: reutilização, inicialização concorrente, erro no getSession/signIn e bloqueio de create.
- Entrada: título vazio/whitespace; 1, 2, 4 e quinto arquivo; 10 MiB; MIME inválido; arquivo vazio; preservação de File.
- Pipeline: cliente → handlers reais de create/upload/process/GET → B3/engine C, com Auth/repositories/Storage/provider simulados nas fronteiras externas. Esse teste comprova contratos e encadeamento, não locks/RLS reais.
- Retry: erro transitório e permanente; mesmo id, sem create/upload adicional, completed reutilizado; cache vinculado ao timestamp; nenhuma inferência pelo errorCode.
- Resultado: R$ 4700 complete, R$ 4570 complete, R$ 4300 partial; fornecedor/prazo/valores null; UNKNOWN; frete incluído versus ausente; XSS escapado; grupos exact/probable/unmatched preservados.
- Polling: estado terminal, draft, limite de leituras, cancelamento/unmount, leitura atrasada ignorada.
- Navegador: sessão via SDK real contra Auth local simulado, multipart, resultado via DTO canônico, refresh, URL direta processing/completed/failed, upload parcial, retry após refresh, falha não retryable, Auth indisponível, responsividade e reduced motion. Não há mocks no bundle da aplicação.

## 6. Reprodução

### Gates sem banco

```sh
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:smoke
npm run audit:dependencies
```

Para uso real, configure `.env.local` com as variáveis Supabase da `.env.example`, e AI_PROVIDER/AI_MODEL/AI_API_KEY descritas em `integration-notes/agent-b-provider.md`. Não use os valores sintéticos do smoke no projeto real. Nenhum secret foi incluído no pacote.

Para validar banco/segurança, disponibilize Supabase local descartável e execute os scripts existentes `test:security` e `test:smoke:security`, seguindo as notas A2/C. Nenhum projeto remoto foi modificado nesta entrega.

### Browser smoke isolado

O runner está em `scripts/smoke-product-browser.mjs`. Instale Playwright em ambiente de QA separado da aplicação e aponte PLAYWRIGHT_MODULE para seu módulo ESM e CHROMIUM_EXECUTABLE para o Chromium. Aqui foram usados Playwright 1.62.1 e Chromium 153.0.8010.0; nenhuma dependência foi adicionada ao lockfile da aplicação. O script sobe exclusivamente um Auth fake em 127.0.0.1:54399 e Next em 127.0.0.1:3105.

```sh
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=public-test-key npm run build
node scripts/smoke-product-browser.mjs
```

Esses valores são fixtures públicas locais, não credenciais. Refaça o build com a configuração real antes de qualquer deploy. O ZIP exclui `.next`, node_modules, `.env.local` e o runtime externo de QA.

## 7. Pendências para fechar P5.1

1. Executar migrations, RLS, Storage, concorrência e smoke autenticado em Supabase descartável funcional.
2. Executar fluxo completo com documentos redigidos e provider/model reais configurados; revisar qualidade factual da extração.
3. Confirmar configurações públicas da A2, inclusive CAPTCHA/token real quando aplicado, antes de liberar uso público.
4. Obter evidência do CI remoto. Somente então reavaliar aprovação integral.

## 8. P5.2 — fora desta entrega

Histórico owner-only, feedback útil/precisão, upsert de um feedback por comparação e respectivos testes E2E. Não foram implementados history, feedback UI/API/repository, analytics, exports, contas ou painel administrativo.

## 9. Arquivos adicionados e alterados

Referência: comparação com a baseline C1+B3; os arquivos visuais importados de D são novos em relação a C. `changed-files.json` detalha o inventário. Registros de validação e screenshots ficam em `docs/validation-p5-1/`.

### Código/assets/testes adicionados

- `public/brand/lydra-lockup-reference.png`
- `public/brand/neres-web-design.svg`
- `scripts/smoke-product-browser.mjs`
- `src/app/comparisons/[id]/page.tsx`
- `src/app/comparisons/[id]/processing/page.tsx`
- `src/app/comparisons/new/page.tsx`
- `src/app/globals.css`
- `src/components/brand/LydraLogo.tsx`
- `src/components/comparison-ui/ComparisonDetailPage.tsx`
- `src/components/comparison-ui/ComparisonResultView.tsx`
- `src/components/comparison-ui/ComparisonWorkspace.tsx`
- `src/components/comparison-ui/DocumentDropzone.tsx`
- `src/components/comparison-ui/SessionGate.tsx`
- `src/components/comparison-ui/WorkspaceHeader.tsx`
- `src/components/landing/LydianIllustrationPlaceholder.tsx`
- `src/modules/product/api.ts`
- `src/modules/product/auth.ts`
- `src/modules/product/processing.ts`
- `src/modules/product/uploads.ts`
- `tests/fixtures/product.json`
- `tests/fixtures/product.ts`
- `tests/unit/product/auth.test.ts`
- `tests/unit/product/pipeline.test.ts`
- `tests/unit/product/processing.test.ts`
- `tests/unit/product/result.test.ts`
- `tests/unit/product/uploads.test.ts`

### Arquivos existentes alterados

- `src/app/layout.tsx`
- `src/app/page.tsx`
- `vitest.config.ts`

### Documentação adicionada

- `docs/P5-1-INTEGRATION-REPORT.md`
- `docs/integration-notes/p5-1-product-decisions.md`
- Manifestos, hashes, logs e capturas em `docs/validation-p5-1/`.

## 10. Arquivos de D deliberadamente descartados

- `.env.example`
- `.eslintrc.json`
- `docs/foundation.md`
- `docs/integration-notes/agent-a-api-request-shapes.md`
- `docs/integration-notes/agent-a-auth-handoff.md`
- `docs/integration-notes/agent-a-idempotency.md`
- `middleware.ts`
- `next-env.d.ts`
- `next.config.mjs`
- `package-lock.json`
- `package.json`
- `src/app/api/comparisons/[id]/documents/route.ts`
- `src/app/api/comparisons/[id]/route.ts`
- `src/app/api/comparisons/route.ts`
- `src/core/auth/require-owner.ts`
- `src/core/domain/serializers.ts`
- `src/core/domain/types.ts`
- `src/core/errors/app-error.ts`
- `src/core/errors/logger.ts`
- `src/core/errors/request-id.ts`
- `src/core/errors/respond.ts`
- `src/core/repositories/comparisons.repository.ts`
- `src/core/repositories/quote-documents.repository.ts`
- `src/core/storage/bucket.ts`
- `src/core/storage/build-storage-path.ts`
- `src/core/storage/sanitize-filename.ts`
- `src/core/supabase/browser.ts`
- `src/core/supabase/server.ts`
- `src/core/validation/schemas.ts`
- `src/core/validation/upload.ts`
- `supabase/migrations/0001_extensions.sql`
- `supabase/migrations/0002_updated_at_trigger.sql`
- `supabase/migrations/0003_comparisons.sql`
- `supabase/migrations/0004_quote_documents.sql`
- `supabase/migrations/0005_comparison_feedback.sql`
- `supabase/migrations/0006_rls_policies.sql`
- `supabase/migrations/0007_storage.sql`
- `supabase/migrations/0008_document_count_guard.sql`
- `tests/integration/cross-owner-fk.test.ts`
- `tests/integration/helpers.ts`
- `tests/integration/migrations.test.ts`
- `tests/integration/repositories.test.ts`
- `tests/integration/rls.test.ts`
- `tests/integration/storage.test.ts`
- `tests/unit/build-storage-path.test.ts`
- `tests/unit/respond-error.test.ts`
- `tests/unit/sanitize-filename.test.ts`
- `tests/unit/schemas.test.ts`
- `tests/unit/validate-upload.test.ts`
- `tsconfig.json`
- `tsconfig.tsbuildinfo`
- `vitest.config.ts`

## 11. Conflitos individuais

| Arquivo | Mantido | Descartado |
| --- | --- | --- |
| `.env.example` | C1+B3 | D outdated/non-presentation |
| `.eslintrc.json` | C1+B3 | D outdated/non-presentation |
| `docs/foundation.md` | C1+B3 | D outdated/non-presentation |
| `docs/integration-notes/agent-a-auth-handoff.md` | C1+B3 | D outdated/non-presentation |
| `docs/integration-notes/agent-a-idempotency.md` | C1+B3 | D outdated/non-presentation |
| `next-env.d.ts` | C1+B3 | D outdated/non-presentation |
| `package-lock.json` | C1+B3 | D outdated/non-presentation |
| `package.json` | C1+B3 | D outdated/non-presentation |
| `src/app/api/comparisons/[id]/documents/route.ts` | C1+B3 | D outdated/non-presentation |
| `src/app/api/comparisons/[id]/route.ts` | C1+B3 | D outdated/non-presentation |
| `src/app/api/comparisons/route.ts` | C1+B3 | D outdated/non-presentation |
| `src/app/layout.tsx` | D presentation | C placeholder |
| `src/app/page.tsx` | D presentation | C placeholder |
| `src/core/auth/require-owner.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/domain/types.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/errors/app-error.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/errors/respond.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/repositories/comparisons.repository.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/repositories/quote-documents.repository.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/storage/sanitize-filename.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/supabase/server.ts` | C1+B3 | D outdated/non-presentation |
| `src/core/validation/schemas.ts` | C1+B3 | D outdated/non-presentation |
| `tests/integration/cross-owner-fk.test.ts` | C1+B3 | D outdated/non-presentation |
| `tests/integration/helpers.ts` | C1+B3 | D outdated/non-presentation |
| `tests/integration/migrations.test.ts` | C1+B3 | D outdated/non-presentation |
| `tests/integration/repositories.test.ts` | C1+B3 | D outdated/non-presentation |
| `tests/integration/rls.test.ts` | C1+B3 | D outdated/non-presentation |
| `tests/integration/storage.test.ts` | C1+B3 | D outdated/non-presentation |
| `vitest.config.ts` | C1+B3 | D outdated/non-presentation |
