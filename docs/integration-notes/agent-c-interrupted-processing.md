# C.1 — Interrupção abrupta e política de recuperação

Estado: limitação operacional conhecida; nenhuma migration, scheduler, TTL ou takeover foi criado.

O pedido C.1 exige rejeitar toda comparação `processing` em `/process`. A idade de `updated_at` não autoriza presumir que uma execução morreu. Por isso, mesmo uma comparação antiga nesse estado retorna 409. Uma interrupção abrupta de todo o processo pode deixar o agregado em `processing`; esta entrega não afirma recuperar esse caso automaticamente. Definir uma política externa de expiração/cancelamento e comprovar fencing do agregado requer decisão do integrador, sem relaxar a regra atual unilateralmente.

Falhas capturadas seguem outra política, já implementada: C tenta gravar `failed` sobre `id + owner_id + processing + updated_at` da própria tentativa. Se essa gravação também falhar, registra apenas metadados seguros e preserva o erro original. O estado pode permanecer `processing` e a limitação acima continua explícita.

No retry autorizado de um agregado já `failed`, depois de adquirir sua nova tentativa, um documento que ficou em `processing` pode ser marcado `failed` condicionando seus três IDs, estado e token exatos. Só então B.3 inicia a nova extração. Conclusões ou falhas tardias que carregam o token anterior são rejeitadas. `completed` válido nunca participa dessa recuperação e é reutilizado sem modificação.

Os testes unitários exercitam o retry com documento órfão, recusa de token antigo e recusa de takeover de agregado `processing` independentemente de sua idade. Os testes reais de banco foram adicionados para CI, mas não executados neste ambiente sem Docker/Podman.
