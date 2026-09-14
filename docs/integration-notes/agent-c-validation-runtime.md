# C.1 — Validações que exigem infraestrutura

Estado: pendente de execução real; não bloqueia a aprovação isolada do código da C.

Nesta rodada não há Docker nem Podman. O comando de status do Supabase local confirmou a ausência do runtime de containers. Não foram executados `test:integration`, `test:security` ou `test:smoke:security`; não há comprovação nova de PostgreSQL/RLS/Storage/Auth reais, upload versus processamento concorrente ou fluxo HTTP autenticado. O workflow remoto de CI também não foi executado.

`tests/integration/comparison-process.test.ts` adiciona seis casos sem skip, usando os helpers e gates existentes da A.2: aquisição concorrente, upload versus aquisição, todos previamente extraídos, cross-owner, token obsoleto de agregado e B.3 + Storage privado + persistência + retry com provider de teste. O provider de teste é limitado a esse teste; banco, Auth e Storage são reais quando a suíte roda.

Para validar em infraestrutura local descartável:

```bash
npm ci
npx --no-install supabase start -x studio,postgres-meta,logflare,vector,realtime,edge-runtime,mailpit,imgproxy,supavisor
npm run test:security
npm run build
npm run test:smoke
node scripts/smoke-comparison.mjs
npm run test:smoke:security
```

O script `test:security` existente aplica o reset local, validações SQL e executa as suítes de integração com as credenciais locais obtidas pelo helper. Não altera o CI nem aceita banco remoto para fixtures. Uma chamada live ao provider exige configuração real e ainda não foi executada; os testes de B.3 usam transport/provider de teste e não comprovam qualidade de extração em documentos reais.

As evidências locais efetivamente executadas estão em `docs/validation-c1/gates.json`. Aprovação isolada não significa produção aprovada, segurança E2E comprovada ou CI remoto verde.
