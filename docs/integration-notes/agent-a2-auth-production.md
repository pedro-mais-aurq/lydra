# A.2 — Auth, SSR e operação de produção

## Correção versionada

`@supabase/ssr` foi fixado em 0.12.7; Supabase JS 2.116.0 e Next 15.5.25 permanecem.
O peer do SSR exige Supabase JS ^2.114.0; a versão existente é compatível.
O lockfile mudou via npm: SSR 0.5.2 → 0.12.7, cookie 0.7.2 → 1.1.1,
remoção de @types/cookie 0.6.0. Nenhum outro pacote mudou de versão.

O [changelog oficial](https://github.com/supabase/ssr/blob/main/CHANGELOG.md) registra validação
JSON de cookies chunked e propagação dos headers de cache em `setAll`. O middleware utiliza
os headers fornecidos pelo SSR e mantém no-store também em chamadas seguintes de setAll.
O arquivo foi movido da raiz para `src/middleware.ts`, no mesmo nível de `src/app`,
conforme a [convenção do Next 15](https://nextjs.org/docs/15/app/api-reference/file-conventions/middleware).
O build anterior não registrava middleware; o smoke agora verifica sua presença no manifesto. Os Route Handlers já retornam `Cache-Control: private, no-store`.
A arquitetura Auth anônimo → getUser → owner → backend privilegiado está preservada.

`resolveUser` trata ausência e códigos conhecidos de sessão inválida como não autenticado.
Erros de transporte/5xx/429 viram 503 INTERNAL_ERROR retryable; erros desconhecidos preservam
um 500 controlado. Falhas reais não viram sessões anônimas silenciosas. Respostas/logs da aplicação
não incluem cookies, tokens, secrets ou conteúdo de documentos. Os testes de parser usam o SSR real;
os de classificação injetam apenas erros tipados no limite de Auth.

Em `supabase/config.toml`, anonymous sign-ins e o signup global necessário continuam habilitados.
Signup de email está desligado; SMS, OAuth, third-party e linking já estavam desligados e permanecem.
O limite `anonymous_users = 1000` é SOMENTE do Supabase local descartável, para fixtures de testes.
Nunca copiar esse limite para produção.

## Passos hospedados obrigatórios antes de liberar o MVP

Nenhum projeto hospedado Lydra foi identificado nesta execução. Os passos abaixo estão preparados,
mas **não aplicados nem verificados em produção**.

1. No projeto correto, Authentication → Providers/Sign In: habilitar Anonymous; desabilitar Email
   (inclui login por senha e magic link), Phone e provedores OAuth não usados. Manter signup global
   necessário a anonymous e manter linking manual desligado. Verificar signInAnonymously com sucesso
   e tentativas email/OTP/OAuth rejeitadas.
2. Authentication → Rate Limits: configurar anonymous sign-ins em **30 por hora por IP**,
   sem o aumento local para 1000. Observar 429, criação de auth.users e crescimento de Storage/DB.
   Não executar teste de inundação em produção; validar limites em staging descartável.
3. Authentication → Bot and Abuse Protection: preparar Turnstile (ou hCaptcha), domínio autorizado,
   site key pública e secret exclusivamente na configuração de Auth. Ativar a proteção junto com
   o envio de `captchaToken` na iniciação de sessão da futura UI D:

   ```ts
   await supabase.auth.signInAnonymously({ options: { captchaToken } });
   ```

   `captchaToken` vem do desafio real do provedor; não usar token fixo nem secret no browser.
   A Foundation não possui a UI D/site key/secret, portanto não ativa CAPTCHA local nem cria widget.
   Ativar CAPTCHA sem fornecer o token quebra a entrada anônima. Rate limiting é obrigatório
   desde o primeiro ambiente público; proteção CAPTCHA deve ser validada antes da abertura pública.
4. Conferir Security e Performance Advisors após aplicar migrations no projeto correto e guardar
   resultados com data/revisão. Verificar RLS, grants, policies e funções, não apenas npm audit.
5. Configurar alertas operacionais para criação de sessões, taxa de upload e crescimento de DB/Storage.
   Spam de sessões contorna um limite por owner: cada nova identidade pode criar comparações e ocupar
   Storage. O teto de quatro documentos/10 MiB não é uma quota global. O limite por IP também tem
   limites frente a abuso distribuído. Não há billing, motor de quotas ou limpeza automática nesta A.
   Definir retenção posteriormente com decisão explícita; não apagar sessões/dados do MVP automaticamente.

Fontes: [Auth anônimo](https://supabase.com/docs/guides/auth/auth-anonymous)
(documenta limite por IP e recomendação de CAPTCHA),
[CAPTCHA](https://supabase.com/docs/guides/auth/auth-captcha)
(configuração e token). Configurações de Dashboard devem ser registradas como evidência operacional,
não presumidas a partir do config.toml local.
