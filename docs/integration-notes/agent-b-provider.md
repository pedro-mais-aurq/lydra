# B — Provider, configuração e fronteira factual

## Implementação

OpenAI Responses API, via fetch nativo de Node, isolada em `providers/openai.provider.ts`.
Nenhum SDK ou dependência npm foi adicionado. Produção cria somente o provider configurado;
os mocks existem exclusivamente nos testes e são injetados explicitamente.

O endpoint HTTPS é fixo. PDF usa `input_file` com data URI base64 e nome interno constante
`document.pdf`; PNG/JPEG/WebP usam `input_image`. Não há Files API, URL pública/assinada,
arquivo intermediário, busca, ferramenta externa, histórico, outro documento ou segundo LLM.
O limite local continua 10 MiB, com assinatura validada pela função existente da Foundation.
Uma assinatura válida não certifica a integridade completa de um PDF/imagem; o parser do
provider ainda pode recusar arquivos corrompidos, criptografados ou modalidades incompatíveis.

O corpo solicita `text.format.type=json_schema`, `strict=true`, `store=false`, `stream=false`
e `tools=[]`. O JSON Schema é derivado do schema Zod canônico, sem DTO ou schema de transporte
mantido manualmente. O conversor aceita apenas os nós usados pelo contrato atual e falha em
tipos futuros não suportados. Todos os campos são required; null permanece permitido.

## Configuração server-side

Configure no ambiente privado do servidor ou no `.env.local` local, que não deve ser commitado:

| Variável | Regra |
|---|---|
| AI_PROVIDER | Obrigatória; somente `openai` está implementado |
| AI_MODEL | Obrigatória, sem default; ID real escolhido pelo operador na documentação/conta |
| AI_API_KEY | Obrigatória; segredo server-side, sem default |
| AI_TIMEOUT_MS | Opcional; 60000 por padrão; inteiro de 1 a 300000 |
| AI_MAX_OUTPUT_TOKENS | Opcional; 12000 por padrão; inteiro de 1 a 32768 |

O modelo configurado precisa suportar Responses, Structured Outputs e as modalidades utilizadas,
incluindo PDF e imagens para o fluxo completo. Não há escolha automática nem tentativa de outro
modelo quando o configurado falha. IDs usados em testes são sentinelas de um transporte fake,
sem qualquer chamada externa. A ausência de configuração falha explicitamente e não vira mock.

Nenhuma variável tem prefixo NEXT_PUBLIC_. Todas as entradas executáveis de B importam
`server-only`. Configuração e provider são construídos apenas quando uma nova extração é necessária;
reuse de completed validado funciona mesmo sem credenciais de IA.

## Resposta e erros

O transporte limita a resposta HTTP a 1 MiB e usa AbortController para o timeout, inclusive
durante leitura do corpo. Há uma única tentativa; nenhum retry interno ou fallback.
Somente uma mensagem assistant completed, com um output_text JSON, é aceita.
Metadados de protocolo são descartados; blocos de reasoning são ignorados.
Recusas, truncamento, mensagens adicionais, comandos de ferramentas, JSON inválido e propriedades
inventadas nunca chegam ao domínio como extrações válidas. O retorno do provider continua unknown.

| Condição | Código | Retryable |
|---|---|---|
| Rede, timeout, HTTP 408, HTTP 5xx | EXTRACTION_PROVIDER_ERROR | true |
| HTTP 429 com sinal de rate limit/transitório (`rate_limit_exceeded`, `temporarily_unavailable` etc.), ou sem sinal reconhecido | EXTRACTION_PROVIDER_ERROR | true |
| HTTP 429 com sinal de quota/crédito/billing esgotado (`insufficient_quota`, `credit_balance_exhausted`, `organization_spend_limit_exceeded` e equivalentes) | EXTRACTION_PROVIDER_ERROR | false |
| HTTP 4xx restante, configuração inválida ou status failed sem causa conhecida | EXTRACTION_PROVIDER_ERROR | false |
| Recusa, resposta incompleta, JSON/schema/semântica inválidos, corpo acima do limite | EXTRACTION_INVALID | false |
| MIME/assinatura/tamanho incompatíveis | EXTRACTION_UNSUPPORTED_INPUT | false |

