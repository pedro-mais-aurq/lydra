> Current delivery: A.2. See `A2-VALIDATION-REPORT.md` and `integration-notes/agent-a2-contracts.md`. Earlier validation notes below are historical.

# Lydra — Foundation A.1

Hardening da Parte A. Mantém as páginas e os endpoints existentes. Não implementa B/C/D/E, processamento, extração, ranking, feedback ou histórico.

## Autoridade e autenticação

Browser → Supabase Auth anônimo/session → Next.js API → `requireOwner(auth.getUser())` → validação de input/owner → cliente privilegiado `server-only` → repositories/DB/Storage.

`createSupabaseServerClient()` agora é assíncrono e serve à sessão. `createSupabaseBackendClient()` usa `SUPABASE_SERVICE_ROLE_KEY` exclusivamente no servidor, sem cookies nem JWT do usuário. As rotas só criam o cliente privilegiado depois de validar a sessão. O papel `service_role` ignora RLS: cada consulta dos repositories inclui owner derivado da sessão. Nunca use owner fornecido pelo browser.

`authenticated` tem apenas SELECT owner-only nas três tabelas. INSERT/UPDATE/DELETE são negados mesmo sobre os próprios dados. Os triggers e as FKs continuam impondo integridade aos writes do backend. As credenciais públicas continuam suficientes para Auth; a UI deve usar os endpoints para operações de domínio.

## Setup

Node.js >=22.12 e <25; Docker Desktop/Engine ou Podman funcionando; `npm ci`. Supabase CLI 2.117.0 está fixado no lockfile.

Variáveis em `.env.local`, seguindo `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (obrigatória para o backend; nunca pública)

O arquivo `supabase/config.toml` configura um projeto local descartável `lydra-a1-test`, Auth anônimo e limites locais de testes. A taxa aumentada de criação de usuários é somente para essa instância local; não é recomendação de configuração de produção.

```bash
npm ci
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:unit
npx --no-install supabase start -x studio,postgres-meta,logflare,vector,realtime,edge-runtime,mailpit,imgproxy,supavisor
npm run test:security
npm run build
npm run test:smoke
```

`test:security` executa `supabase db reset --local --no-seed --yes`, asserções SQL e integração real. É destrutivo apenas para o banco **local descartável**. Os scripts não aceitam conexão remota. Sem Docker/Supabase, falham; não há retorno antecipado que transforme teste não executado em verde.

`npm test` inclui unitários e integração. Executá-lo sem as três variáveis obrigatórias faz a integração falhar. `test:unit` é uma seleção explícita de testes sem infraestrutura, não valida RLS/Storage.

O CI real está em `.github/workflows/ci.yml`. Publicar esse arquivo não comprova execução do GitHub Actions: o estado observado nesta entrega está no relatório `docs/A1-VALIDATION-REPORT.md`.

## Migrations incrementais

As oito migrations originais permanecem byte a byte. As duas novas migrations revogam autoridade do browser, restringem o bucket, impedem alterações da identidade do upload, reforçam o limite concorrente e migram `extraction_schema_version` de text para integer.

A migração aborta e reverte sua transação se encontrar dados antigos incompatíveis (por exemplo, >4 documentos, path inválido, versão inválida). Ela não remove documentos nem fabrica extrações. A metadata `file_name` antiga passa a usar o último segmento do path já sanitizado. Consulte `agent-a1-security-handoff.md` antes de integrar banco já usado.

## Upload

Bucket `quote-documents` privado, 10 MiB, PDF/PNG/JPEG/WebP. Browser não pode inserir, substituir, mover, copiar ou excluir objetos. Leitura owner-only é preservada. Nenhuma rota entrega public URL.

Path: `<ownerId>/<comparisonId>/<documentId>/<sanitizedFileName>`. A metadata guarda o mesmo filename. A API valida UUID, estado draft, quantidade, tamanho, MIME/extensão e assinatura; limita também o corpo multipart mesmo sem Content-Length. Assinatura não substitui parsing seguro futuro nem é verificação antivírus/OCR.

O insert no banco revalida draft e serializa uploads por escrita na linha pai. Identidade do documento é imutável, fechando a transferência para outra comparação. Se DB falhar após upload, a API tenta remover o objeto e registra sucesso/falha da limpeza sem substituir o erro original.

## Contratos e limites

Tipos compartilhados e códigos de erro vivem em `src/contracts`. Versão da extração é `1 | null` no TypeScript e integer/null no PostgreSQL, sem conversão textual nos repositories. `extracted_data` e sua versão devem ser persistidos juntos. A.1 não valida semanticamente a saída da IA e não oferece endpoints para gravá-la.

`ComparisonResult` preserva os campos externos descritos pelo contrato. O anexo não congela os campos internos de `suppliers`/`normalizedItems`; isso está registrado em `agent-a1-contracts.md`, sem inventar um DTO financeiro.
