# LYDRA — PARTE B: DOCUMENT INTELLIGENCE

Data: 12/09/2026. Base recebida: lydra-parte-a2-final.zip. Rodada B.1 (microcorreção)
aplicada em 12/09/2026 sobre lydra-parte-b-final.zip.

## Microcorreção B.2 (rodada seguinte a B.1)

Escopo: **exclusivamente** a classificação de respostas HTTP não-2xx do provider, item único
desta rodada. Nenhuma outra decisão de B foi revisitada. Por instrução explícita desta rodada,
testes/logs/manifests de validação não foram re-executados ou regenerados aqui; ver seção de
gates da rodada B.1 acima para a última execução completa comprovada.

`HTTP 429` deixou de ser automaticamente `retryable = true`. Um `429` pode ser rate limit
temporário ou esgotamento de quota/crédito/billing da conta — este último nunca se resolve com
retry. Quando `status === 429`, o provider agora lê de forma limitada e defensiva o corpo de
erro HTTP (bounded, JSON parse seguro, sem coerção `String()`/`toString()` sobre valores não
confiáveis) e classifica por `error.code`/`error.type`: códigos de rate limit temporário →
`retryable = true`; códigos de quota/crédito/billing esgotado (`insufficient_quota`,
`credit_balance_exhausted`, `billing_hard_limit_reached`, `usage_limit_reached`,
`quota_exceeded`) → `retryable = false`; código ausente/desconhecido/malformado → `retryable =
true` (conservador, já que o significado HTTP primário do 429 ainda é limitação de requisição).
`HTTP 408` e `5xx` permanecem inalterados (`retryable = true`). O código público continua
exclusivamente `EXTRACTION_PROVIDER_ERROR`; nenhum código novo foi criado. O corpo de erro HTTP
nunca é exposto em `details`, logs ou mensagem pública — só o booleano `retryable` cruza a
fronteira do domínio. Nenhuma retentativa automática foi implementada em B.

Arquivos modificados: `src/modules/extraction/providers/openai.provider.ts` (leitura defensiva
e limitada do corpo de erro apenas quando `status === 429`, antes de classificar) e
`src/modules/extraction/providers/provider-failure.ts` (nova função
`classifyHttpProviderFailure(status, errorBody)`, reaproveitando o parsing defensivo já usado
por `isRetryableProviderFailure` em vez de duplicar lógica — ambas compartilham a extração
segura de `code`/`type`, que nunca aceita valores não-string). `docs/integration-notes/agent-b-c-handoff.md`
recebeu uma nota equivalente para C. Nenhum contrato, migration, prompt, structured output,
Storage, concorrência ou owner scoping foi alterado.

Limitação objetiva restante: a lista de códigos de quota/billing reconhecidos é a documentada
publicamente pelo provider no momento desta correção; um código novo e ainda não catalogado
cairá no caminho conservador (`retryable = true` para 429 desconhecido), o que é seguro (não
esconde o erro) mas pode gerar uma tentativa de retry por C que ainda falhará por falta de
quota — a política de quantas vezes tentar antes de desistir continua sendo decisão de C.

## Microcorreção B.1 (rodada anterior)

Escopo desta rodada: **exclusivamente** a classificação de `response.status === "failed"`
do provider (item B1 da auditoria). Nenhuma outra decisão arquitetural de B foi revisitada,
nenhum contrato foi alterado, nenhuma parte de A foi tocada e a Parte C não foi implementada.

Correções realizadas:

- Nova função isolada `isRetryableProviderFailure` em
  `src/modules/extraction/providers/provider-failure.ts`. Recebe apenas o campo `error` (já
  desserializado como `unknown`) de uma resposta `status = "failed"` e devolve um booleano.
  Não lança exceção, não loga, não repassa o objeto bruto.
