# A.1 — Contratos canônicos e limite do anexo

`src/contracts/index.ts` centraliza ComparisonStatus, DocumentStatus, EvidenceRef, ShippingStatus, ExtractedItem, ExtractedQuote, CostAssessment, ComparisonResult e os códigos compartilhados. `src/core/domain/types.ts` mantém entidades de persistência; os nomes antigos de status são reexports/aliases da mesma fonte, não definições paralelas.

O arquivo v1.1 entregue congela integralmente ExtractedQuote/CostAssessment, mas descreve ComparisonResult apenas por seus campos externos. Não fornece a definição dos elementos de `suppliers` nem de `normalizedItems`. O contexto recuperado também não forneceu essas definições completas.

Para não inventar campos de motor, `ComparisonResult<TSupplier = unknown, TNormalizedItem = unknown>` mantém esses elementos opacos e exige os campos externos descritos. IDs dos highlights permitem null, preservando ausência de fato; warnings é string[] e summary é string. Isso é um tipo de transporte parcial, não aprovação de schema runtime do resultado.

O integrador deve completar os dois elementos e confirmar o DTO runtime antes da integração do resultado real de C. Não criar tipos concorrentes em core/domain ou em cada módulo. A.1 persiste result null e não aceita resultado do browser; por isso não usa esse tipo parcial para aprovar nem fabricar resultados. Não existe bestSupplierId.

`ExtractedQuote.schemaVersion` e `QuoteDocument.extractionSchemaVersion` usam a mesma representação numérica. A coluna agora é integer. B deve persistir extração validada e versão na mesma operação, com owner validado, preservando null, UNKNOWN e not_informed.
