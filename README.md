# Etapa 2 — Adaptador de eventos OpenClaw Trading

Entrega **somente da camada de eventos**. Não modifica o Pixel Agents 1.5.0 nem os agentes de negociação. O renderizador visual (Etapa 3) ainda não está implementado.

## Conteúdo

- `plugin/`: plugin OpenClaw `pixel-events`, com hooks de observação (model_start, model_end, tool_end, agent_end). Envia apenas agentId, sessionKey, runId, nome da ferramenta, outcome/success e timestamp; nenhum prompt, resposta, parâmetros, resultado ou texto de erro.
- `receiver/`: serviço Node.js isolado com `POST /events`, `GET /agents`, `GET /events` (SSE), `GET /health`. Todos os caminhos exceto health exigem Bearer token.
- `test/`: testes locais sem dependências de terceiros.

## Testar sem tocar na VPS

```bash
node --test test/*.test.mjs
```

## Deploy planejado (quando aprovado)

1. Publicar o receiver em um serviço Swarm **sem portas publicadas nem labels Traefik**, em uma rede interna compartilhada com o OpenClaw Trading; limitar acesso à rede.
2. Gerar token aleatório exclusivo e injetá-lo em **ambos** os serviços por secret/arquivo protegido (não commitar). A versão inicial lê `PIXEL_EVENTS_TOKEN` da variável de ambiente. Para produção no Swarm, adaptar leitura por secret file ou entrypoint que carrega secret.
3. Implantar `plugin/` no volume de extensões **da instância Trading apenas** usando o processo de instalação de plugin da versão instalada. A configuração deverá expor `PIXEL_EVENTS_URL=http://<receiver>:3188/events` e `PIXEL_EVENTS_TOKEN` ao processo OpenClaw e ativar `plugins.entries.pixel-events.hooks.allowConversationAccess=true` para permitir `agent_end`; o código não lê mensagens.
4. Inspecionar com `openclaw plugins inspect pixel-events --runtime --json` e provocar **apenas um evento de análise controlado** em paper trading para validar `/agents`.
5. Etapa 3: adicionar consumidor SSE / protocolo de provider ao frontend Pixel Agents para desenhar personagens. **Não está incluído nesta entrega.**

## Segurança / limites

- Não existe qualquer endpoint que execute ordens ou comandos do OpenClaw.
- Não passar `PIXEL_EVENTS_TOKEN` para browsers. O SSE é para clientes backend da rede privada, nunca para acesso público direto.
- `receiver` guarda o último evento na memória; reiniciar marca todos como ociosos, e após 2 minutos sem evento o estado mostrado retorna a ocioso.
- O envio do plugin é assíncrono e não aguarda a rede, com timeout de 800 ms.
- A doc atual do OpenClaw foi consultada para a API `api.on`. Necessária validação de compatibilidade com OpenClaw 2026.10.9 do ambiente antes de instalar.
