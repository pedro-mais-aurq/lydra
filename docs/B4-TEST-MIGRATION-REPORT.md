# Lydra B4.1 — Migração e reconciliação dos testes

**Resultado: B4.1 — APROVADA.** Data: 14/09/2026.

Aprovação restrita à migração da suíte solicitada. Não constitui uma nova auditoria de produção, validação de infraestrutura remota ou medição da qualidade semântica de um modelo real.

## Resultado verificável

| Indicador | Resultado |
| --- | --- |
| Baseline executado | 400 testes: 388 PASS, 12 FAIL, 0 SKIP |
| Testes legados migrados/adaptados | 23 casos executáveis: 15 do provider, 8 do validador |
| Falhas iniciais reconciliadas | 12 de 12 |
| Testes antigos excluídos sem substituição | 0 |
| Expectativas antigas substituídas | 5 declarações, correspondentes a 8 casos; tabela abaixo |
| Testes B4 existentes integrados | 144 |
| Novos testes adicionados nesta rodada | 32 |
| Suíte oficial final | 576 testes em 32 arquivos distintos |
| PASS / FAIL / SKIP | 576 / 0 / 0 |
| `npm run lint` | PASS, exit 0 |
| `npm run typecheck` | PASS, exit 0 |
| `npm run test:unit` | PASS, exit 0 |
| `npm run build` | PASS, exit 0 |
| Código de produção alterado | NÃO; conferência SHA-256 contra o ZIP recebido |
| Bugs reais de produção demonstrados nesta rodada | Nenhum |

Contagem: **400 + 144 + 32 = 576**. Nenhuma contagem foi forçada para atingir a referência de 544.

Logs e resultados estruturados estão em `docs/validation-b4-1/`. O build concluiu com avisos de Autoprefixer sobre valores CSS `start`/`end` em código preexistente. O CSS permaneceu intacto.

## Baseline e intenção dos testes

As 12 falhas foram reproduzidas antes de qualquer edição:

| Grupo | Falhas | Reconciliação |
| --- | ---: | --- |
| Configuração do provider | 1 | Default vigente de 180000 ms para o interpreter; preservadas validações de configuração inválida |
| Schema enviado à IA | 1 | Schema interno `InterpretationDraft`; objetos continuam fechados e propriedades obrigatórias verificadas recursivamente |
| PDFs adversariais | 2 | Duas respostas simuladas: interpretação e classificação; preservados PDF, isolamento de instruções, autenticação e ausência de segredo no corpo |
| Imagens PNG/JPEG/WebP | 3 | Mesmo transporte de imagem, com as duas respostas B4 |
| Metadados de reasoning | 1 | Metadados de protocolo tolerados, com interpretação e classificação válidas e validação do resultado montado |
| Total exibido | 1 | Rejeição de valor ausente preservada; seleção de ocorrência verificada no assembler |
| Prazo e fornecedor | 1 | Evidência literal do fornecedor preservada; prazo validado por estrutura, limites e presença de evidência |
| Frete não aplicável | 1 | Evidência obrigatória e valor nulo; significado pertence ao interpreter |
| Frete incluído | 1 | Status interpretado preservado, null permitido e ID de frete inexistente rejeitado |

Também foram corrigidos testes que já passavam por razões inadequadas:

- Os quatro casos parametrizados de “frete a combinar” rejeitavam outros status por divergência de `missingFields`, sem provar a regra lexical anunciada. Agora protegem `unclear`, ausência de valor e evidência obrigatória.
- Os dois testes de provider que obedecia à injeção enviavam o DTO antigo. Agora usam um `InterpretationDraft` estruturalmente válido (assert explícito), de modo que a rejeição realmente exercite a proteção da evidência hostil. Verificam que não há classificação nem persistência concluída.
- Os quatro casos de MIME não suportado e o caso de assinatura/tamanho mantêm rejeição antes da rede, com setup compatível com B4.

## Proteções mantidas

Foram mantidos schema fechado, null, evidência ausente/vazia/placeholder/página inválida, injeção, observações indevidas, erros e retryability do provider, timeout/abort, MIME, assinatura, tamanho, JSON malformado, moeda factual, itens sem evidência e coerência de `missingFields`.

`service.test.ts` (19 casos), `store.test.ts` (12) e `provider-failure.test.ts` (29) permaneceram intactos. Assim como os demais testes preexistentes de ownership, autorização, retry, idempotência, persistência, comparação e produto. Integração com banco/Storage real não foi executada: o gate solicitado é `test:unit`.

## Registro de substituições de expectativas antigas

Não houve exclusão de arquivos de testes. A tabela registra todas as declarações antigas substituídas, inclusive as parametrizadas. Elas conservam proteções válidas e transferem as expectativas específicas da arquitetura antiga para o ponto correto da B4.

| Arquivo | Nome antigo | Motivo | Teste substituto |
| --- | --- | --- | --- |
| `tests/unit/extraction/semantics.test.ts` | `B12 rejects using item amounts or an unrelated number as a displayed total` | O papel de um número não é classificado pelo validator; número inexistente continua inválido | `B12 rejects absent monetary facts and assembles exactly the classified occurrence` — seleção exata, evidência, valor ausente e `money-99` |
| Mesmo arquivo | `rejects unsupported text, ranges, and a numeric deadline from another field` | Interpretação linguística do prazo pertence ao interpreter | `rejects unsupported supplier text and invalid or unevidenced delivery values` — fornecedor sem suporte, prazo por extenso, finitude, inteiro, não negativo e evidência |
| Mesmo arquivo | `enforces unclear for %s` (4 casos) | Não exigir dicionário lexical de frete nem depender de `missingFields` desatualizado | `preserves interpreted unclear and rejects an amount for %s` — status, null e evidência |
| Mesmo arquivo | `does not accept not_applicable without explicit grounds` | Código verifica presença de evidência, não reinterpreta o significado comercial | `requires evidence and null amount for interpreted not_applicable` |
| Mesmo arquivo | `does not accept excluded shipping as included` | Interpretação de incluído/excluído pertence à IA; código valida invariantes | `preserves interpreted included with null and rejects an unknown shipping candidate` |