- `openai.provider.ts`: a linha `if (envelope.data.status === "failed") throw providerError(false)`
  foi substituída por `throw providerError(isRetryableProviderFailure(envelope.data.error))`.
  O envelope de parsing (`responseEnvelope`) passou a aceitar opcionalmente o campo `error`
  como `unknown` — apenas para permitir a leitura seguro; ele nunca é repassado adiante.
- Classificação conservadora: códigos documentados como transitórios
  (`server_error`, `rate_limit`/`rate_limit_exceeded`, `temporarily_unavailable`,
  `service_unavailable`, `timeout`/`request_timeout`, `overloaded` e sinônimos próximos)
  resultam em `retryable = true`. Códigos documentados como permanentes
  (`invalid_request`, `unsupported_input`, `invalid_parameter`, `invalid_prompt`,
  `content_policy_violation`, `context_length_exceeded` e sinônimos) resultam em
  `retryable = false`. Código ausente, vazio, malformado ou não reconhecido também resulta em
  `retryable = false` — fallback conservador, sem retry automático agressivo.
- O código de erro público continua sendo exclusivamente `EXTRACTION_PROVIDER_ERROR`; nenhum
  código novo (`EXTRACTION_PROVIDER_SERVER_ERROR`, `EXTRACTION_RATE_LIMITED` etc.) foi criado.
  A diferenciação continua sendo só via `retryable`, como exigido pela auditoria.
- `docs/integration-notes/agent-b-c-handoff.md` recebeu uma seção nova,
  **DOCUMENT PROCESSING ORPHAN RECOVERY**, documentando explicitamente para C que a recuperação
  de documentos presos em `processing` após um crash não foi implementada em B e pertence à
  orquestração de `/process` em C, junto com as garantias de concorrência que essa recuperação
  precisa preservar.

Arquivos modificados nesta rodada: `src/modules/extraction/providers/openai.provider.ts`.
Arquivos criados nesta rodada: `src/modules/extraction/providers/provider-failure.ts`,
`tests/unit/extraction/provider-failure.test.ts`, `docs/B-VALIDATION-REPORT.md` (atualizado),
`docs/integration-notes/agent-b-c-handoff.md` (seção adicionada). Nenhum arquivo de
`src/contracts`, migration, ou teste pré-existente foi removido ou enfraquecido; os testes
adicionados em `tests/unit/extraction/provider.test.ts` foram inseridos entre testes já
existentes, sem tocar nos demais casos.

Nada em `src/contracts`, migrations, RLS, Storage, prompt de extração, structured output,
provider abstraction, concorrência (`processing` + token de tentativa) ou owner scoping foi
alterado. Nenhuma dependência nova foi adicionada; o lockfile não mudou.

## Estado

**PARTE B: APROVADA PARA INTEGRAÇÃO COM A PARTE C** no escopo de implementação isolada,
validação runtime/semântica, testes unitários e build executados nesta rodada.

São **271 testes aprovados em 16 arquivos: 181 de B (144 preexistentes + 37 desta
microcorreção) e 90 da Foundation preservados**. Instalação por lockfile, audit, lint,
typecheck e build passaram. O audit retornou zero vulnerabilidades conhecidas. Nenhum teste
foi desabilitado ou marcado como skip.

Essa aprovação não homologa a integração live do provider, Supabase real, RLS/Storage,
concorrência efetiva no banco, CI remoto ou a Foundation. Esses gates continuam não executados
nesta rodada (ambiente sem Docker/Podman e sem credenciais de IA — ver seção de gates abaixo).
O estado de reprovação da integração definitiva registrado na A.2 não foi alterado.

## Escopo e preservação

Todos os **133 arquivos originais da A.2 permanecem byte a byte idênticos**, verificados por
SHA-256 em docs/validation-b/preservation.json. Arquivos existentes alterados: **nenhum**.
Dependências adicionadas/atualizadas: **nenhuma**; package.json e lockfile foram preservados.

