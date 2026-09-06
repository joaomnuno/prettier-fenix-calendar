# Horário — Fénix, à tua maneira

Editor de horários do Instituto Superior Técnico. Interface em português, com pré-visualização, estilos de impressão e exportação PDF/PNG em A4 horizontal a 300 dpi.

## O que está implementado

- Exemplo transcrito do horário fornecido, claramente identificado como demonstração.
- Cores por disciplina consistentes entre aulas teóricas, laboratoriais e de problemas.
- Estilos suave, contorno e monocromático; visibilidade por disciplina, salas, tipos, semanas e fim de semana.
- Intervalo de datas, escolha de semana, lista de ocorrências e alertas de sobreposição.
- PDF com imagem incorporada a 300 dpi; PNG de 3508 × 2480 píxeis. O PDF é rasterizado, não texto vetorial selecionável.
- Importação local da resposta JSON oficial, sem upload do ficheiro.
- Ligação OAuth ao serviço Fénix, troca de código no servidor e importação automática das aulas depois da ligação.

## Estado da integração real

**Não configurada nem testada com uma conta Fénix real.** É necessário registar a aplicação e configurar os segredos antes de a autenticação/importação real funcionar. A interface não simula uma ligação bem-sucedida.

A aplicação é autoalojada em contentor e a ligação ao Fénix é a própria sessão: não existe plataforma a montante a injetar uma identidade. Quem completa o fluxo OAuth recebe um cookie de ligação cifrado e só esse cookie autoriza a importação. Qualquer pessoa com acesso ao domínio pode iniciar a ligação com a sua própria conta Fénix; se o acesso tiver de ser restringido, isso é feito à frente da aplicação (proxy autenticado, rede privada ou lista de acesso), não dentro dela.

## Configuração do Fénix

1. No Fénix, abrir Pessoal → Gerir aplicações. Se a opção não estiver disponível, solicitar o perfil DEVELOPER ao suporte.
2. Registar a aplicação para acesso **apenas ao calendário de aulas** (não pagamentos, notas ou informação de perfil desnecessária).
3. Registar exatamente a URL de callback do domínio escolhido:
   https://SEU-DOMINIO/api/fenix/callback
4. Configurar as variáveis de ambiente de runtime, usando campos secretos para FENIX_CLIENT_SECRET e FENIX_COOKIE_SECRET:
   - APP_ORIGIN: origem https pública. A barra final é tolerada.
   - FENIX_CLIENT_ID
   - FENIX_CLIENT_SECRET
   - FENIX_COOKIE_SECRET: valor aleatório com pelo menos 32 caracteres.
   - FENIX_REDIRECT_URI (opcional): a URL de redirecionamento é sempre derivada de APP_ORIGIN. Definir esta variável apenas para afirmar o valor registado no Fénix — se deixar de coincidir, a aplicação declara-se não configurada em vez de enviar quem a usa para uma autorização recusada.
5. Publicar a versão com a configuração e validar autorização, recusa, importação, expiração e logout com uma conta real.

Nada está fixado no código: o domínio vem de APP_ORIGIN e a URL de redirecionamento é `${APP_ORIGIN}/api/fenix/callback`. Se o domínio mudar, atualizar APP_ORIGIN e o registo no Fénix. Se APP_ORIGIN não for https, a aplicação declara-se não configurada e recusa iniciar o fluxo — os cookies `__Host-` só existem sobre https.

A URL exata a registar no Fénix está sempre visível na própria aplicação, em "Falta ativar a ligação ao Fénix" → "Informação para configurar", e em `GET /api/fenix/status`.

Quando `configured` é `false`, o log do servidor nomeia a variável em falta ou inválida (`[fenix] Ligação ao Fénix não configurada:`). O diagnóstico fica só no log, porque `/api/fenix/status` é público e não deve descrever a instalação a quem passa.

O callback exige correspondência entre o state devolvido pelo Fénix e o state selado no cookie emitido a este browser. Se a instalação do Fénix não devolver state, a operação falha de forma segura: confirmar o suporte com o administrador, nunca remover a validação. A documentação antiga não explicita esse parâmetro; este ponto faz parte do teste de integração pendente.

## Segurança e privacidade

