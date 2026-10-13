# Controle de Folgas BWA: requisitos da fase 1 (MVP)

Levantados com o cliente em 09/10/2026. Os itens marcados com *(assumido)* foram sugestões aceitas em bloco e ainda valem uma conferência.

## Objetivo

Controlar as folgas dos motoristas da BWA na escala 6x1 e manter um **banco de folgas** com as folgas devidas e não tiradas.

## Regra do cálculo

| Situação | Banco | Contagem do ciclo |
|---|---|---|
| Trabalhou no 7º dia | +1 | recomeça no dia seguinte |
| Folgou no 7º dia | não muda | recomeça |
| Folgou em outro dia, com saldo no banco | −1 | recomeça |
| Folgou em outro dia, sem saldo | não muda (nunca fica negativo) | recomeça |
| Feriado trabalhado (em qualquer dia do ciclo) | +1 (soma com o 7º dia: +2) | conta como dia trabalhado |
| Folga em feriado | não muda | recomeça |
| Férias | não muda | recomeça |
| Atestado ou afastamento | não muda | recomeça *(assumido)* |
| Falta | o sistema pergunta se deve usar 1 folga do banco para abonar | recomeça *(assumido)* |

- Dia sem lançamento conta como **trabalhado**. Dias futuros não entram na conta.
- A contagem e o banco **atravessam os períodos**. Exemplo: última folga em 19/10, trabalho de 20 a 25/10; o dia 26/10, primeiro dia do período seguinte, é o 7º dia.
- O banco é quitado **só com folgas**. Não há pagamento em dinheiro, limite nem validade.
- Exemplo do cliente: 14 dias seguidos geram 2 no banco. Uma folga no dia 15 deixa 1, e a contagem recomeça no dia 16.

## Período de apuração

Do dia 26 de um mês ao dia 25 do mês seguinte. O operador escolhe o período pelo mês de fechamento (ex.: "Out/2026" = 26/09/2026 a 25/10/2026) e o sistema preenche as datas.

## Cadastro

- Lista inicial importada da planilha de motoristas do cliente, aba **BWA**: 76 motoristas. O texto depois do hífen vira observação (Instrutor, Afastado INSS, Escolinha). A planilha tem dados pessoais e **não vai para o repositório** (está no `.gitignore`).
- Cada motorista tem um **saldo inicial**: data de início do controle, folgas no banco e dias seguidos trabalhados até a véspera do início (0 a 6).
- Motorista inativo sai da tela e mantém o histórico.

## Telas

- **Painel no topo:**
  - ranking de folgas no banco (maior para menor)
  - ranking de dias trabalhados no período (maior para menor)
  - lista de quem tem folga devida hoje (7º dia) e amanhã
- **Visão geral:** uma grade com todos os motoristas e os dias do período. O operador marca só as exceções (clique ou teclas 0 a 4). As colunas fixas mostram o banco e os dias seguidos de hoje.
- **Extrato** por motorista, com cada entrada e saída do banco.
- **Lançar vários dias:** para férias e afastamentos.
- **Feriados:** os nacionais já vêm cadastrados. Os estaduais e municipais são incluídos pelo operador. Carnaval e Corpus Christi entram com um botão *(assumido: não entram automaticamente)*. Detalhes na seção abaixo.

## Feriados municipais e estaduais

Pedido do cliente em 12/10/2026: poder incluir feriados que não estão no calendário nacional.

- **Dois caminhos para incluir:**
  - clicar na data no cabeçalho da grade e dar um nome ao feriado (antes de confirmar, a tela mostra quantos motoristas trabalharam no dia e vão ganhar +1);
  - ou usar o botão **Feriados** no topo, que lista os feriados do ano.
- **Repete todo ano:** a opção vem marcada *(assumido)*. Com ela, o feriado entra sozinho nos anos seguintes, na mesma data, sem precisar cadastrar de novo. Vale a partir do ano da data escolhida. Desmarcada, o feriado vale só naquele ano (ex.: ponto facultativo decretado).
- Cada feriado aparece com uma etiqueta: **Nacional**, **Todo ano** ou **Só em AAAA**.
- **Remover:**
  - *Tirar só de AAAA:* tira o feriado daquele ano; nos outros anos ele continua.
  - *Parar de repetir:* o feriado deixa de entrar nos anos seguintes. O ano escolhido e os anteriores ficam como estão, para não mudar o banco já apurado.
- Um feriado que repete nunca apaga um feriado nacional que caia no mesmo dia.
- Feriado em 29/02 que repete só aparece nos anos bissextos.
- Não há campo de tipo (municipal ou estadual): o nome identifica o feriado *(assumido)*.
- Carnaval e Corpus Christi mudam de data todo ano, então continuam entrando pelo botão, ano a ano *(assumido)*.
- **Pendente:** a cidade e o estado da BWA não foram informados, então nenhum feriado local vem pré-cadastrado.

## Dados e backup

- O sistema é um arquivo HTML que roda no Chrome, sem servidor e sem banco de dados. Os dados ficam no navegador.
- **Salvar backup** gera um `.json` com data e hora no nome, numa pasta local. **Abrir backup** restaura os dados.
- Proteções:
  - pede o backup ao abrir com o navegador vazio
  - avisa antes de carregar um arquivo mais antigo que os dados atuais
  - mostra no topo quando há alterações ainda não salvas
  - pede confirmação ao fechar com alterações não salvas
- **Formato do backup:** versão 2 desde 12/10/2026, que guarda também os feriados que repetem todo ano (campo `feriadosFixos`). Backups antigos (versão 1) continuam abrindo normalmente. Um HTML antigo recusa backup da versão 2 com a mensagem "use o arquivo HTML mais recente": por isso, o arquivo HTML novo precisa substituir o antigo em todos os computadores.
- **Uma pessoa lança, em um único computador** *(assumido)*. Os outros computadores só abrem o backup mais recente para consultar. Se duas pessoas lançarem em máquinas diferentes no mesmo dia, um arquivo sobrescreve o outro.
- Sem senha nesta fase.

## Fora do escopo da fase 1

Horários de jornada, horas extras, banco de horas, servidor e vários usuários.

## Testes

- `node --test testes/`: 49 testes da regra de cálculo, períodos, feriados (inclusive os que repetem todo ano), backup e importação.
- `node testes/e2e.mjs`: teste de ponta a ponta no Chrome em 37 passos, com uma planilha fictícia gerada pelo próprio teste (`testes/planilha-ficticia.mjs`, mesmo formato da real) e a data simulada de 10/10/2026. Inclui marcar feriado pelo cabeçalho da grade, repetir, tirar de um ano, parar de repetir e abrir backup da versão 1.
- Para testar à mão com outra data, abra o HTML com `?hoje=AAAA-MM-DD` no fim do endereço.
