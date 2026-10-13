# PROGRESSO: Controle de Folgas BWA

> Atualizado em: 12/10/2026

## Status geral

- **Tipo:** ferramenta web simples, offline, num único arquivo HTML.
- **Fase atual:** MVP em uso, com ajustes pedidos pelo cliente.
- **Regras e decisões:** ficam em `REQUISITOS.md` (fonte da verdade).

## Sessões

### 09/10/2026: MVP
- Construído o `controle-folgas.html` (grade, banco de folgas, extrato, feriados, backup), com 37 testes do motor e 30 passos de ponta a ponta.

### 12/10/2026: feriados municipais e estaduais
- Pedido: "adicionar feriados nacionais ou municipais que não estão nos calendários nacionais".
- O botão Feriados já existia. Foi acrescentado:
  - marcar o feriado clicando na data do cabeçalho da grade;
  - opção "Repete todo ano" (vem marcada), que faz o feriado entrar sozinho nos anos seguintes;
  - etiquetas Nacional, Todo ano e Só em AAAA;
  - "Tirar só de AAAA" e "Parar de repetir".
- Backup passou para a versão 2 (campo `feriadosFixos`). Backups da versão 1 abrem normalmente.
- Testes: 49 do motor e 37 passos de ponta a ponta, todos passando.

## O que falta

- [ ] Cliente informar a cidade e o estado da BWA para pré-cadastrar os feriados locais.
- [ ] Cliente confirmar os pontos marcados como *(assumido)* no `REQUISITOS.md`.
- [ ] Trocar o arquivo HTML antigo pelo novo em todos os computadores (o HTML antigo recusa backup da versão 2).

## Avisos para a próxima sessão

- Antes de mudar regras, rodar `node --test testes/` e `node testes/e2e.mjs`.
- Manter tudo num arquivo só, offline, sem bibliotecas de CDN além das fontes.
