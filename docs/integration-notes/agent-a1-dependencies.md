# A.1 — Dependências e investigação individual

Audit inicial reproduzido do lockfile original: **10 entradas/pacotes** (2 critical, 5 high, 3 moderate). Uma entrada pode compartilhar advisories transitivos ou conter vários advisories; isso não representa dez CVEs distintos.

Audit final: **0 critical, 0 high, 0 moderate, 0 low**. Nenhum advisory foi ignorado, nenhum `npm audit fix --force` foi usado e não há exceção de vulnerabilidade remanescente.

| Pacote | Severidade inicial | Versões iniciais | Versões finais |
|---|---|---|---|
| `@next/eslint-plugin-next` | high | 14.2.35 | 15.5.25 |
| `@vitest/mocker` | moderate | 2.1.9 | 4.1.11 |
| `esbuild` | moderate | 0.21.5 | removido |
| `eslint-config-next` | high | 14.2.35 | 15.5.25 |
| `glob` | high | 10.3.10, 7.2.3 | 7.2.3 |
| `next` | critical | 14.2.35 | 15.5.25 |
| `postcss` | high | 8.4.31, 8.5.28 | 8.5.28 |
| `vite` | high | 5.4.21 | 8.3.0 |
| `vite-node` | moderate | 2.1.9 | removido |
| `vitest` | critical | 2.1.9 | 4.1.11 |

## @next/eslint-plugin-next — high

Atualizado junto ao eslint-config-next; eliminou a dependência vulnerável de glob 10 da cadeia Next.

Caminhos transitivos investigados: `glob`.

## @vitest/mocker — moderate

Atualizado com Vitest 4.1.11, fora da faixa do advisory de redirect mock/path traversal.

Caminhos transitivos investigados: `vite`.

| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | moderate | `>=2.1.0 <4.1.11` |

## esbuild — moderate

A cadeia vulnerável trazida por Vite 5 foi removida; o novo Vite usa Rolldown.


| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [esbuild enables any website to send any requests to the development server and read the response](https://github.com/advisories/GHSA-67mh-4wv8-2f99) | moderate | `<=0.24.2` |

## eslint-config-next — high

Alinhado ao Next 15.5.25; remove o caminho transitivo para glob vulnerável.

Caminhos transitivos investigados: `@next/eslint-plugin-next`.

## glob — high

glob 10 vulnerável removido da cadeia Next. O glob 7.2.3 do rimraf/ESLint já existia no baseline e não possui advisory neste audit; não foi feito downgrade manual.


| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [glob CLI: Command injection via -c/--cmd executes matches with shell:true](https://github.com/advisories/GHSA-5j98-mcp5-4vw2) | high | `>=10.2.0 <10.5.0` |

## next — critical

Upgrade necessário: 14.2.35 está nas faixas vulneráveis. 15.5.25 cobre as correções listadas; cookies e params adaptados para async, React 18.3.1 mantido dentro dos peers declarados e build/smoke passaram.

Caminhos transitivos investigados: `postcss`.

| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [Next.js self-hosted applications vulnerable to DoS via Image Optimizer remotePatterns configuration](https://github.com/advisories/GHSA-9g9p-9gw9-jx7f) | moderate | `>=10.0.0 <15.5.10` |
| [Next.js HTTP request deserialization can lead to DoS when using insecure React Server Components](https://github.com/advisories/GHSA-h25m-26qc-wcjf) | high | `>=13.0.0 <15.0.8` |
| [Next.js: HTTP request smuggling in rewrites](https://github.com/advisories/GHSA-ggv3-7p47-pfv8) | moderate | `>=9.5.0 <15.5.13` |
| [Next.js: Unbounded next/image disk cache growth can exhaust storage](https://github.com/advisories/GHSA-3x4c-7xq6-9pq8) | moderate | `>=10.0.0 <15.5.14` |
| [Next.js has a Denial of Service with Server Components](https://github.com/advisories/GHSA-q4gf-8mx6-v5v3) | high | `>=13.0.0 <15.5.15` |
| [Next.js Vulnerable to Denial of Service with Server Components](https://github.com/advisories/GHSA-8h8q-6873-q5fj) | high | `>=13.0.0 <15.5.16` |
| [Next.js's Middleware / Proxy redirects can be cache-poisoned](https://github.com/advisories/GHSA-3g8h-86w9-wvmq) | low | `>=12.2.0 <15.5.16` |
| [Next.js vulnerable to cross-site scripting in App Router applications using CSP nonces](https://github.com/advisories/GHSA-ffhc-5mcf-pf4q) | moderate | `>=13.4.0 <15.5.16` |
| [Next.js vulnerable to cache poisoning via collisions in React Server Component cache-busting](https://github.com/advisories/GHSA-vfv6-92ff-j949) | low | `>=13.4.6 <15.5.16` |
| [Next.js has cross-site scripting in beforeInteractive scripts with untrusted input](https://github.com/advisories/GHSA-gx5p-jg67-6x7h) | moderate | `>=13.0.0 <15.5.16` |
| [Next.js has a Denial of Service in the Image Optimization API](https://github.com/advisories/GHSA-h64f-5h5j-jqjh) | moderate | `>=10.0.0 <15.5.16` |
| [Next.js vulnerable to server-side request forgery in applications using WebSocket upgrades](https://github.com/advisories/GHSA-c4j6-fc7j-m34r) | high | `>=13.4.13 <15.5.16` |
| [Next.js vulnerable to cache poisoning in React Server Component responses](https://github.com/advisories/GHSA-wfc6-r584-vfw7) | moderate | `>=14.2.0 <15.5.16` |
| [Next.js has a Middleware / Proxy bypass in Pages Router applications using i18n](https://github.com/advisories/GHSA-36qx-fr4f-26g5) | high | `>=12.2.0 <15.5.16` |
| [Next.js: Denial of Service in App Router using Server Actions](https://github.com/advisories/GHSA-m99w-x7hq-7vfj) | high | `>=13.0.0 <15.5.21` |
| [Next.js: Server-Side Request Forgery in Server Actions on custom servers](https://github.com/advisories/GHSA-89xv-2m56-2m9x) | high | `>=14.1.1 <15.5.21` |
| [Next.js: Cache confusion of response bodies for requests with bodies](https://github.com/advisories/GHSA-68g3-v927-f742) | moderate | `>=13.0.0 <15.5.21` |
| [Next.js: Cache confusion of response bodies for requests with bodies containing invalid UTF-8 byte sequences](https://github.com/advisories/GHSA-4633-3j49-mh5q) | moderate | `>=13.0.0 <15.5.21` |
| [Next.js: Unbounded Server Action payload in Edge runtime](https://github.com/advisories/GHSA-4c39-4ccg-62r3) | moderate | `>=13.0.0 <15.5.21` |
| [Next.js: Server-Side Request Forgery in rewrites via attacker-controlled destination hostname](https://github.com/advisories/GHSA-p9j2-gv94-2wf4) | high | `>=12.0.0 <15.5.21` |
| [Next.js: Unauthenticated disclosure of internal Server Function endpoints](https://github.com/advisories/GHSA-955p-x3mx-jcvp) | moderate | `>=13.0.0 <15.5.21` |
| [Next.js: Unauthenticated Remote Code Execution on windows-hosted servers](https://github.com/advisories/GHSA-p293-qw3h-jr36) | critical | `>=13.4.0 <15.5.24` |
| [Next.js: Unauthenticated Remote Code Execution in Image Optimization API when AVIF files are used](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) | critical | `>=10.0.0 <15.5.24` |

## postcss — high

Override explícito para 8.5.28, mesma major 8. Next 15 ainda declarava 8.4.31. O override aplica patch real, não oculta advisory; build com esse pacote passou.


| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [PostCSS has XSS via Unescaped </style> in its CSS Stringify Output](https://github.com/advisories/GHSA-qx2v-qp2m-jg93) | moderate | `<8.5.10` |
| [PostCSS: Arbitrary file read and information disclosure via attacker-controlled sourceMappingURL in CSS comments](https://github.com/advisories/GHSA-6g55-p6wh-862q) | high | `<=8.5.11` |
| [PostCSS: incomplete fix of GHSA-6g55-p6wh-862q — attacker-controlled sourceMappingURL reads arbitrary .map files when `from` is unset](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp) | moderate | `<=8.5.22` |
| [PostCSS: Path Traversal in Previous Source Map Auto-Loading (sourceMappingURL) leads to Arbitrary .map File Disclosure](https://github.com/advisories/GHSA-r28c-9q8g-f849) | high | `<=8.5.17` |

## vite — high

Atualizado indiretamente com Vitest para 8.3.0, fora das faixas afetadas e sem a cadeia esbuild vulnerável.

Caminhos transitivos investigados: `esbuild`.

| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [Vite Vulnerable to Path Traversal in Optimized Deps `.map` Handling](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) | moderate | `<=6.4.1` |
| [launch-editor: NTLMv2 hash disclosure via UNC path handling on Windows](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) | moderate | `<=6.4.2` |
| [vite: `server.fs.deny` bypass on Windows alternate paths](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) | high | `<=6.4.2` |

## vite-node — moderate

Removido pela migração do Vitest; sem nó instalado remanescente.

Caminhos transitivos investigados: `vite`.

## vitest — critical

2.1.9 substituído por 4.1.11, cobrindo execução/leitura arbitrária do servidor UI e redirect mock. A suíte foi preservada e ampliada; 58 testes passaram.

Caminhos transitivos investigados: `@vitest/mocker`, `vite`, `vite-node`.

| Advisory | Severidade | Faixa afetada registrada no audit inicial |
|---|---|---|
| [When Vitest UI server is listening, arbitrary file can be read and executed](https://github.com/advisories/GHSA-5xrq-8626-4rwp) | critical | `<3.2.6` |
| [Vitest: Path Traversal / Arbitrary File Read via @vitest/mocker Redirect Mock](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) | moderate | `>=2.1.0 <4.1.11` |

## Reprodução e evidências

`docs/validation/audit-before.json` e `audit-after.json` contêm os relatórios integrais do npm. O lockfile final foi instalado de novo com `npm ci`, e audit/lint/typecheck/unit/build/smoke foram executados após os upgrades. O gate de integração permanece reprovado pela ausência de Supabase real neste ambiente, independentemente do audit zerado.

Versões diretas fixadas. Node >=22.12 e <25. Vitest 4.1.11 e Next 15.5.25 foram escolhidos como linhas corrigidas compatíveis, evitando migrar sem necessidade para Vitest 5/Next 16.

`next-env.d.ts` é gerado pelo Next e fica fora do lint; o código-fonte continua sob as regras existentes. `next typegen` antecede `tsc --noEmit`, garantindo tipos de rota em checkout limpo.
