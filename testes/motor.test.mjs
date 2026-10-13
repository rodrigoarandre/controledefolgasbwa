// Testes do motor de cálculo. Rodar com:  node --test testes/
// O motor é lido direto do controle-folgas.html (bloco <script id="motor">).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../controle-folgas.html', import.meta.url), 'utf8');
const codigo = html.match(/<script id="motor">([\s\S]*?)<\/script>/)[1];
const modulo = { exports: {} };
new Function('module', codigo)(modulo);
const M = modulo.exports;

// Monta uma sequência de dias a partir de um padrão:
// T trabalhou · F folga · E férias · A atestado · X falta sem abonar · D falta abonada com o banco
function rodar(padrao, { inicio = '2026-09-26', banco = 0, ciclo = 0, feriados = {} } = {}) {
  const tipos = { F: { t: 'F' }, E: { t: 'FE' }, A: { t: 'A' }, X: { t: 'X', debitar: false }, D: { t: 'X', debitar: true } };
  const letras = padrao.replace(/\s/g, '');
  const lanc = {};
  let d = inicio;
  for (const ch of letras) {
    if (!'TFEAXD'.includes(ch)) throw new Error('letra inválida: ' + ch);
    if (tipos[ch]) lanc[d] = tipos[ch];
    d = M.addDias(d, 1);
  }
  const ate = M.addDias(inicio, letras.length - 1);
  return M.calcularMotorista({ inicio, bancoInicial: banco, diasCicloInicial: ciclo }, lanc, feriados, ate);
}
const dia = (n, inicio = '2026-09-26') => M.addDias(inicio, n - 1); // n-ésimo dia da sequência

// ---------- Regra 6x1 confirmada com o cliente ----------

test('6 dias trabalhados e folga no 7º: folga normal, banco 0', () => {
  const r = rodar('TTTTTT F');
  assert.equal(r.banco, 0);
  assert.equal(r.ciclo, 0);
});

test('trabalhou no 7º dia: +1 no banco e o ciclo recomeça no dia seguinte', () => {
  const r = rodar('TTTTTTT T');
  assert.equal(r.banco, 1);
  assert.equal(r.dias[dia(7)].setimo, true);
  assert.equal(r.dias[dia(8)].posicao, 1);
});

test('exemplo do cliente: 14 dias seguidos = 2 no banco; folga no dia 15 usa 1; contagem recomeça no 16', () => {
  const r = rodar('TTTTTTT TTTTTTT F T');
  assert.equal(r.dias[dia(14)].banco, 2);
  assert.equal(r.dias[dia(15)].banco, 1);
  assert.equal(r.dias[dia(16)].posicao, 1);
  assert.equal(r.banco, 1);
});

test('7 trabalhados e folga no 8º: a folga usa o banco (banco 0)', () => {
  assert.equal(rodar('TTTTTTT F').banco, 0);
});

test('7 trabalhados, mais 2, e folga: banco 0 e contagem recomeça depois da folga', () => {
  const r = rodar('TTTTTTT TT F');
  assert.equal(r.banco, 0);
  assert.equal(r.ciclo, 0);
});

test('(a) banco 2 e folga normal no 7º dia: banco continua 2', () => {
  assert.equal(rodar('TTTTTT F', { banco: 2 }).banco, 2);
});

test('(b) banco 0 e folga antes do 7º dia: só recomeça a contagem, nunca fica negativo', () => {
  const r = rodar('TTT F', { banco: 0 });
  assert.equal(r.banco, 0);
  assert.equal(r.ciclo, 0);
  assert.ok(Object.values(r.dias).every(d => d.banco >= 0));
});

test('(c) banco 2 e duas folgas seguidas fora do 7º dia: banco 0', () => {
  assert.equal(rodar('TT F F', { banco: 2 }).banco, 0);
});

test('folga antecipada com saldo usa 1 do banco', () => {
  assert.equal(rodar('TTT F', { banco: 1 }).banco, 0);
});

test('30 dias seguidos: 4 no banco e 2 dias no ciclo atual', () => {
  const r = rodar('T'.repeat(30));
  assert.equal(r.banco, 4);
  assert.equal(r.ciclo, 2);
});

// ---------- Férias, atestado, feriado e falta ----------

test('férias não usam o banco e recomeçam a contagem', () => {
  const r = rodar('TTT EEEEE TTT', { banco: 1 });
  assert.equal(r.banco, 1);
  assert.equal(r.ciclo, 3);
});

test('atestado não usa o banco e recomeça a contagem', () => {
  const r = rodar('TTTTT A TT', { banco: 2 });
  assert.equal(r.banco, 2);
  assert.equal(r.ciclo, 2);
});

