# A.2 — Segurança e reprodução dos gates

A nova migration `20260912192256_a2_storage_read_guard.sql` adiciona SELECT RESTRICTIVE
para anon/authenticated em storage.objects: quote-documents exige primeiro segmento igual a auth.uid().
Outros buckets preservam suas políticas; service_role preserva bypass RLS apenas no backend.
Políticas permissivas são combinadas por OR, mas a restritiva continua necessária por AND:
[PostgreSQL CREATE POLICY](https://www.postgresql.org/docs/17/sql-createpolicy.html).
A policy owner-only anterior continua concedendo a leitura legítima. Não há public URL.

As dez migrations anteriores são preservadas byte a byte; a cadeia completa tem onze migrations.
O reset apaga a prova anterior e só grava uma nova após sucesso do reset, assertions SQL e conferência
de todas as versões. Não há skip silencioso, repair, alteração manual ou migration omitida.
O teste de policy drift cria USING(true) dentro de uma transação e verifica leitura como cada owner;
rollback impede que a policy de teste permaneça ou se torne visível a outras conexões.

## Comandos em ambiente com Docker funcional

```sh
npm ci
npm run audit:dependencies
npm run lint
npm run typecheck
npm run test:unit
npx --no-install supabase start -x studio,postgres-meta,logflare,vector,realtime,edge-runtime,mailpit,imgproxy,supavisor
npm run test:security
npm run build
npm run test:smoke
npm run test:smoke:security
```

`test:security` executa `supabase db reset --local --no-seed --yes`, assertions SQL e Vitest real.
`test:smoke:security` obtém as credenciais do Supabase local como dados e testa o build via HTTP,
inclusive SSR cookies reais de duas sessões anônimas, ownership, cross-owner 404 e upload.
Nenhuma credencial é impressa. Os fixtures são locais e removidos ao final.

A suíte mantém nove mutações Data API proibidas, FKs compostas, concorrência iniciada com três
documentos, imutabilidade da identidade e restrições do bucket. Há uploads reais de PDF/PNG/JPEG/WebP,
rejeições de seis inputs inválidos e corrida de estado após Storage que força falha DB e remoção.
Os testes unitários mantêm a compensação com remoção bem-sucedida, erro retornado e erro lançado,
incluindo registro operacional. Não removem testes de A.1.

## Limites da evidência desta entrega

Consulte `docs/A2-VALIDATION-REPORT.md` e `docs/validation-a2/` para resultados reais.
Os logs de `docs/validation/` e relatório A.1 são históricos, não evidência de aprovação da A.2.
Sem Docker/Supabase funcional, reset e integração falham explicitamente.
Inspeção local/db lint não equivalem a Security/Performance Advisors hospedados.
A existência de `.github/workflows/ci.yml` não comprova execução no GitHub Actions.
Nenhum dos projetos remotos disponíveis foi identificado como Lydra e nenhum foi alterado.
