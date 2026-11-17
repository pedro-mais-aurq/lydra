# Lydra

- /simulacao recalcula os orçamentos fictícios selecionados.
- /comparisons/manual compara valores reais informados pelo visitante.
- /comparisons/new usa a análise original de PDFs e imagens quando o projeto de dados e o provedor de extração estão conectados.
- /conta oferece cadastro e login por e-mail e Google.

## Comparação por documentos e contas

Conecte o projeto Supabase da Lydra com as migrações em supabase/migrations. Para o ambiente hospedado, defina SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY. Mantenha SUPABASE_SERVICE_ROLE_KEY e AI_API_KEY como segredos de servidor. As opções do provedor e dos modelos estão descritas em .env.example.

Habilite e-mail e, para preservar o acesso de visitantes do comparador original, sessões anônimas no projeto. Autorize a URL /auth/retorno de cada endereço publicado nos redirecionamentos do Supabase Auth. Configure o provedor Google nesse mesmo projeto. O URI de retorno cadastrado no Google é o callback do Supabase exibido no painel do provedor.

As avaliações ficam no armazenamento do site. Uma conta do ChatGPT pode registrar ou atualizar sua avaliação. A página exibe somente as notas, comentários e estatísticas agregadas.

## Publicação na Vercel

Selecione a pasta que contém package.json e vercel.json como Root Directory. O vercel.json seleciona o preset Next.js e executa npm run build:vercel. Use o Output Directory padrão do Next.js, .next. As variáveis do ambiente devem ser cadastradas no projeto da Vercel.

O comando npm run build continua gerando o pacote Vinext para ChatGPT Sites. O formulário de avaliações usa o D1 da publicação no ChatGPT Sites. Na Vercel, a seção indica onde as avaliações estão disponíveis.