test('folga em feriado não usa o banco', () => {
  const feriados = { [dia(3)]: 'Teste' };
  assert.equal(rodar('TT F', { banco: 1, feriados }).banco, 1);
});

test('feriado trabalhado fora do 7º dia: +1 no banco', () => {
  const feriados = { [dia(3)]: 'Teste' };
  const r = rodar('TTT', { feriados });
  assert.equal(r.banco, 1);
  assert.match(r.extrato[0].motivo, /Feriado trabalhado/);
});

test('feriado trabalhado no 7º dia: +2 no banco', () => {
  const feriados = { [dia(7)]: 'Teste' };
  assert.equal(rodar('TTTTTTT', { feriados }).banco, 2);
});

test('falta abonada com saldo: usa 1 do banco', () => {
  assert.equal(rodar('TTTTTTT D', {}).banco, 0);
});

test('falta não abonada: banco não muda', () => {
  assert.equal(rodar('TTTTTTT X', {}).banco, 1);
});

test('falta abonada sem saldo: banco continua 0', () => {
  const r = rodar('TT D');
  assert.equal(r.banco, 0);
  assert.match(r.dias[dia(3)].nota, /sem saldo/);
});

test('falta recomeça a contagem', () => {
  assert.equal(rodar('TTTT X TT').ciclo, 2);
});

// ---------- Saldo inicial e períodos ----------

test('saldo inicial: banco e dias seguidos antes do início entram na conta', () => {
  const r = rodar('T', { banco: 3, ciclo: 6 });
  assert.equal(r.banco, 4);
  assert.equal(r.dias[dia(1)].setimo, true);
  assert.equal(r.extrato[0].motivo, 'Saldo inicial');
});

test('contagem atravessa o período: folga em 19/10, trabalhou 20 a 25/10, dia 26/10 é o 7º dia', () => {
  const inicio = '2026-10-19';
  const r = rodar('F TTTTTT T', { inicio });
  assert.equal(r.dias['2026-10-25'].ciclo, 6);
  assert.equal(r.dias['2026-10-26'].setimo, true);
  assert.equal(r.banco, 1);
  assert.equal(M.competenciaDe('2026-10-26').rotulo, 'Nov/2026');
});

test('competência Out/2026 vai de 26/09/2026 a 25/10/2026', () => {
  const c = M.competencia(2026, 10);
  assert.equal(c.inicio, '2026-09-26');
  assert.equal(c.fim, '2026-10-25');
  assert.equal(c.rotulo, 'Out/2026');
});

test('competência de janeiro começa em 26 de dezembro do ano anterior', () => {
  const c = M.competencia(2027, 1);
  assert.equal(c.inicio, '2026-12-26');
  assert.equal(c.fim, '2027-01-25');
});

test('competenciaDe: dia 25 fica no período, dia 26 abre o seguinte (inclusive na virada do ano)', () => {
  assert.equal(M.competenciaDe('2026-10-25').rotulo, 'Out/2026');
  assert.equal(M.competenciaDe('2026-10-26').rotulo, 'Nov/2026');
  assert.equal(M.competenciaDe('2026-12-26').rotulo, 'Jan/2027');
  assert.equal(M.competenciaVizinha(M.competencia(2026, 12), 1).rotulo, 'Jan/2027');
  assert.equal(M.competenciaVizinha(M.competencia(2026, 1), -1).rotulo, 'Dez/2025');
});

test('resumo do período conta só até hoje e só depois do início', () => {
  const m = { inicio: '2026-09-26', bancoInicial: 0, diasCicloInicial: 0 };
  const lanc = { '2026-10-02': { t: 'F' } };
  const c = M.calcularMotorista(m, lanc, {}, '2026-10-10');
  const r = M.resumoPeriodo(c, M.competencia(2026, 10), '2026-10-10');
  assert.equal(r.dias, 15);
  assert.equal(r.trabalhados, 14);
  assert.equal(r.folgas, 1);
});

test('lançamentos antes do início são ignorados e dias futuros não entram na conta', () => {
  const m = { inicio: '2026-10-01', bancoInicial: 0, diasCicloInicial: 0 };
  const lanc = { '2026-09-28': { t: 'F' }, '2026-10-20': { t: 'F' } };
  const c = M.calcularMotorista(m, lanc, {}, '2026-10-05');
  assert.equal(c.dias['2026-09-28'], undefined);
  assert.equal(c.dias['2026-10-20'], undefined);
  assert.equal(c.ciclo, 5);
});