A declaração de schema do provider foi renomeada de “canonical schema” para “internal interpreter schema”, preservando a inspeção recursiva. Não é remoção de proteção.

O arquivo auxiliar `src/modules/extraction/tests/legacy-test-migration.patch` foi removido após consumo. Não era um teste. Apenas a parte de provider foi reutilizada após leitura da implementação, com correção adicional dos casos de injeção; as substituições semânticas foram escritas especificamente para as invariantes B4.

## Cobertura B4 ativa

| Arquivo | Casos finais | Cobertura |
| --- | ---: | --- |
| `src/modules/extraction/tests/unit/monetary.test.ts` | 49 | Sintaxe monetária, moeda estrangeira/ausente, números não monetários, tokens não marcados, duplicatas e ausência de cálculo |
| `src/modules/extraction/tests/unit/classification-assembly.test.ts` | 43 | Schemas fechados, IDs/null, índices, provenance, montagem, frete, moeda, evidências, fixtures A/B/C e validação factual |
| `src/modules/extraction/tests/unit/provider-pipeline.test.ts` | 52 | OpenRouter/OpenAI, duas etapas, schema dinâmico, PDF/file-parser, imagens, retry, reuso, erros HTTP, JSON e timeout por etapa, isolamento de prompt |
| `src/modules/extraction/tests/unit/b41-invariants.test.ts` | 29 novos | Lacunas específicas descritas abaixo |
| `tests/unit/extraction/provider.test.ts` | 52 | 49 casos anteriores reconciliados quando necessário + 3 novos percursos canônicos |

Os 29 novos casos cobrem:

- Preservação dos fatos não monetários e draft vazio.
- Evidência obrigatória dos quatro fatos não nulos.
- Cinco evidências monetárias vazias/placeholder e cinco páginas inválidas.
- Prazo zero e página desconhecida, sem depender de palavra-chave.
- Evidência obrigatória nos quatro status de frete informado.
- Observação não contida literalmente na evidência.
- Sintaxe explícita `R$ 4500,50`.
- Apenas candidatos 4500/200 quando 4700 não está impresso.
- Ocorrências iguais em contextos diferentes com IDs `money-0`/`money-1`.
- ID desconhecido em cada campo monetário do item.
- Seleções de itens fora de ordem, valores unitário/total exatos e ausência de multiplicação para “corrigir” valores impressos.
- `missingFields` calculado via `expectedMissingFields()` e rejeição da lista fornecida pela IA.
- Ausência de inferência de BRL a partir de fornecedor, cidade, CNPJ ou idioma.

Os três novos percursos completos usam os PDFs e expectativas canônicos já existentes, com somente as respostas do transporte simuladas. Serviço, validação, extração de candidatos, classificação, assembler e motor C são reais:

| Fixture | Dados extraídos | Resultado em C |
| --- | --- | --- |
| A — `additional-known` | 4500 + frete adicional 200; prazo 4 | 4700 complete |
| B — `included` | 4570; frete incluído com amount null; prazo 7 | 4570 complete |
| C — `shipping-absent` | 4300; frete não informado; prazo null | 4300 partial |

Nenhum mock de IA fornece `missingFields` como autoridade. Fixtures de quote concluído continuam sendo usadas nos testes da fronteira de domínio/reuso, onde esse campo pertence ao contrato persistido.

## Configuração oficial e execução única

`vitest.config.ts` agora inclui:

```ts
include: [
  "tests/**/*.test.ts",
  "src/modules/extraction/tests/unit/**/*.test.ts",
]
```

Os diretórios são disjuntos. O script existente `vitest run tests/unit` também seleciona os caminhos B4, pois eles contêm `tests/unit`; isso foi confirmado pelos 32 caminhos únicos no JSON final. `package.json` e lockfile não foram alterados.

O config auxiliar B4 continua disponível para execução isolada, sem ser invocado pelo gate oficial. Nenhum teste foi capturado duas vezes.

Busca explícita por `.skip`, `.todo`, `.only` e `exclude:` em `tests/**`, `src/modules/extraction/tests/**` e `vitest.config.ts`: **nenhuma ocorrência**. Nenhum teste foi comentado, substituído por tautologia ou desativado.

## Preservação e limites

O manifesto `docs/validation-b4-1/preservation.json` registra os arquivos alterados/removidos/adicionados e os hashes dos arquivos originais preservados. Nenhuma alteração em código de produção, contracts, configuração de dependências, migrations, infraestrutura, prompts ou regras financeiras.

Nenhuma chamada real de IA foi feita. Testes com mocks demonstram isolamento do transporte, estrutura e invariantes determinísticas; não demonstram imunidade universal a prompt injection nem acurácia de interpretação de documentos reais. Nenhum bug de produção foi demonstrado por esta migração, portanto não foi necessário criar `b4-1-production-bug.md` nem deixar teste falhando.
