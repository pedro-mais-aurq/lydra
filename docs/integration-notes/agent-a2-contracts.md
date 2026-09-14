# A.2 — Contratos congelados pelo integrador

Esta nota substitui a pendência de arrays opacos de `agent-a1-contracts.md`.
A autorização da A.2 fecha somente o transporte em `src/contracts`; não implementa B/C/D/E.

`SupplierComparison` contém exclusivamente `documentId` (UUID do documento),
`supplierName` nullable, `costAssessment` canônico, `deliveryDays` nullable,
`currency` BRL/UNKNOWN e `missingFields: string[]`.

`NormalizedItem` contém `match: exact | probable | unmatched` e `entries`.
Cada entrada tem `documentId`, `itemIndex` (índice zero-based no `ExtractedQuote.items`)
e `item: ExtractedItem`, preservando os dados/evidência extraídos. Não há conversão de unidades,
agregação de preços ou descrição inventada. Um grupo possui no máximo uma entrada por documento;
um item não pode aparecer em dois grupos. `unmatched` possui uma entrada; matches têm ao menos duas.
`exact` exige unidade explicitamente informada e literalmente igual em todas as entradas.
Unidades desconhecidas/diferentes exigem `probable` ou `unmatched`. O schema valida estrutura;
a decisão de equivalência semântica e sua justificativa continuam pertencendo à futura Parte C.

`ComparisonResult` contém os arrays concretos acima, `highlights` com os três UUIDs nullable
congelados e `warnings`, e `summary: string`. UUIDs de highlights/itens referenciam fornecedores
presentes. Não são gerados highlights, resumo, preços ou matches nesta rodada.

Schemas Zod exportados: `comparisonStatusSchema`, `documentStatusSchema`,
`shippingStatusSchema`, `evidenceRefSchema`, `extractedItemSchema`, `extractedQuoteSchema`,
`costAssessmentSchema`, `supplierComparisonSchema`, `normalizedItemSchema`, `comparisonResultSchema`.
Objetos são strict: campos extras são rejeitados, inclusive campos de vencedor/ranking.
Não há defaults nem coerções. `null != 0`, `UNKNOWN != BRL`, `not_informed != included`.
As definições congeladas de extração/custo mantêm exatamente os tipos da v1.1;
testes de equivalência TypeScript verificam a correspondência dos schemas.

Repositories validam status e JSON persistido antes de entregá-los à API.
JSON inválido vindo do backend não é silenciosamente repassado: a fronteira responde com erro
interno controlado. Ao integrar B/C, executar `.parse` no schema canônico antes da persistência;
validar os vínculos dos documentIds com a comparação/owner autorizados na operação backend.
A Foundation não cria os métodos de persistência/transições de B/C.

`schemaVersion` continua literal numérico 1, assim como `extraction_schema_version`.
Nenhuma migration transforma resultados antigos em informação confiável ou inventa campos ausentes.