test('status de hoje: 7º dia e véspera do 7º dia', () => {
  assert.equal(M.statusHoje(rodar('TTTTTTT'), dia(7)), 'hoje');
  assert.equal(M.statusHoje(rodar('TTTTTT'), dia(6)), 'amanha');
  assert.equal(M.statusHoje(rodar('TTTTTT F'), dia(7)), null);
});

// ---------- Feriados ----------

test('Páscoa e Sexta-feira Santa', () => {
  assert.equal(M.pascoa(2025), '2025-04-20');
  assert.equal(M.pascoa(2026), '2026-04-05');
  assert.equal(M.pascoa(2027), '2027-03-28');
  assert.equal(M.feriadosNacionais(2026)['2026-04-03'], 'Sexta-feira Santa');
});

test('feriados nacionais de 2026', () => {
  const f = M.feriadosNacionais(2026);
  assert.equal(Object.keys(f).length, 10);
  for (const d of ['2026-01-01', '2026-04-21', '2026-05-01', '2026-09-07', '2026-10-12', '2026-11-02', '2026-11-15', '2026-11-20', '2026-12-25']) assert.ok(f[d], d);
});

test('Carnaval e Corpus Christi de 2026', () => {
  const f = M.feriadosFacultativos(2026);
  assert.ok(f['2026-02-16'] && f['2026-02-17'] && f['2026-06-04']);
});

test('feriado nacional removido pelo usuário não volta', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2026]);
  delete est.feriados['2026-10-12'];
  M.garantirFeriados(est, [2026, 2027]);
  assert.equal(est.feriados['2026-10-12'], undefined);
  assert.ok(est.feriados['2027-10-12']);
});

// ---------- Backup ----------

test('backup: valida, limpa lançamentos inválidos e mantém os válidos', () => {
  const r = M.validarBackup({
    app: M.APP_ID, versao: 1, atualizadoEm: '2026-10-09T21:00:00.000Z',
    motoristas: [{ id: 'a', nome: 'Fulano', inicio: '2026-09-26', bancoInicial: 2, diasCicloInicial: 9 }],
    lancamentos: { a: { '2026-10-01': { t: 'F' }, '2026-10-02': { t: 'X', debitar: 1 }, 'lixo': { t: 'F' }, '2026-10-03': { t: '??' } }, fantasma: { '2026-10-01': { t: 'F' } } },
    feriados: { '2026-10-12': 'Aparecida' },
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado.motoristas[0].diasCicloInicial, 6);
  assert.deepEqual(r.estado.lancamentos, { a: { '2026-10-01': { t: 'F' }, '2026-10-02': { t: 'X', debitar: true } } });
  assert.equal(r.estado.feriados['2026-10-12'], 'Aparecida');
});

test('backup: recusa arquivo de outro sistema ou de versão mais nova', () => {
  assert.equal(M.validarBackup({ app: 'outro' }).ok, false);
  assert.equal(M.validarBackup({ app: M.APP_ID, versao: 99, motoristas: [] }).ok, false);
  assert.equal(M.validarBackup(null).ok, false);
});

test('nome do arquivo de backup tem data e hora', () => {
  assert.equal(M.nomeArquivoBackup(new Date(2026, 9, 9, 18, 30)), 'folgas-bwa_2026-10-09_1830.json');
});

// ---------- Importação de nomes ----------

test('nomes: separa observação e ajusta maiúsculas', () => {
  assert.deepEqual(M.separarNomeObs('ACÁCIO PRADO NUNES - Instrutor'), { nome: 'Acácio Prado Nunes', obs: 'Instrutor' });
  assert.deepEqual(M.separarNomeObs('DÉCIO MOURA PAIVA – ESCOLINHA'), { nome: 'Décio Moura Paiva', obs: 'Escolinha' });
  assert.deepEqual(M.separarNomeObs('CAETANO FERRAZ DA COSTA - Afastado INSS'), { nome: 'Caetano Ferraz da Costa', obs: 'Afastado INSS' });
  assert.deepEqual(M.separarNomeObs('TOMÁS AGUIAR DE BRITO\n'), { nome: 'Tomás Aguiar de Brito', obs: '' });
});

test('extrairNomes: acha a coluna de nomes, ignora cabeçalho e repetidos, pega o número ao lado', () => {
  const linhas = [
    [, 'N°', 'Motoristas BWA - Atual 21/09/2026'],
    [, '01', 'ABEL DUARTE MOREIRA '],
    [, '02', 'ÉRICO FONTES GUSMÃO - ESCOLINHA'],
    [, '03', 'Abel Duarte Moreira'],
  ];
  const r = M.extrairNomes(linhas);
  assert.equal(r.coluna, 2);
  assert.deepEqual(r.itens, [
    { nome: 'Abel Duarte Moreira', obs: '', numero: '01' },
    { nome: 'Érico Fontes Gusmão', obs: 'Escolinha', numero: '02' },
  ]);
});

test('extrairNomes: prefere a coluna com mais nomes diferentes (cargo repetido perde)', () => {
  const linhas = [
    ['MOTORISTA DE CAMINHÃO', 'BENTO ARRUDA MELO'],
    ['MOTORISTA DE CAMINHÃO', 'CAIO BASTOS FARIA'],
    ['MOTORISTA DE CAMINHÃO', 'DIMAS CARDOSO NEVES'],
  ];
  assert.equal(M.extrairNomes(linhas).coluna, 1);
});

// ---------- Feriados que se repetem todo ano (municipais e estaduais) ----------

test('feriado que repete todo ano: grava a data, cria a regra e já vale nos anos abertos depois dele', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2025, 2026, 2027]);
  const r = M.adicionarFeriado(est, '2026-01-25', 'Aniversário da cidade', true);
  assert.equal(r.anterior, null);
  assert.deepEqual(est.feriadosFixos, [{ dia: '01-25', nome: 'Aniversário da cidade', desde: 2026 }]);
  assert.equal(est.feriados['2026-01-25'], 'Aniversário da cidade');
  assert.equal(est.feriados['2027-01-25'], 'Aniversário da cidade');
  assert.equal(est.feriados['2025-01-25'], undefined, 'não volta para anos antes da data escolhida');
});

