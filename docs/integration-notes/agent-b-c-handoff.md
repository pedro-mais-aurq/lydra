# B → C — Uso do módulo de extração

## API pública

Importar somente no servidor, em runtime Node.js:

```ts
import { createExtractionService } from "@/modules/extraction";

// Pré-condições cumpridas pelo chamador:
// - sessão validada via requireOwner / auth.getUser();
// - ownerId derivado dessa sessão;
// - comparação e documento validados sob esse owner;
// - quantidade 2..4 e estado/lock do agregado sob autoridade de C;
// - authorizedBackendClient criado pela infraestrutura backend da Foundation.
const extraction = createExtractionService(authorizedBackendClient);
const quote = await extraction.extract({
  ownerId,
  comparisonId,
  documentId,
  requestId,
});
// quote: ExtractedQuote canônico, já validado e persistido/reutilizado.
```

O trecho documenta a chamada após os pré-requisitos; não implementa /process nem inventa um lock
na Foundation. Todos os quatro identificadores são UUIDs. A validação de formato de B não é
autenticação. Nenhum prompt, filename, bytes, path, owner do browser ou informação de outra
proposta deve ser acrescentado ao contexto.

O retorno é Promise<ExtractedQuote>. B não retorna resposta HTTP, ComparisonResult, ranking,
vencedor, custo comparável ou summary. C realiza seus cálculos deterministicamente depois.
Uma instância pode receber chamadas para documentos diferentes, sem histórico/contexto entre elas.

## Mocks e validação de JSON persistido

```ts
import { ExtractionService, validateExtraction } from "@/modules/extraction";
import type { ExtractionProvider, ExtractionStore } from "@/modules/extraction";

const service = new ExtractionService(store, provider);
// store implementa ExtractionStore; provider implementa ExtractionProvider.
// Provider.extract recebe { bytes: Uint8Array, mimeType: string } e devolve unknown.
const quote = await service.extract(context);

// Útil para validar JSON já carregado, sem IA ou escrita:
const validatedQuote = validateExtraction(untrustedJson);
```

`validateExtraction` faz schema + semântica; não é suficiente usar apenas o schema estrutural
da Foundation para declarar evidência válida. Na operação completa, B também verifica versão
persistida e só reutiliza completed válido, antes de construir/configurar o provider.
Completed inválido é erro explícito e não é reprocessado automaticamente.

## Erros

Todos os erros públicos são AppError canônicos, com details=null e mensagens sanitizadas.
O chamador deve usar o respondError existente da Foundation, sem criar outro envelope.
`error.retryable` diferencia falha transitória de inválido determinístico; B não dispara retries.

| Código | Tratamento esperado em C |
|---|---|
| EXTRACTION_PROVIDER_ERROR | Interromper a conclusão da comparação; oferecer retry apenas quando retryable |
| EXTRACTION_INVALID | Não enviar esse documento ao engine; preservar erro e permitir investigação/correção explícita |
| EXTRACTION_UNSUPPORTED_INPUT | Documento incompatível; não fabricar uma extração vazia |
| COMPARISON_NOT_FOUND | 404, inclusive leitura cross-owner/inexistente |
| INVALID_COMPARISON_STATE | Conflito de processamento/transição; não forçar overwrite |
| INTERNAL_ERROR | Falha de persistência/Storage; não declarar comparação concluída |
| VALIDATION_ERROR | Contexto server-side inválido; corrigir chamada |

B atualiza apenas quote_documents. C permanece responsável pelo estado agregado, lock, impedir
completed quando um documento falhou, tratamento de processos interrompidos e retry da operação.
Não há endpoint /process nesta entrega. RLS/Storage/CI/live provider seguem pendentes de comprovação.

## Configuração e ausências

AI_PROVIDER, AI_MODEL e AI_API_KEY são obrigatórios para nova extração; AI_TIMEOUT_MS e
AI_MAX_OUTPUT_TOKENS são opcionais. Veja agent-b-provider.md para regras e documentação oficial.

O contrato de missingFields permanece string[]. B adota somente uma convenção interna,
validada por correspondência exata (sem obrigar ordem):

| Ausência | Entrada |
|---|---|
| Campo escalar crítico null | supplierName, displayedTotal, paymentTerms, deliveryDays ou warranty |
| Moeda UNKNOWN | currency |
| Frete not_informed ou unclear | shipping |
| Frete additional com amount null | shipping.amount |
| Campo nullable de item ausente | items[i].quantity, items[i].unit, items[i].unitPrice ou items[i].totalPrice |

Included com amount=null não significa campo monetário faltante nem zero. Arrays items ou
observations vazios não geram ausência por si sós. C não deve preencher, remover nem reinterpretar
essas ausências para tornar a proposta mais completa. O JSON de um completed incompatível com
essa convenção é rejeitado, sem migração/reparo silencioso.

## Testes reproduzíveis

```bash
npm ci
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:unit
npm run build
npm run test:smoke
```

## Classificação de falha do provider (atualização desta rodada)

Uma resposta HTTP 200 da Responses API com `status = "failed"` agora é classificada pelo objeto
`error` retornado pelo provider (função isolada `isRetryableProviderFailure`), não mais como
`retryable = false` fixo. Códigos documentados e claramente transitórios (`server_error`,
`rate_limit`, `temporarily_unavailable`, `timeout`, `overloaded` e equivalentes) resultam em
`EXTRACTION_PROVIDER_ERROR` com `retryable = true`; códigos permanentes (`invalid_request`,
`unsupported_input`, `invalid_parameter` e equivalentes) e qualquer código ausente/desconhecido
resultam em `retryable = false`. O código de erro público continua sendo exclusivamente
`EXTRACTION_PROVIDER_ERROR`; a diferenciação é só via `retryable`. O objeto `error` bruto do
provider nunca é exposto ou logado — apenas o booleano `retryable` cruza a fronteira do domínio.

