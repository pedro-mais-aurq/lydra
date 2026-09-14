# B — Persistência de extrações

## Fronteira e autoridade

`ExtractionStore` vive exclusivamente em B. O adapter Supabase recebe o cliente backend existente,
já criado após autenticação. Não altera QuoteDocumentRepository, Auth, RLS, bucket, schema,
migrations, endpoints ou comparação agregada. O cliente privilegiado ignora RLS: SELECT e UPDATE
de B filtram sempre owner_id, comparison_id e id do documento. Os IDs devem vir de C depois
de requireOwner/getUser e da validação do vínculo da comparação, jamais do owner enviado pelo browser.

O download consulta novamente a metadata com esses três filtros, valida IDs retornados e compara
o path com o formato canônico construído pela Foundation. Só então usa download no bucket privado
quote-documents. Não recebe storagePath ou URL do chamador. Conferem-se tamanho real e assinatura.
Leituras inexistentes/cross-owner retornam COMPARISON_NOT_FOUND/404. Em uma transição condicional,
nenhuma linha afetada significa INVALID_COMPARISON_STATE/409; C já deve ter validado ownership
antes dessa transição. Nenhum write relaxa filtros para diferenciar a causa do conflito.

## Operações atômicas por documento

| Operação | Pré-condição no UPDATE | Campos gravados juntos |
|---|---|---|
| markProcessing | status em uploaded/failed e os três IDs | processing, extracted_data=null, extraction_schema_version=null, error_code=null |
| saveCompletedExtraction | processing, os três IDs e updated_at da tentativa | completed, extracted_data validado, extraction_schema_version=1, error_code=null |
| markFailed | processing, os três IDs e updated_at da tentativa | failed, extracted_data=null, extraction_schema_version=null, error_code canônico |

O timestamp updated_at, já mantido por trigger, é devolvido por markProcessing como token interno
de tentativa. Preservam-se sua string e precisão, sem conversão por Date. Um UPDATE posterior
exige o mesmo token. Duas tentativas de claim simultâneas não devem obter ambas a transição;
resultado atrasado ou falha atrasada não deve sobrescrever completed ou uma tentativa posterior.
Os testes usam o SDK real com transporte HTTP em memória para verificar filtros, payloads e
essa sequência. A atomicidade/concorrência efetiva do PostgreSQL e seus triggers ainda exige
execução em Supabase real; o mock não fornece essa comprovação.

O write final revalida o JSON na própria fronteira do adapter, inclusive se chamado diretamente.
O serviço só retorna sucesso após persistência confirmada. Se o UPDATE foi aplicado e a resposta
se perdeu, o serviço retorna erro; a próxima chamada pode validar e reutilizar o completed real.
Um markFailed posterior condicionado a processing não o substitui. Falha ao registrar failed
gera somente evento técnico e preserva o erro original; não há alegação de atomicidade entre
provider, Storage e PostgreSQL.

## Reuse e recuperação

Completed exige extraction_schema_version numérico 1, schema runtime fechado e semântica válida.
Caso contrário, falha com EXTRACTION_INVALID, sem provider call, reparo automático ou mutação.
JSONB não recebe confiança por ter vindo do banco. Uploaded/failed com dados/version incompatíveis
também não são silenciosamente limpos pelo serviço.

Processing existente retorna conflito, sem takeover, espera ativa ou chamada duplicada ao provider.
Uma interrupção do processo pode deixar o documento em processing; C/integrador deve definir sua
recuperação sob autoridade/lock do agregado. B não adiciona lease persistente, timeout no banco,
scheduler, fila ou migration. O token de updated_at protege transições de B, mas não substitui o
lock da comparação, não autoriza um owner e depende de a mesma disciplina ser respeitada pelos
outros escritores privilegiados.

## Limitações herdadas

Os relatórios A.1/A.2 permanecem válidos como registros históricos, inclusive a reprovação da
integração definitiva por ausência de Supabase real e CI comprovada. A.2 fechou os contratos de
ComparisonResult; B não os utiliza nem reabre essa decisão. Implementar B isoladamente, como
solicitado nesta rodada, não aprova a Foundation nem habilita produção automaticamente.