test('feriado que repete todo ano entra sozinho nos anos seguintes, sem apagar nacional', () => {
  const est = M.estadoVazio();
  M.adicionarFeriado(est, '2026-07-02', 'Independência da Bahia', true);
  M.adicionarFeriado(est, '2026-10-12', 'Padroeira (teste)', true);
  M.garantirFeriados(est, [2025, 2026, 2027, 2030]);
  assert.equal(est.feriados['2027-07-02'], 'Independência da Bahia');
  assert.equal(est.feriados['2030-07-02'], 'Independência da Bahia');
  assert.equal(est.feriados['2025-07-02'], undefined);
  assert.equal(est.feriados['2027-10-12'], 'Nossa Senhora Aparecida', 'o nacional do mesmo dia não é sobrescrito');
});

test('feriado avulso (sem repetir) não cria regra e não aparece no ano seguinte', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2026]);
  M.adicionarFeriado(est, '2026-08-15', 'Ponto facultativo', false);
  M.garantirFeriados(est, [2027]);
  assert.deepEqual(est.feriadosFixos, []);
  assert.equal(est.feriados['2026-08-15'], 'Ponto facultativo');
  assert.equal(est.feriados['2027-08-15'], undefined);
});

test('tirar o feriado de um ano só: a regra continua e os outros anos ficam', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2026, 2027]);
  M.adicionarFeriado(est, '2026-01-25', 'Aniversário da cidade', true);
  assert.equal(M.removerFeriado(est, '2026-01-25'), 'Aniversário da cidade');
  M.garantirFeriados(est, [2026, 2027, 2028]);
  assert.equal(est.feriados['2026-01-25'], undefined, 'o ano tirado não volta');
  assert.equal(est.feriados['2027-01-25'], 'Aniversário da cidade');
  assert.equal(est.feriados['2028-01-25'], 'Aniversário da cidade');
  assert.equal(est.feriadosFixos.length, 1);
});

test('parar de repetir: mantém o ano escolhido e os anteriores, apaga os seguintes e não volta mais', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2025, 2026, 2027, 2028]);
  M.adicionarFeriado(est, '2025-01-25', 'Aniversário da cidade', true);
  est.feriados['2027-01-25'] = 'Outro nome';  // feriado de outro nome no mesmo dia não é apagado
  assert.equal(M.pararRepeticao(est, '2026-01-25'), 1);
  M.garantirFeriados(est, [2029]);
  assert.deepEqual(est.feriadosFixos, []);
  assert.equal(est.feriados['2025-01-25'], 'Aniversário da cidade');
  assert.equal(est.feriados['2026-01-25'], 'Aniversário da cidade');
  assert.equal(est.feriados['2027-01-25'], 'Outro nome');
  assert.equal(est.feriados['2028-01-25'], undefined);
  assert.equal(est.feriados['2029-01-25'], undefined);
  assert.equal(M.pararRepeticao(est, '2026-01-25'), 0, 'sem regra, não faz nada');
});