- Nunca recolhe a palavra-passe do Fénix.
- Client secret e access token são usados apenas no servidor.
- Ligação guardada num cookie cifrado AES-GCM, HttpOnly, Secure, SameSite=Lax, com prefixo `__Host-`, máximo uma hora. O cookie é a identidade: não é legível nem forjável pelo cliente e só o servidor tem a chave.
- Não conserva refresh tokens; após expirar, é necessária nova autorização.
- OAuth state aleatório com validade de dez minutos. Nenhum cookie é aceite sem configuração.
- A API do Fénix usa access_token em query segundo a documentação oficial; pedidos são servidor-a-servidor e não são registados pela aplicação.
- Respostas privadas e redirecionamentos usam no-store e no-referrer.
- Logout requer validação de origem; elimina os cookies e limpa os dados importados na interface. Não revoga a aplicação no Fénix — revogação é feita no portal oficial.
- Não existem base de dados nem armazenamento de horários no servidor. Horários e ajustes ficam em memória no navegador. O contentor não tem volumes nem estado gravável.
- Nenhum cabeçalho de identidade vindo do cliente é aceite. Os redirecionamentos internos usam caminhos relativos, pelo que Host e X-Forwarded-Host não influenciam o destino.

## Interpretação dos horários

Endpoint: /api/fenix/v1/person/calendar/classes?format=json&lang=pt-PT

O parser aceita o formato documentado dd/MM/yyyy HH:mm e conserva as horas locais de Lisboa sem as converter pelo fuso do navegador. Agrupa ocorrências por disciplina, tipo, sala, dia e intervalo horário e remove duplicados.

Semanas são calculadas relativamente à segunda-feira da primeira data escolhida. Não se presume que as datas oficiais de P1/P2 possam ser inferidas a partir do nome do semestre. O utilizador escolhe o intervalo e o título.

Campos/eventos não reconhecidos são contabilizados e comunicados ao utilizador. Aulas fora do intervalo 08:00–17:00 expandem a grelha. Sobreposições recebem colunas próprias. Em casos muito densos ou nomes longos, etiquetas podem ser abreviadas; a lista de ocorrências apresenta os dados completos.

## Alojamento com Docker Compose e Coolify

A aplicação compila para um servidor Node autónomo (`output: "standalone"`). Não há Cloudflare Workers, wrangler nem bindings de plataforma: toda a configuração chega por variáveis de ambiente.

- `Dockerfile` — três fases: bun instala o lockfile, o Node compila com vinext, e a imagem final leva apenas `dist/standalone` (servidor mais os pacotes que importa em runtime). Corre como utilizador `node`, expõe a porta 3000.
- `docker-compose.yml` — unidade de deploy, com healthcheck em `/api/fenix/status`, limites de log e sem portas publicadas: o proxy do Coolify termina o TLS e encaminha para a 3000.

No Coolify:

1. Criar um recurso **Docker Compose** apontado para este repositório.
2. Definir o domínio do serviço `app`.
3. Adicionar as variáveis de ambiente de `.env.example`, com FENIX_CLIENT_SECRET e FENIX_COOKIE_SECRET marcadas como segredos. APP_ORIGIN tem de coincidir com o domínio definido no passo anterior.
4. Registar `${APP_ORIGIN}/api/fenix/callback` no Fénix antes do primeiro teste de ligação.

O domínio não é gerado automaticamente de propósito: tem de ser registado à mão no Fénix, por isso um domínio estável e escolhido por quem instala vale mais do que um gerado pelo Coolify.

Fora do Coolify: copiar `.env.example` para `.env`, descomentar o bloco `ports` em `docker-compose.yml` e correr `docker compose up -d --build`. Sem TLS a aplicação continua a servir o editor e a exportação, mas apresenta-se como não configurada para o Fénix, por causa dos cookies `__Host-`.

## Desenvolvimento

Node 22.13+; React, TypeScript e Vinext sobre Node.

- bun run install:ci
- bun run build — compila e emite `dist/standalone/`
- bun run start — serve o build de produção localmente
- bun run dev
- bun run test

Manter .env e .env.example alinhados. Não colocar segredos em ficheiros versionados nem em variáveis NEXT_PUBLIC_*.

## Fontes oficiais

- [Registo e OAuth Fénix](https://fenixedu.org/dev/tutorials/use-fenixedu-api-in-your-application/)
- [Calendário de aulas e formato da API](https://fenixedu.org/dev/api/#get-personcalendarclasses)