Foram lidos integralmente o contrato arquitetural v1.1, as instruções de B, o relatório A.1,
foundation.md, as notas A.1 de contratos/segurança, os handoffs de Auth/idempotência e os
documentos atuais A.2. O ZIP A.2 já fecha ComparisonResult e contém schemas Zod canônicos;
B os respeita, sem repetir a lacuna histórica de arrays opacos como um problema atual.

Código novo está somente em src/modules/extraction; testes em tests/unit/extraction e
fixtures em tests/fixtures/extraction. As únicas adições fora desses diretórios são documentação
de B e evidências de execução em docs/validation-b. Essa extensão documental permite revisar
o resultado e não modifica autoridade arquitetural. O inventário completo está em
docs/validation-b/changed-files.json.

Nenhuma migration, schema PostgreSQL, RLS, policy, Auth, repository da Foundation, rota,
contrato canônico, página, layout, regra financeira ou status global foi alterado.
Não há /process, Comparison Engine, UI, History ou Feedback nesta entrega.

## Implementação entregue

### API e separação de responsabilidades

- `createExtractionService(authorizedBackendClient)` monta a integração de produção no servidor.
- `ExtractionService.extract({ ownerId, comparisonId, documentId, requestId })` retorna apenas
  Promise<ExtractedQuote> validado e persistido/reutilizado, ou AppError canônico.
- `ExtractionProvider.extract({ bytes, mimeType })` retorna Promise<unknown>.
- `ExtractionStore` é um port interno, com adapter Supabase dedicado a B.
- `validateExtraction(unknown)` aplica as duas camadas de validação, inclusive para JSON persistido.

As entradas executáveis do módulo importam server-only. O serviço não depende de React,
componentes, rotas, browser, localStorage, ComparisonResult ou estado agregado da comparação.

### Provider e configuração

Implementado OpenAI Responses API por fetch nativo, após consulta às fontes oficiais listadas
em agent-b-provider.md. PDF é transmitido como input_file base64; PNG/JPEG/WebP como input_image.
Não há upload adicional para Files API, public URL, URL assinada, web search, segundo LLM,
histórico, ferramentas, OCR próprio ou cópia persistente adicional do documento.

AI_PROVIDER=openai, AI_MODEL e AI_API_KEY são obrigatórios no servidor. Não existe model ID
hardcoded, default de segredo ou fallback de provider. AI_TIMEOUT_MS é opcional (60000);
AI_MAX_OUTPUT_TOKENS é opcional (12000). Modelo/modalidades/acesso precisam ser confirmados
pelo operador na configuração. A criação é lazy para que reuse não dependa de credencial de IA.

Uma tentativa por chamada, timeout com AbortController, limite de 10 MiB por documento e
1 MiB de resposta HTTP. Structured Outputs usa JSON Schema derivado do Zod canônico,
strict=true, campos required e objetos fechados. O protocolo só aceita uma mensagem assistant
completed com um output_text JSON. Recusas, truncamento e conteúdo inesperado são rejeitados.

### Schema runtime e semântica

O schema estrito já existente em @/contracts é reutilizado, sem duplicar ExtractedQuote,
ExtractedItem, EvidenceRef ou ShippingStatus. Nenhum cast converte resposta crua em domínio;
não há any explícito, @ts-ignore, coerção/default Zod ou propriedade inventada no DTO.

A segunda camada valida:

- versão numérica 1 e números finitos;
- evidência útil para cada fato crítico não nulo e cada item;
- página positiva inteira ou null, sem inventar página;
- coerência textual do valor com sua citação, número ligado ao rótulo de total/prazo;
- total explicitamente citado, sem soma de itens ou custo comparável;
- estados/valores de frete coerentes, com ausência=not_informed/null e a combinar=unclear/null;
- included não implica amount=0; zero exige token numérico explícito na evidência;
- BRL com marcador suficiente em uma citação; UNKNOWN e null são preservados;
- missingFields coerente com a convenção interna documentada, sem duplicatas ou esconder parsing inválido;
- rejeição de evidências genéricas/vazias, comandos conhecidos e recomendações em observations.