`error.code` e `error.type` do provider são avaliados independentemente como sinais (nunca um
mascarando o outro); um sinal persistente de quota/billing sempre prevalece sobre um sinal
transitório presente no mesmo erro. Ver `provider-failure.ts` para a lista completa de códigos
reconhecidos e a função de classificação.

Nenhuma resposta de erro do provider é anexada a mensagens, details, logs ou causa de exceção.
Erros atravessando o port são reconstruídos com mensagens fixas e códigos canônicos.

## Evidence-first e limites comprováveis

O sistema pede citações literais, fatos críticos associados a evidence e evidência de cada item.
O validador checa presença, página positiva inteira ou null, trecho útil, coerência lexical do
valor com o trecho e vínculo de número ao rótulo de total/prazo. Não soma itens nem converte
semanas, moedas ou unidades. UNKNOWN e null jamais são promovidos a valores conhecidos.
Trechos e valores não são reescritos pelo validador.

Os reconhecedores são conservadores para propostas em português e alguns rótulos em inglês.
Outros idiomas, valores por extenso, layouts que separam rótulo e valor, formatos numéricos
ambíguos e descrições parafraseadas podem causar EXTRACTION_INVALID. A rejeição é explícita;
não há fabricação de um valor para passar a validação. BRL exige um marcador em uma citação
existente; currency não possui slot próprio de evidence no DTO congelado. Moeda mista é rejeitada
se o provider a declarar BRL. UNKNOWN não é alterado mesmo diante de um marcador.

Não existe OCR/transcrição independente. O mesmo provider lê o documento e propõe citações.
Logo, schema + coerência textual não comprovam que toda citação foi realmente impressa nem que
nenhuma cláusula foi omitida. Um fato e uma citação conjuntamente fabricados, mas plausíveis,
podem escapar aos controles determinísticos. Isso também limita a verificação de observations,
cujo contrato não inclui EvidenceRef. Essa limitação não é escondida por confidence score ou
um segundo LLM. É necessária avaliação live com documentos e revisão de evidências antes do piloto.

## Prompt injection e privacidade

As instruções de sistema são constantes. Documento e seus comandos ficam no conteúdo multimodal
do papel user, rotulado UNTRUSTED DOCUMENT CONTENT. Nomes de arquivo, URLs, IDs e conteúdo do
documento nunca são interpolados no system prompt. Não são oferecidos tools ou acesso a segredos.
Comandos documentais para trocar valores, ignorar o schema, revelar prompts ou buscar dados
externos são explicitamente proibidos. Padrões conhecidos de comandos usados como evidência e
recomendações em observations são rejeitados como defesa adicional, sem alegar detecção universal.

As fixtures adversariais contêm dois ataques concretos: substituição dos valores comerciais e
falsificação de papéis/pedido de exfiltração. Os testes demonstram segregação do payload e rejeição
de respostas adversariais especificadas; mocks não medem a resistência de um modelo real.

Não se persistem resposta bruta, prompt, bytes duplicados ou diagnóstico com conteúdo sensível.
`store=false` desativa o armazenamento do objeto Response; não é uma declaração de retenção zero
para todos os mecanismos do provider. Revisar retenção/configuração da conta antes de documentos
sensíveis, conforme o contrato do projeto. O tráfego live não foi executado nesta entrega.

## Documentação oficial consultada em 12/09/2026

- [Entradas de arquivos/PDF](https://developers.openai.com/api/docs/guides/file-inputs): conteúdo multimodal e data URI.
- [Imagens e visão](https://developers.openai.com/api/docs/guides/images-vision): input_image e base64.
- [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs): endpoint, JSON Schema fechado, recusas e respostas incompletas.
- [Estado de conversação](https://developers.openai.com/api/docs/guides/conversation-state): opção store=false e separação entre chamadas.