test('parar de repetir preenche anos ainda não abertos entre o início da regra e o ano escolhido', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2024, 2026]);
  M.adicionarFeriado(est, '2024-03-19', 'São José', true);
  M.pararRepeticao(est, '2026-03-19');
  M.garantirFeriados(est, [2025]);
  assert.equal(est.feriados['2025-03-19'], 'São José');
});

test('cadastrar de novo o mesmo dia que repete troca o nome também nos anos seguintes', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2026, 2027]);
  M.adicionarFeriado(est, '2026-01-25', 'Aniversario', true);
  const r = M.adicionarFeriado(est, '2026-01-25', 'Aniversário da cidade', true);
  assert.equal(r.anterior, 'Aniversario');
  assert.deepEqual(est.feriadosFixos, [{ dia: '01-25', nome: 'Aniversário da cidade', desde: 2026 }]);
  assert.equal(est.feriados['2027-01-25'], 'Aniversário da cidade');
});

test('tipo do feriado: nacional, todo ano ou só naquele ano', () => {
  const est = M.estadoVazio();
  M.garantirFeriados(est, [2026, 2027]);
  M.adicionarFeriado(est, '2026-01-25', 'Aniversário da cidade', true);
  M.adicionarFeriado(est, '2026-08-15', 'Ponto facultativo', false);
  assert.equal(M.tipoFeriado(est, '2026-10-12'), 'nacional');
  assert.equal(M.tipoFeriado(est, '2026-01-25'), 'fixo');
  assert.equal(M.tipoFeriado(est, '2027-01-25'), 'fixo');
  assert.equal(M.tipoFeriado(est, '2026-08-15'), 'avulso');
  assert.equal(M.tipoFeriado(est, '2026-08-16'), null);
});

test('feriado que repete em 29/02 só aparece nos anos bissextos', () => {
  const est = M.estadoVazio();
  M.adicionarFeriado(est, '2028-02-29', 'Teste bissexto', true);
  M.garantirFeriados(est, [2028, 2029, 2032]);
  assert.equal(est.feriados['2032-02-29'], 'Teste bissexto');
  assert.equal(Object.keys(est.feriados).filter(d => d.startsWith('2029-02') || d.startsWith('2029-03-01')).length, 0);
});

test('feriado municipal que repete conta no banco no ano seguinte sem cadastrar de novo', () => {
  const est = M.estadoVazio();
  M.adicionarFeriado(est, '2026-01-25', 'Aniversário da cidade', true);
  M.garantirFeriados(est, [2026, 2027]);
  const m = { inicio: '2027-01-20', bancoInicial: 0, diasCicloInicial: 0 };
  const c = M.calcularMotorista(m, {}, est.feriados, '2027-01-25');
  assert.equal(c.banco, 1);
  assert.equal(c.extrato[0].motivo, 'Feriado trabalhado: Aniversário da cidade');
});

test('backup antigo (versão 1, sem feriados que repetem) abre e é atualizado para a versão atual', () => {
  const r = M.validarBackup({
    app: M.APP_ID, versao: 1, motoristas: [{ id: 'a', nome: 'Fulano', inicio: '2026-09-26' }],
    feriados: { '2026-10-12': 'Aparecida', '2026-01-25': 'Aniversário' }, feriadosAnos: [2026],
  });
  assert.equal(r.ok, true);
  assert.equal(r.estado.versao, M.VERSAO);
  assert.ok(M.VERSAO >= 2);
  assert.deepEqual(r.estado.feriadosFixos, []);
  assert.equal(r.estado.feriados['2026-01-25'], 'Aniversário');
});

test('backup: guarda os feriados que repetem e descarta regras inválidas ou repetidas', () => {
  const r = M.validarBackup({
    app: M.APP_ID, versao: M.VERSAO, motoristas: [],
    feriadosFixos: [
      { dia: '01-25', nome: 'Aniversário da cidade', desde: 2026 },
      { dia: '01-25', nome: 'Repetido', desde: 2026 },
      { dia: '02-29', nome: 'Bissexto', desde: 2028 },
      { dia: '02-30', nome: 'Dia que não existe', desde: 2026 },
      { dia: '13-01', nome: 'Mês que não existe', desde: 2026 },
      { dia: '03-19', nome: '', desde: 2026 },
      { dia: '03-19', nome: 'Sem ano', desde: 'x' },
      null,
    ],
  });
  assert.equal(r.ok, true);
  assert.deepEqual(r.estado.feriadosFixos, [
    { dia: '01-25', nome: 'Aniversário da cidade', desde: 2026 },
    { dia: '02-29', nome: 'Bissexto', desde: 2028 },
  ]);
});