O módulo rejeita em vez de completar dados. Os reconhecedores lexicais são conservadores;
idiomas/rótulos/formatações fora do conjunto suportado podem produzir falso negativo.

### Prompt injection e evidence

O system prompt é constante e não interpola conteúdo documental. O PDF/imagem aparece apenas
como conteúdo multimodal user, com rótulo explícito UNTRUSTED DOCUMENT CONTENT. Instruções
documentais são tratadas como dados hostis, sem autoridade para mudar tarefa, schema ou valores.
O prompt exige citações literais, ausência quando incerto, nenhuma fonte externa, nenhum cálculo,
nenhuma revelação de prompt/segredo e nenhuma recomendação.

Dois PDFs adversariais reais e sintéticos incluem comandos de substituição de valores e
falsificação de papéis/pedido de exfiltração. Os testes inspecionam o payload e rejeitam respostas
que usam essas instruções como evidência. Não se afirma que mocks comprovem robustez de um
modelo live contra toda técnica de prompt injection.

Não existe transcrição/OCR independente. O provider também propõe o trecho de evidência;
por isso um fato e uma citação plausíveis, ambos fabricados, não são universalmente detectáveis
pela validação estrutural/lexical. Observations não possui slot canônico de evidence, limitando
sua auditoria automatizada. Essas são limitações explícitas para avaliação antes do piloto,
não controles supostamente resolvidos por um confidence score ou segundo LLM.

### Persistência, owner e reuse

Todas as consultas privilegiadas de B filtram owner_id, comparison_id e id do documento.
O path é recuperado sob esse escopo, conferido com a Foundation e lido no bucket privado.
C deve autenticar, derivar owner da sessão, validar a comparação e controlar o lock agregado.

O serviço controla apenas uploaded/failed → processing → completed/failed do documento.
Completed é escrito com extracted_data validado, extraction_schema_version=1 e error_code=null
no mesmo UPDATE. Failed limpa dados/version no mesmo UPDATE. As transições finais exigem
processing e o updated_at devolvido ao iniciar a tentativa; nenhum write altera comparisons.

Completed persistido é revalidado estrutural e semanticamente e exige versão numérica coerente.
Se válido, não há leitura do arquivo nem provider call. Se inválido, falha explicitamente,
sem repair ou reprocessamento. Processing existente retorna conflito. A recuperação após crash
precisa ser definida por C/integrador; não há takeover/scheduler/migration em B.

Erros sanitizados não carregam raw provider response, prompt, documento, chave, JWT ou stack
interna em message/details/logs. Logs usam somente requestId, comparisonId, documentId, stage,
errorCode e durationMs, além do timestamp já adicionado pelo logger da Foundation.
store=false é solicitado ao provider; isso não constitui certificação de retenção zero.

## Testes e resultados executados

| Gate | Resultado | Evidência em docs/validation-b |
|---|---|---|
| npm ci | PASS, exit 0 | install.log |
| npm run audit:dependencies | PASS, zero vulnerabilidades | audit.log |
| npm run lint | PASS, exit 0 | lint.log |
| npm run typecheck | PASS, exit 0 | typecheck.log |
| npm run test:unit | PASS, 271 testes, 16 arquivos, 0 falhas/skip | unit.log |
| npm run build | PASS, Next 15.5.25, middleware compilado | build.log |
| npm run test:smoke | PASS, homepage, quatro rotas sem sessão, seis cookies malformados | smoke.log |
| Preservação da A.2 | PASS, 133/133 arquivos idênticos (nenhum arquivo pré-existente de A alterado) | — |

A seleção do comando de unitários continua exatamente tests/unit. A execução foi feita após
npm ci, sem credencial de IA e sem enfraquecer/remover nenhum teste pré-existente de B ou A.

