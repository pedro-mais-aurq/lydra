# Lydra B4 — extração documental com classificação monetária

O contrato público continua sendo `ExtractedQuote` v1. O nome histórico
`OpenAIExtractionProvider` e a fábrica usada pela Parte C foram preservados.
Internamente, tanto OpenAI quanto OpenRouter executam duas chamadas.

| Estágio | Responsabilidade | Saída |
| --- | --- | --- |
| Interpreter | Interpretar fatos não monetários, status de frete e trechos documentais | `InterpretationDraft` interno |
| Candidate extractor | Localizar tokens literais, normalizar números/moedas, atribuir IDs | `MonetaryCandidate[]` |
| Classifier | Interpretar o papel dos candidatos existentes | IDs ou `null`, sem valores monetários diretos |
| Assembler | Resolver referências, validar procedência e montar os campos | `ExtractedQuote` canônico |
| Validator / service | Validar fatos e invariantes, persistir usando o lease existente | Documento completed ou erro público existente |

## Evidências e números sem moeda

`monetaryEvidence` usa `{ evidence: EvidenceRef, unmarkedTokens: string[] }`.
O ajuste do DTO interno é intencional: números inteiros sem símbolo também podem
ser preços, mas não são distinguíveis de quantidade/prazo por sintaxe apenas.
A IA identifica os tokens potencialmente monetários como transcrições literais,
sem lhes atribuir papel financeiro nem retornar valores monetários finais.

Exemplo: `{ evidence: { page: 1, text: "Montante: 4.500,00" },
unmarkedTokens: ["4.500,00"] }` gera um candidato de valor 4500 e moeda UNKNOWN.
Com `R$ 4.500,00`, usa-se `unmarkedTokens: []`: o código encontra o marcador.
Não se deve listar em `unmarkedTokens` valores que já tenham marcador de moeda.

O parser valida ocorrências completas, delimitadores e formatação. Datas,
identificadores, telefones e percentuais não são varridos como dinheiro; números
sem marcador nem indicação do interpreter não viram candidatos. A atribuição
monetária de um número sem símbolo continua sendo uma decisão da IA, sujeita a
erro semântico. Não foi introduzido um dicionário de rótulos comerciais.

Cada candidato retém raw, evidence, índice da evidência e offsets. O assembler
reextrai os candidatos das evidências e confere todos esses dados antes de
resolver IDs; candidato desconhecido ou adulterado causa EXTRACTION_INVALID.
Duas ocorrências com o mesmo valor continuam distintas. Uma ocorrência só pode
ser usada em um papel: não se copia preço unitário para total de item.

A evidência canônica de item/frete deve ser um trecho literal existente que
contenha tanto o fato interpretado quanto seus preços selecionados. Trechos de
páginas diferentes ou sem um trecho comum não são concatenados artificialmente.
O interpreter é instruído a manter a linha/trecho completo nesses casos.

## Configuração server-side

Os valores e placeholders estão em `.env.example`. Nenhum ID de modelo é fixado
no código. Ambos os modelos devem suportar os parâmetros de structured output;
o interpreter também deve suportar os arquivos/imagens conforme o provider.

| Campo | Precedência |
| --- | --- |
| Modelo interpreter | `AI_INTERPRETER_MODEL` → `AI_MODEL`; obrigatório |
| Modelo classifier | `AI_CLASSIFIER_MODEL` → `AI_MODEL` → modelo interpreter resolvido |
| Timeout interpreter | `AI_INTERPRETER_TIMEOUT_MS` → `AI_TIMEOUT_MS` → 180000 |
| Timeout classifier | `AI_CLASSIFIER_TIMEOUT_MS` → `AI_TIMEOUT_MS` → 45000 |
| Tokens interpreter | `AI_INTERPRETER_MAX_OUTPUT_TOKENS` → `AI_MAX_OUTPUT_TOKENS` → 12000 |
| Tokens classifier | `AI_CLASSIFIER_MAX_OUTPUT_TOKENS` → `AI_MAX_OUTPUT_TOKENS` → 2000 |

Variável explicitamente vazia é inválida; remova variáveis opcionais não usadas.
O construtor interno mantém model/timeoutMs/maxOutputTokens no nível superior
para o interpreter e recebe a configuração separada de classifier. Chamadores
antigos do construtor sem classifier reutilizam o modelo, com limites 45000/2000.

