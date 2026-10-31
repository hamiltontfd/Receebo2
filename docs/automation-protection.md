# Proteção contra automações

## Limites de ações

Orçamentos por identidade **já validada** (Clerk tem precedência sobre convidado):

| Ação | Valor inicial | Configuração |
| --- | --- | --- |
| Emitir URL de upload (recibo ou anexo) | 30/minuto | `ACTION_UPLOAD_PER_MINUTE` |
| Ler/pesquisar recibos, detalhes, estatísticas, originais privados ou importações pendentes | 120/minuto | `ACTION_RECEIPT_READS_PER_MINUTE` |
| Sincronização manual Gmail, Outlook ou conjunta | **1/minuto partilhado** | `ACTION_MAIL_SYNC_PER_MINUTE` |

Valores configuráveis: inteiros de 1 a 100000. Usar os mesmos valores em todas
as instâncias. Configuração inválida impede a ação, nunca desativa o limite.
Os pedidos admitidos, incluindo pedidos inválidos, gastam uma unidade; falhas
posteriores não devolvem unidades. A sincronização conjunta gasta uma unidade
para todos os fornecedores; alternar as três entradas não aumenta o orçamento.

Não há Redis nem serviços adicionais. Um `INSERT ... ON CONFLICT DO UPDATE`
atómico no PostgreSQL existente decide cada pedido. A janela começa no primeiro
pedido e dura 60 segundos, segundo o relógio da base de dados; bloqueios não
prolongam a janela. As chaves são SHA-256 da ação e identidade, sem identificadores
em texto simples nem IPs. O contador satura, evitando overflow por repetição.
Não é proteção contra DDoS volumétrico nem contra todas as múltiplas contas.

Limpeza no arranque e a cada minuto: até 10000 contadores expirados por execução,
com índice de expiração e `SKIP LOCKED`. Pode correr em várias instâncias sem
eliminar janelas renovadas. Em autoscale adormecido não há tráfego a gerar novos
contadores; o próximo arranque retoma a limpeza.

## Respostas e interface

- HTTP **429**, `code: ACTION_RATE_LIMITED`, `action`, `retryAfterSeconds` e
  cabeçalho `Retry-After` em segundos. `Cache-Control: private, no-store`.
- Falha na base de contadores/configuração: HTTP **503**,
  `code: ACTION_LIMIT_UNAVAILABLE`, `Retry-After: 10`. Não é um bloqueio de quota;
  regista-se como falha interna e **não** se executa a ação cara.
- Consulta de decisão tem timeout de 5 segundos. Se o resultado for incerto,
  a ação não arranca; uma unidade pode ter sido consumida na base.
- O cliente mantém uma espera partilhada por ação, respeita `Retry-After` e
  rejeita tentativas prematuras localmente, sem novos pedidos à API.
- Queries não repetem automaticamente 429/503 do limitador. O polling de
  extração espera o prazo indicado antes de voltar a consultar.
- Uploads de câmara, ficheiros e anexos mantêm o ficheiro em memória para
  **repetição explícita**, não o enviam sozinhos. A seleção é perdida ao fechar
  a página; drafts já existentes não são removidos por uma limitação.
- Mensagens com espera em inglês, português de Portugal e do Brasil. A pesquisa
  conserva o texto e mostra a espera; a sincronização mostra-a na notificação.

O limitador está depois da autenticação e antes dos locks, reservas de trial,
emissão de URLs, pesquisas ou integrações. Não altera os 15 dias de trial, os
5 recibos guardados, as 10 leituras completas partilhadas de IA, nem os limites
de pré-verificação/extração por execução do pipeline de email.

Jobs agendados, webhooks Stripe, callbacks OAuth e proxy Clerk não passam pelos
novos limitadores de ações. As sincronizações de ligação OAuth continuam com o
comportamento existente; esta alteração limita os três disparos **manuais**.

## Fronteira de IP

`trust proxy` do Express permanece no valor seguro `false`. Não há CIDRs
verificados/configurados em Development ou Production para o GeoIP. Os IPs
encaminhados fornecidos pelo cliente não identificam o orçamento de ações.

O limite **existente** de criação de sessões convidadas continua em 5/hora
por peer de socket, em memória por processo; o caminho idempotente existente
continua sem gastar novas sessões. Atrás de proxies partilhados não verificados,
vários visitantes podem partilhar esse orçamento, e várias instâncias têm
contadores distintos. Não se substitui esse limite por IPs falsificáveis.
Só corrigir a atribuição após demonstrar que o ingresso remove/reconstrói
cabeçalhos e verificar as redes confiáveis de cada ambiente.

## Clerk: disponibilidade não é estado observado

Verificação de 31 de outubro de 2026:

| Item | Observação |
| --- | --- |
| Gestão | Replit-managed, reconfirmado pelo mecanismo suportado |
| Acesso ao painel | Autorizado, reconfirmado |
| Disponibilidade de proteção antibot | Documentação Replit descreve proteção incorporada, incluindo reCAPTCHA |
| Estado efetivo em Development | **Não confirmado** |
| Estado efetivo em Production | **Não confirmado** |

Os mecanismos suportados de leitura disponíveis ao agente não expõem a
configuração antibot dos dois tenants. A autorização de abrir o painel não
fornece uma leitura automatizada dessas opções. Não se fez alteração remota,
não se instalou CLI alternativa, não se leu/exibiu credenciais e **não se afirma
que a proteção foi ativada**. A confirmação exige observação no painel autorizado,
separadamente em Development e Production; não é bloqueio para os limites locais.
Nenhuma publicação em produção faz parte desta entrega.