| Arquivo de teste (extraction) | Quantidade | Situação nesta rodada |
|---|---:|---|
| semantics.test.ts | 72 | preservado, inalterado |
| provider.test.ts | 49 | preservado + 8 novos (B1.1–B1.7 e caso sem `error`) |
| service.test.ts | 19 | preservado, inalterado |
| store.test.ts | 12 | preservado, inalterado |
| provider-failure.test.ts | 29 | novo — classificação isolada `isRetryableProviderFailure` |
| Total de B | 181 | 144 preexistentes + 37 novos desta microcorreção |

Cobertura dos requisitos: B01–B14 (dados, ausências, evidência, schema, propriedades extras,
injection e não cálculo); B15–B18 (rede, 5xx, rate limit, MIME); B19–B20 (write coerente e
owner scoping); B21–B22 (reuse e persisted JSON inválido); B23 (sanitização e logs estreitos).
Há 15 PDFs sintéticos acompanhados de transcrição/expected JSON e duas respostas adversariais
explícitas em invalid-responses.json. Os PDFs foram renderizados e inspecionados visualmente.

Na primeira rodada com os novos testes, o typecheck detectou o acoplamento de ProcessEnv à
augmentação NODE_ENV de Next. A leitura de configuração foi ajustada dentro de B para um mapa
readonly de strings; o typecheck final e o build passaram. O erro original está preservado em
typecheck-initial.log. Não houve relaxamento do compilador ou mudança em tipos globais.

## Não executado e integrações pendentes

| Gate/integração | Situação concreta |
|---|---|
| Provider live (`test:extraction:live` opt-in) | NÃO EXECUTADO: AI_API_KEY/AI_PROVIDER/AI_MODEL ausentes neste ambiente; não é falha de B |
| Supabase real, reset/migrations, test:security | NÃO EXECUTADO: Docker/Podman ausentes (`failed to inspect service`) e portas locais 54321/54322 inacessíveis |
| Smoke autenticado/RLS/Storage/FKs/concorrência PostgreSQL | Não executados; testes do adapter usam SDK real com transporte em memória |
| GitHub Actions | Não executado; não há run remoto associado ao ZIP recebido |
| /process e integração financeira | Pendentes da Parte C, fora do ownership desta entrega |

environment.json registra disponibilidade sem expor valores de credenciais. Os testes de
Foundation que exigem banco não foram enfraquecidos ou transformados em PASS. npm test continua
incluindo integração real; para executar tudo é necessário provisionar a infraestrutura existente.

Antes do piloto: executar integração DB/Storage e CI reais, configurar um modelo compatível,
avaliar os documentos/adversários com provider live, revisar fidelidade das citações/observations
e retenção de dados, e integrar o lock/retry/estado agregado pela Parte C. Nada foi implantado,
enviado a um provider de IA ou aplicado a um Supabase remoto durante esta tarefa.

## Arquivos criados e handoff

O inventário exato, sem node_modules/build/cache, está em docs/validation-b/changed-files.json.
Principais grupos:

- src/modules/extraction/application, domain, infrastructure, prompts, providers, validation e index.ts;
- tests/unit/extraction: quatro arquivos de teste;
- tests/fixtures/extraction: 15 PDFs, cases.json, invalid-responses.json, helpers.ts e gerador offline;
- docs/integration-notes/agent-b-provider.md;
- docs/integration-notes/agent-b-persistence.md;
- docs/integration-notes/agent-b-c-handoff.md;
- docs/B-VALIDATION-REPORT.md e docs/validation-b/*.

O handoff documenta instanciação, input/output, configuração, AppError/retryable, missingFields,
reuse de completed e responsabilidades restantes de C. O pacote exclui node_modules, .next,
caches, credenciais e cópias temporárias de documentos. A entrega preserva integralmente a base
A.2 e acrescenta somente a Parte B e suas evidências de validação.