`AI_PROVIDER` e `AI_API_KEY` são obrigatórios. `AI_BASE_URL`, se definido, deve
ser exatamente o endpoint permitido para o provider, com barra final tolerada:
OpenAI `https://api.openai.com/v1`; OpenRouter `https://openrouter.ai/api/v1`.

O transporte HTTP anterior foi extraído para `StructuredOutputTransport`:
OpenAI usa `/responses`, OpenRouter `/chat/completions`. PDF OpenRouter conserva
`type:file` e `file-parser` com `cloudflare-ai`; imagens usam `image_url`.
O classifier só recebe texto JSON no papel user e nunca PDF, imagem ou plugin.
Ambos usam JSON Schema fechado; IDs do classifier também são enumerados no wire
schema. Cada requisição tem seu próprio AbortController, timeout e leitura de
resposta limitada a 1 MiB, incluindo cancelamento da leitura.

## Limites e comportamento

- Evidência nova: até 1200 caracteres; até 500 itens/evidências monetárias,
  1000 candidatos e 64 KiB de contexto JSON do classifier. Excesso gera erro
  explícito, sem truncar evidências nem executar fallback. Ajustar tokens de
  saída é necessário para documentos com muitos itens.
- included não vira zero. Um valor só é mantido quando existe ocorrência
  documentada selecionada, preservando a possibilidade prevista na baseline.
- BRL vem dos candidatos selecionados com marcador; moeda estrangeira explícita
  selecionada força UNKNOWN, sem conversão. Moedas estrangeiras reconhecidas
  sintaticamente: USD, EUR, GBP, JPY, CAD, AUD, CHF, CNY e símbolos suportados.
- `missingFields` é calculado pelo código. `deliveryDays` exige inteiro finito
  não negativo e evidência, inclusive prazo por extenso interpretado pela IA.
- O validador público usado por C e na reutilização verifica a forma canônica,
  os números literais, evidências, moedas e invariantes. O formato persistido v1
  não armazena IDs/offsets; por isso não permite reconstruir a classificação
  original de documentos antigos. Não há migração nem nova chamada de IA no reuse.
- A comparação continua somando frete quando o status é additional. Cabe à IA
  distinguir frete já contido no total final de frete externo. B4 não subtrai
  frete de totais nem altera a aritmética de C.
- Evidência produzida pela IA não é uma verificação independente de OCR contra
  os bytes originais. O código prova a existência do token na evidência fornecida.
- As defesas de prompt injection e observações são barreiras de instrução,
  schema, evidência e validação. Testes mockados não provam imunidade de um modelo
  real nem que uma classificação semanticamente errada de um ID válido é impossível.

## Testes e pendência de escopo

Executar na raiz do projeto:

```bash
npm ci
npm run lint
npm run typecheck
npm run test:unit
npm run test:unit -- --config src/modules/extraction/tests/vitest.config.ts
npm run build
npm run test:smoke
```

A suíte B4 contém 144 testes. A configuração raiz da baseline só inclui
`tests/**/*.test.ts` e suas expectativas antigas pressupõem uma única LLM que
retorna o contrato final e um validator que decide linguagem comercial.

Os arquivos de teste e a configuração raiz não foram alterados, pois estão
fora de `src/modules/extraction/**`. O gate original tem 12 falhas nesse estado;
por isso a entrega não é declarada aprovada.

`tests/legacy-test-migration.patch` contém uma proposta de atualização de apenas:
`tests/unit/extraction/provider.test.ts`, `tests/unit/extraction/semantics.test.ts`
e `vitest.config.ts`. Nenhum teste foi excluído ou marcado skip. O patch foi
aplicado somente numa cópia de revisão, onde o comando padrão passou com
544 testes. O arquivo está pendente de autorização para ampliar esse escopo.

Após autorização, os comandos de aplicação são:

```bash
git apply --check src/modules/extraction/tests/legacy-test-migration.patch
git apply src/modules/extraction/tests/legacy-test-migration.patch
npm run test:unit
```

O relatório e os logs em `validation-b4/` distinguem a entrega efetiva da
simulação de revisão. Nenhum teste exigiu chamadas reais de IA ou Supabase.
