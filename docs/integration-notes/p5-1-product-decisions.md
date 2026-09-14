# P5.1 — Decisões antes da integração

- C1+B3 é a baseline. A2/B3 coincidem byte a byte com C exceto repositories estendidos por C; artefato tsbuildinfo de B é descartado.
- D fornece apenas 10 arquivos de apresentação/assets. Todos os conflitos não visuais ficam com C. Manifesto completo em ../validation-p5-1/merge-manifest.json.
- GET detail retorna data com campos da comparação e documents lado a lado; /process é síncrono e retorna comparação sem documents. Página processing lê GET e só inicia POST por ação explícita. Navegação/refresh nunca dispara processamento.
- comparison.errorCode não preserva retryable. A UI conserva apenas code/retryable/requestId no sessionStorage da aba, associado a id e updatedAt retornados por GET após a falha. O GET continua autoridade: registro antigo, divergente ou ausente não autoriza retry. Não há alteração de schema/API nem inferência de retryable pelo código. Outra aba sem esse contexto informa a limitação.
- Criação/upload não são idempotentes. Não repetir automaticamente mutações após perda de resposta. Em falha de upload, parar o lote, manter sucessos e consultar estado por GET; o usuário pode ver os documentos confirmados antes de qualquer processamento explícito.
- Uma interrupção abrupta pode deixar processing persistente, conforme limitação congelada de C. Polling limitado para sem alterar status e oferece somente consultar novamente.
- Bootstrap anônimo usa cliente SSR/browser existente e promise compartilhada contra Strict Mode e chamadas concorrentes; getSession é somente UX. Autorização permanece requireOwner/getUser no servidor.
- CAPTCHA configurado no Supabase exige token real. Integração local desta rodada não ativa proteção nem altera settings remotos; falha de Auth é explícita. Abertura pública continua dependente dos requisitos da nota A2.
- Nenhum domínio congelado precisa ser alterado.

## Ajuste localizado do runner de testes
O overlay sem integração passou com 375 testes. Ao adicionar testes que renderizam os componentes TSX reais, Vitest/Vite herdou `jsx: preserve` do Next e falhou antes de coletar os testes (log product-tests.log). Ajuste necessário: configurar somente o transform JSX automático em `vitest.config.ts`. Include, ambiente Node, timeouts, setup e aliases permanecem; package.json, lockfile e CI ficam byte a byte iguais a C. Não há troca de versão nem enfraquecimento de gate.
