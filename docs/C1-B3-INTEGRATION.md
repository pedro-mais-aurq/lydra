# Integração C.1 + B.3

A base desta entrega é `lydra-parte-a2-final.zip`. A C antiga forneceu apenas contexto histórico; nenhum arquivo de código dela foi importado. A B.3 foi recebida depois e integrada por seleção dos arquivos novos, preservados byte a byte. Os três arquivos que seu ZIP omitia (`.github/workflows/ci.yml`, `.gitignore`, `supabase/.gitignore`) continuam presentes a partir da A.2. O cache `tsconfig.tsbuildinfo` da B.3 não foi importado.

## Composição de runtime

`POST /api/comparisons/:id/process` valida a sessão com `createSupabaseServerClient` e `requireOwner`, valida o UUID e só então cria o backend privilegiado. Ignora o corpo da requisição. O serviço faz leitura owner-only, checa 2–4 documentos, adquire a linha pai por UPDATE condicional e relê os documentos depois da aquisição. Uma terceira leitura verifica as extrações persistidas antes de executar o engine.

`createB3ExtractionPort` usa o `ExtractionService`, provider, configuração, leitura privada de Storage e validação originais da B.3. `repositoryExtractionStore` adapta a interface `ExtractionStore`: suas três gravações chamam exclusivamente os métodos novos do `QuoteDocumentRepository` oficial. A implementação original da B.3 não foi modificada. Sua factory original continua disponível no módulo B, mas a rota C usa a composição desta entrega para centralizar as gravações nos repositories oficiais.

B controla a sequência de estados de cada documento; C controla o agregado. Não há duas marcações de `processing` para o mesmo documento. `updated_at` é preservado exatamente como devolvido pelo banco, inclusive precisão e offset, e é usado nas condições de conclusão/falha. Não foi criado campo de lease nem migration.

Extrações `completed` são validadas pelo schema canônico e pela mesma validação semântica/evidências da B.3. Não são reextraídas. Todas as extrações precisam estar efetivamente persistidas como `completed`, versão 1, antes do engine. Retornar um orçamento sem persistir não produz sucesso.

## Provider e retry

A configuração continua sendo `AI_PROVIDER`, `AI_MODEL` e `AI_API_KEY` server-side; os opcionais e limites são os da B.3. Nenhum model ID foi escolhido pela C, e nenhuma chamada real de IA foi feita na validação desta rodada. O provider é construído de forma preguiçosa: todos os documentos previamente extraídos podem concluir sem chave/modelo/provider configurados.

Os códigos canônicos da B.3 são preservados, com mensagens e detalhes sanitizados. `retryable` continua sendo a indicação da B.3: quota/billing permanente pode resultar em `EXTRACTION_PROVIDER_ERROR` com `retryable=false`; falha transitória pode resultar em `true`. C não infere retryabilidade de um HTTP 429 nem faz retry automático, backoff ou fila. Uma nova chamada explícita sobre `failed` reaproveita as extrações válidas.

## Resposta

Sucesso: HTTP 200, `{ "data": <comparação final serializada>, "requestId": "uuid" }`, usando `serializeComparison` e `respondOk` da A.2. Não devolve `ownerId` ou caminho privado de Storage. Erros usam `respondError`, envelope canônico e `Cache-Control: private, no-store`. Cross-owner é 404 `COMPARISON_NOT_FOUND`. `processing` e `completed` são rejeitados com 409 `INVALID_COMPARISON_STATE`.

## Cálculo e normalização

O engine é puro, síncrono e determinístico. Não interpreta evidências textuais, acessa ambiente, consulta banco, chama IA, soma itens como fallback ou arredonda números extraídos. Moeda UNKNOWN não participa de destaques monetários. Empates de mínimo produzem highlight nulo e warning, sem desempate por ID ou ordem.

Normalização: texto normalizado igual + unidade original explicitamente igual e não vazia permite `exact`. Unidades diferentes são incompatíveis. `probable` exige igualdade textual com unidade desconhecida ou Jaccard de tokens >= 0,9, com pelo menos três tokens distintos e diferenças limitadas a artigos/preposições gramaticais. Não são descartadas diferenças de modelo, dimensão, cor, material ou negação. Reordenação dos mesmos tokens pode ser provável. Um componente só vira grupo quando todos os pares são compatíveis e existe no máximo um item por documento. Duplicatas e pontes ambíguas ficam unmatched. IDs/índices estabilizam apenas a ordem técnica.

## Notas herdadas

Os documentos `B-VALIDATION-REPORT.md` e `agent-b-*.md` foram preservados como histórico da entrega isolada da B.3. As referências deles a `/process` ausente e persistência/lock a integrar foram atendidas por esta C.1. O relatório atual é `C1-VALIDATION-REPORT.md`; as duas notas `agent-c-*` desta entrega contêm apenas limitações atuais de infraestrutura e interrupção abrupta do agregado.