### HTTP 429 (rodada B.2): retryable não é mais automático

Uma resposta HTTP `429` deixou de ser `retryable = true` automaticamente. Um `429` pode
significar rate limit temporário (retryable = true) ou esgotamento de quota/crédito/billing da
conta (retryable = false), e repetir a chamada nesse segundo caso nunca ajuda. Quando o status é
`429`, B lê de forma limitada e defensiva o corpo de erro HTTP (bounded, JSON parse seguro, sem
`String()`/coerção sobre valores não confiáveis) e inspeciona apenas `error.code`/`error.type`:

| Situação | `retryable` |
|---|---|
| `408` | `true` (inalterado) |
| `5xx` | `true` (inalterado) |
| `429` com código de rate limit temporário (`rate_limit_exceeded`, `rate_limit`, `temporarily_unavailable` etc.) | `true` |
| `429` com código de quota/crédito/billing esgotado (`insufficient_quota`, `credit_balance_exhausted`, `billing_hard_limit_reached`, `usage_limit_reached`, `quota_exceeded`, `organization_usage_limit_exceeded`, `organization_spend_limit_exceeded`, `project_spend_limit_exceeded`) | `false` |
| `429` sem código reconhecido/ausente/malformado | `true` (conservador: significado HTTP primário ainda é limitação de requisição) |

`error.code` e `error.type` do provider são avaliados como sinais independentes (nunca um
mascarando o outro); se o mesmo erro trouxer um sinal persistente de quota/billing e também um
sinal genérico de rate limit, o persistente prevalece e o resultado é `retryable = false`. Em
resumo para C: **um `429` não é automaticamente uma permissão de retry** — trate `retryable`
como a única fonte de verdade, não o status HTTP isoladamente.

O código público continua exclusivamente `EXTRACTION_PROVIDER_ERROR`; nenhum código novo
(`RATE_LIMITED`, `QUOTA_EXHAUSTED` etc.) foi criado. O corpo de erro HTTP nunca aparece em
`details`, logs, mensagem pública ou payload de observability — só o booleano `retryable`
cruza a fronteira. B não implementa retry, backoff ou fila; a política de retry efetiva
pertence à Parte C. Implementado em `provider-failure.ts`
(`classifyHttpProviderFailure(status, errorBody)`, reaproveitando o parsing defensivo já usado
por `isRetryableProviderFailure`) e em `openai.provider.ts` (leitura defensiva e limitada do
corpo de erro só quando `status === 429`).

## DOCUMENT PROCESSING ORPHAN RECOVERY

A auditoria identificou o seguinte cenário, cuja resolução **não pertence à Parte B**:

```text
uploaded → processing → (processo interrompido abruptamente) → processing (indefinidamente)
```

Pontos que C precisa saber para desenhar a política de recuperação:

1. B marca um documento como `processing` antes de chamar o provider, e essa marcação é a
   pré-condição para a extração seguir em frente.
2. B protege toda escrita de conclusão/falha com um token de tentativa derivado do estado já
   existente (equivalente a `status = processing AND updated_at = attemptToken`); uma escrita que
   não corresponda mais a esse estado é recusada, não sobrescreve silenciosamente.
3. Uma interrupção abrupta do processo (crash, deploy, timeout de infraestrutura) entre o
   `markProcessing` e a escrita final pode deixar o documento perpetuamente em `processing`, sem
   que B seja notificado disso.
4. B não possui autoridade nem contexto para decidir, sozinha, quando um `processing` está
   "stale" — isso exigiria uma política de tempo/orquestração que pertence ao agregado da
   comparação, não ao documento isolado.
5. C, como orquestrador de `/process`, deve definir essa política de stale-processing/retry
   (por exemplo: TTL, nova tentativa, ou marcação explícita de falha para o usuário decidir).
6. Qualquer mecanismo de recovery que C construa deve preservar a mesma garantia de concorrência
   que B já implementa: uma execução antiga (token velho) nunca pode conseguir sobrescrever o
   resultado de uma execução mais recente do mesmo documento.
7. Um `completed` válido persistido por B deve continuar sendo reutilizável tal como está; C não
   deve reprocessar um documento apenas porque outro documento do mesmo agregado ficou stale.
8. Portanto, a política de recovery de C não deve, em nenhuma circunstância, reprocessar ou
   invalidar um `completed` válido — o recovery é sobre documentos presos em `processing`, não
   sobre reabrir extrações já concluídas corretamente.

Esta rodada de B propositalmente **não implementa** lease timeout global, scheduler, cron,
takeover, distributed lock, recovery worker, processing TTL, endpoint `/process` ou recovery de
estado de comparação — tudo isso é escopo de C.

Para selecionar apenas B: `npx --no-install vitest run tests/unit/extraction`.
Nenhum teste de B requer chave de IA. `npm test` mantém a seleção original da Foundation,
incluindo integração que exige Supabase local: não foi reconfigurado para esconder essa exigência.
Com Supabase descartável disponível, executar também os gates existentes test:security e
test:smoke:security. Fixtures sintéticas em tests/fixtures/extraction; os PDFs são acompanhados
de transcrição esperada e JSON de resposta. O gerador offline usa reportlab apenas para regenerar
fixtures; npm/test/build não dependem de Python ou reportlab.
