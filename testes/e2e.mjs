// Teste de ponta a ponta no Chrome (headless). Rodar com:  node testes/e2e.mjs
// Usa uma planilha FICTÍCIA gerada na hora (testes/planilha-ficticia.mjs) e a data simulada de 10/10/2026.
// A planilha real da BWA tem dados pessoais e não fica no repositório.
// Fotos de tela vão para a pasta indicada em FOTOS (padrão: pasta temporária do sistema).
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { abrirChrome, esperar } from './cdp.mjs';
import { gerarPlanilha } from './planilha-ficticia.mjs';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');
const URL_APP = pathToFileURL(join(raiz, 'controle-folgas.html')).href + '?hoje=2026-10-10&teste';
const FOTOS = process.env.FOTOS || join(tmpdir(), 'folgas-fotos');
mkdirSync(FOTOS, { recursive: true });
const downloads = mkdtempSync(join(tmpdir(), 'folgas-downloads-'));
const planilha = join(downloads, 'motoristas-ficticios.xlsx');
writeFileSync(planilha, gerarPlanilha());

const A = 'Abel Duarte Moreira';               // folga no dia 15 (exemplo do cliente)
const B = 'Acácio Prado Nunes';                // folga no 7º dia (observação: Instrutor)
const C = 'Adriano Teles Campos';              // falta abonada com o banco
const D = 'Afonso Brandão Lacerda';            // férias lançadas por intervalo
const E = 'Alceu Vasconcelos Rocha';           // folga pelo teclado (tecla 1)
const F = 'Anderson Quintela Barros';          // hoje é o 7º dia
const G = 'André Saldanha Pires';              // sem lançamentos
const H = 'Caetano Ferraz da Costa';           // observação: Afastado INSS; é inativado

let passo = 0;
const ok = msg => console.log(`✔ ${String(++passo).padStart(2, '0')} ${msg}`);

const b = await abrirChrome();
try {
  const id = nome => b.avaliar(`App.estado.motoristas.find(m => m.nome === ${JSON.stringify(nome)}).id`);
  const banco = async nome => b.avaliar(`App.calc[${JSON.stringify(await id(nome))}].banco`);
  const ciclo = async nome => b.avaliar(`App.calc[${JSON.stringify(await id(nome))}].ciclo`);
  const clicar = sel => b.avaliar(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) throw new Error('não achei ${sel.replace(/'/g, '')}'); e.click(); return true; })()`);
  const clicarTexto = texto => b.avaliar(`(() => { const e = [...document.querySelectorAll('button')].find(x => x.textContent.trim() === ${JSON.stringify(texto)}); if (!e) throw new Error('não achei o botão ${texto}'); e.click(); return true; })()`);
  const celula = async (nome, d) => `#grade tr[data-id="${await id(nome)}"] td.cel[data-d="${d}"]`;
  const marcar = async (nome, d, tipo) => {
    await clicar(await celula(nome, d));
    await b.esperarAte(`!!document.querySelector('.menu')`);
    await clicar(`.menu button[data-tipo="${tipo}"]`);
    await esperar(60);
  };
  const tituloModal = () => b.avaliar(`document.querySelector('#modais .modal-fundo:last-child h2')?.textContent || ''`);

  // 1. Primeira abertura
  await b.ir(URL_APP);
  assert.equal(await tituloModal(), 'Nenhum dado neste navegador');
  ok('primeira abertura mostra o aviso para abrir backup ou importar motoristas');

  // 2. Importar a planilha (fictícia)
  await clicar('#bv-importar');
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Importar motoristas'`);
  await b.enviarArquivo('#in-import', planilha);
  await b.esperarAte(`!!document.querySelector('.resumo-imp')`);
  const resumo = await b.avaliar(`document.querySelector('.resumo-imp').textContent`);
  assert.match(resumo, /^76 nomes encontrados na aba "BWA"/);
  assert.equal(await b.avaliar(`document.querySelector('#im-aba').selectedOptions[0].textContent`), 'BWA');
  ok(`planilha lida: ${resumo}`);
  await b.foto(join(FOTOS, '01-importacao.png'));
  await clicar('#im-confirmar');
  await b.esperarAte(`document.querySelectorAll('#grade tbody tr[data-id]').length === 76`);
  assert.equal(await b.avaliar(`App.estado.motoristas.find(m => m.nome === ${JSON.stringify(B)}).obs`), 'Instrutor');
  assert.equal(await b.avaliar(`App.estado.motoristas.find(m => m.nome === ${JSON.stringify(H)}).obs`), 'Afastado INSS');
  assert.equal(await b.avaliar(`App.estado.motoristas.every(m => m.inicio === '2026-09-26')`), true);
  ok('76 motoristas importados, com observações (Instrutor, Afastado INSS, Escolinha) e início em 26/09/2026');

  // 3. Sem lançamentos: 15 dias trabalhados (26/09 a 10/10) = 2 no banco, 1 dia no ciclo
  assert.equal(await b.avaliar(`Object.values(App.calc).every(c => c.banco === 2 && c.ciclo === 1)`), true);
  ok('sem lançamentos, todos têm 2 folgas no banco (7º dias em 02/10 e 09/10)');

  // 4. Cenários lançados pela tela
  await marcar(A, '2026-10-10', 'F');
  await marcar(B, '2026-10-02', 'F');
  await marcar(F, '2026-10-03', 'F');

  await clicar(await celula(C, '2026-10-05'));
  await b.esperarAte(`!!document.querySelector('.menu')`);
  await clicar('.menu button[data-tipo="X"]');
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Abonar a falta com o banco?'`);
  assert.match(await b.avaliar(`document.querySelector('#modais .modal-corpo').textContent`), /tem 1 folga no banco em 05\/10\/2026/);
  await b.foto(join(FOTOS, '02-falta-pergunta.png'));
  await clicarTexto('Usar 1 folga do banco');
  ok('falta: o sistema perguntou se deve usar a folga do banco');

  await clicar('#bt-intervalo');
  await b.esperarAte(`!!document.querySelector('#iv-mot')`);
  await b.avaliar(`(() => {
    const v = (s, x) => { const e = document.querySelector(s); e.value = x; e.dispatchEvent(new Event('change', { bubbles: true })); };
    v('#iv-mot', ${JSON.stringify(await id(D))}); v('#iv-tipo', 'FE'); v('#iv-de', '2026-09-28'); v('#iv-ate', '2026-10-04');
  })()`);
  await clicar('#iv-ok');
  await esperar(80);
  assert.equal(await b.avaliar(`Object.keys(App.estado.lancamentos[${JSON.stringify(await id(D))}]).length`), 7);
  ok('férias de 28/09 a 04/10 lançadas de uma vez (7 dias)');

  await b.avaliar(`document.querySelector(${JSON.stringify(await celula(E, '2026-10-01'))}).focus()`);
  await b.tecla('1', 'Digit1', 49);
  await esperar(80);
  assert.equal(await b.avaliar(`App.estado.lancamentos[${JSON.stringify(await id(E))}]['2026-10-01'].t`), 'F');
  assert.equal(await b.avaliar(`document.activeElement.dataset.d`), '2026-10-01');
  ok('folga lançada pelo teclado (tecla 1) e o foco ficou na célula');

  // 5. Conferir os números
  const esperado = {
    [A]: [1, 0, 'folga no dia 15 usou 1 das 2 folgas'],
    [B]: [1, 1, 'folga no 7º dia não mexeu no banco; 09/10 foi 7º dia trabalhado'],
    [C]: [0, 5, 'falta abonada usou a folga ganha em 02/10'],
    [D]: [0, 6, 'férias recomeçaram a contagem sem usar banco'],
    [E]: [1, 2, 'folga em 01/10 sem saldo só recomeçou a contagem'],
    [F]: [1, 0, 'folga em 03/10 usou 1; hoje (10/10) é o 7º dia'],
    [G]: [2, 1, 'sem lançamentos'],
  };
  for (const [nome, [bEsp, cEsp, porque]] of Object.entries(esperado)) {
    assert.equal(await banco(nome), bEsp, `${nome}: banco`);
    assert.equal(await ciclo(nome), cEsp, `${nome}: ciclo`);
    ok(`${nome}: banco ${bEsp}, ${cEsp} dias seguidos (${porque})`);
  }
  const alertas = await b.avaliar(`({
    hoje: [...document.querySelectorAll('.al-hoje .alerta-lista button')].map(x => x.textContent),
    amanha: [...document.querySelectorAll('.al-amanha .alerta-lista button')].map(x => x.textContent),
  })`);
  assert.deepEqual(alertas, { hoje: [F], amanha: [D] });
  ok(`painel de folga devida: hoje = ${F}; amanhã = ${D}`);

  const ranking = await b.avaliar(`[...document.querySelectorAll('#rank-banco .rank-item')].map(x => +x.querySelector('.rank-valor').textContent)`);
  assert.equal(ranking.length, 76);
  assert.deepEqual(ranking, [...ranking].sort((x, y) => y - x));
  const trab = await b.avaliar(`[...document.querySelectorAll('#rank-trab .rank-item')].map(x => +x.querySelector('.rank-valor').textContent)`);
  assert.deepEqual(trab, [...trab].sort((x, y) => y - x));
  assert.equal(trab[0], 15);
  assert.equal(trab[trab.length - 1], 8);
  ok('rankings do topo em ordem decrescente (banco e dias trabalhados no período)');

  const celA = await b.avaliar(`document.querySelector(${JSON.stringify(await celula(A, '2026-10-10'))}).textContent`);
  assert.equal(celA, 'F−1');
  assert.equal(await b.avaliar(`document.querySelector(${JSON.stringify(await celula(B, '2026-10-09'))}).classList.contains('setimo')`), true);
  assert.match(await b.avaliar(`document.querySelector('th.dia.fer').title`), /12\/10\/2026\. Feriado: Nossa Senhora Aparecida/);
  ok('grade mostra F−1, o 7º dia trabalhado destacado e o feriado de 12/10');
  await b.foto(join(FOTOS, '03-visao-geral.png'));

  await clicar(await celula(B, '2026-10-09'));
  await b.esperarAte(`!!document.querySelector('.menu')`);
  assert.match(await b.avaliar(`document.querySelector('.menu-info').textContent`), /7º dia do ciclo\. 7º dia trabalhado \(\+1\)\. banco: 1/);
  await b.foto(join(FOTOS, '04-menu-celula.png'));
  await b.tecla('Escape', 'Escape', 27);
  assert.equal(await b.avaliar(`!!document.querySelector('.menu')`), false);
  ok('menu da célula explica o dia e fecha com Esc');

  // 6. Feriado trabalhado
  await clicar('#bt-feriados');
  await b.esperarAte(`!!document.querySelector('#fe-add')`);
  await b.avaliar(`(() => { document.querySelector('#fe-data').value = '2026-10-06'; document.querySelector('#fe-nome').value = 'Feriado municipal de teste'; })()`);
  await clicar('#fe-add');
  await esperar(60);
  assert.equal(await banco(G), 3);
  assert.equal(await banco(D), 1);
  ok('feriado em 06/10 trabalhado: +1 para quem trabalhou (André 2→3, Aleksandro 0→1)');
  await clicar('[data-rem="2026-10-06"]');
  await esperar(60);
  assert.equal(await banco(G), 2);
  await clicarTexto('Fechar');
  ok('feriado removido: saldos voltaram');

  // 6b. Feriado municipal marcado pela data do cabeçalho da grade, repetindo todo ano
  const cab = d => `#grade th.dia button[data-dia="${d}"]`;
  const corpoModal = () => b.avaliar(`document.querySelector('#modais .modal-fundo:last-child .modal-corpo').textContent`);
  const ultimoAviso = () => b.avaliar(`document.querySelector('#toasts').lastElementChild?.textContent || ''`);
  await clicar(cab('2026-10-07'));
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Marcar 07/10/2026 como feriado'`);
  assert.match(await corpoModal(), /76 motoristas trabalharam neste dia e vão ganhar \+1 folga no banco/);
  assert.equal(await b.avaliar(`document.activeElement.id`), 'fd-nome');
  assert.equal(await b.avaliar(`document.querySelector('#fd-repetir').checked`), true);
  await b.avaliar(`document.querySelector('#fd-nome').value = 'Aniversário da cidade (teste)'`);
  await b.foto(join(FOTOS, '04b-marcar-feriado-pelo-cabecalho.png'));
  await b.tecla('Enter', 'Enter', 13);
  await esperar(80);
  assert.equal(await b.avaliar(`document.querySelectorAll('#modais .modal-fundo').length`), 0);
  assert.equal(await banco(G), 3);
  assert.match(await ultimoAviso(), /Repete todo ano em 07\/10\. 76 motoristas que trabalharam ganharam \+1 no banco/);
  assert.deepEqual(await b.avaliar(`App.estado.feriadosFixos.find(r => r.dia === '10-07')`), { dia: '10-07', nome: 'Aniversário da cidade (teste)', desde: 2026 });
  assert.equal(await b.avaliar(`App.estado.feriados['2027-10-07']`), 'Aniversário da cidade (teste)');
  assert.equal(await b.avaliar(`!!document.querySelector('th.dia.fer ' + ${JSON.stringify(cab('2026-10-07').replace('#grade th.dia ', ''))})`), true);
  ok('feriado marcado clicando na data do cabeçalho (Enter confirma); +1 para os 76 que trabalharam e já vale em 2027');

  await clicar(cab('2026-10-07'));
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Feriado em 07/10/2026'`);
  assert.match(await corpoModal(), /Aniversário da cidade \(teste\)Todo ano/);
  await b.foto(join(FOTOS, '04c-feriado-que-repete.png'));
  await clicar('#fd-parar');
  await esperar(80);
  assert.equal(await b.avaliar(`App.estado.feriados['2027-10-07']`), undefined);
  assert.equal(await b.avaliar(`App.estado.feriadosFixos.some(r => r.dia === '10-07')`), false);
  assert.equal(await banco(G), 3);
  ok('"Parar de repetir": sai de 2027 em diante e 2026 continua feriado');

  await clicar(cab('2026-10-07'));
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Feriado em 07/10/2026'`);
  assert.match(await corpoModal(), /Só em 2026/);
  await clicar('#fd-tirar');
  await esperar(80);
  assert.equal(await banco(G), 2);
  assert.equal(await b.avaliar(`App.estado.feriados['2026-10-07']`), undefined);
  assert.match(await ultimoAviso(), /76 motoristas perderam o \+1 desse dia/);
  ok('feriado removido pelo cabeçalho: saldos voltaram');

  await clicar(cab('2026-10-12'));
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Feriado em 12/10/2026'`);
  assert.match(await corpoModal(), /Nossa Senhora AparecidaNacional/);
  await b.tecla('Escape', 'Escape', 27);
  assert.equal(await b.avaliar(`App.estado.feriados['2026-10-12']`), 'Nossa Senhora Aparecida');
  ok('clicar num feriado nacional mostra o nome e a etiqueta "Nacional" sem mudar nada');

  // 6c. Pela tela "Feriados": um que repete todo ano e um só deste ano
  await clicar('#bt-feriados');
  await b.esperarAte(`!!document.querySelector('#fe-repetir')`);
  const incluir = async (d, nome, repetir) => {
    await b.avaliar(`(() => { document.querySelector('#fe-data').value = '${d}'; document.querySelector('#fe-nome').value = ${JSON.stringify(nome)}; document.querySelector('#fe-repetir').checked = ${repetir}; })()`);
    await clicar('#fe-add');
    await esperar(60);
  };
  await incluir('2026-12-08', 'Imaculada Conceição (teste)', true);
  await incluir('2026-12-24', 'Ponto facultativo (teste)', false);
  assert.equal(await b.avaliar(`document.querySelector('#fe-repetir').checked`), true, '"Repete todo ano" volta marcado depois de incluir');
  assert.equal(await b.avaliar(`(() => { const l = document.querySelector('#fe-lista'), r = l.querySelector('[data-rem="2026-12-24"]').closest('.fe-item').getBoundingClientRect(), c = l.getBoundingClientRect(); return r.top >= c.top && r.bottom <= c.bottom + 1; })()`), true, 'o feriado incluído fica visível na lista');
  const linha = d => b.avaliar(`[...document.querySelectorAll('#fe-lista .fe-item')].find(x => x.querySelector('[data-rem="${d}"]'))?.textContent || ''`);
  assert.match(await linha('2026-12-08'), /Imaculada Conceição \(teste\)Todo anoTirar só de 2026Parar de repetir/);
  assert.match(await linha('2026-12-24'), /Ponto facultativo \(teste\)Só em 2026Remover/);
  assert.match(await linha('2026-10-12'), /Nossa Senhora AparecidaNacionalRemover/);
  assert.equal(await banco(G), 2);
  await b.foto(join(FOTOS, '04d-lista-de-feriados.png'));
  await clicar('#fe-prox');
  assert.equal(await b.avaliar(`document.querySelector('#fe-ano').textContent`), '2027');
  assert.match(await linha('2027-12-08'), /Imaculada Conceição \(teste\)Todo ano/);
  assert.equal(await linha('2027-12-24'), '');
  await clicar('#fe-prox');
  assert.match(await linha('2028-12-08'), /Todo ano/);
  ok('tela Feriados: o que repete aparece em 2027 e 2028 sem cadastrar de novo; o "só deste ano" não');

  await clicar('#fe-ant');
  await clicar('#fe-ant');
  await clicar('[data-rem="2026-12-24"]');
  await esperar(60);
  await clicar('[data-rem="2026-12-08"]');
  await esperar(60);
  assert.equal(await b.avaliar(`App.estado.feriados['2026-12-08']`), undefined);
  assert.equal(await b.avaliar(`App.estado.feriados['2027-12-08']`), 'Imaculada Conceição (teste)');
  assert.equal(await b.avaliar(`App.estado.feriados['2026-12-24']`), undefined);
  await clicarTexto('Fechar');
  ok('"Tirar só de 2026" tira só daquele ano; nos anos seguintes ele continua');

  // 7. Extrato
  await clicar(`[data-extrato="${await id(A)}"]`);
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === ${JSON.stringify(A)}`);
  const movs = await b.avaliar(`[...document.querySelectorAll('.tabela.ext tbody tr')].map(tr => [...tr.children].map(td => td.textContent).join(' | '))`);
  assert.deepEqual(movs, [
    '10/10/2026 | Folga usada do banco | −1 | 1',
    '09/10/2026 | 7º dia trabalhado | +1 | 2',
    '02/10/2026 | 7º dia trabalhado | +1 | 1',
  ]);
  await b.foto(join(FOTOS, '05-extrato.png'));
  await b.tecla('Escape', 'Escape', 27);
  ok('extrato do banco mostra cada entrada e saída com o saldo');

  // 8. Cadastro: saldo inicial e inativar
  await clicar('#bt-motoristas');
  await b.esperarAte(`!!document.querySelector('#mt-corpo tr[data-id]')`);
  await b.avaliar(`(() => {
    const tr = document.querySelector('#mt-corpo tr[data-id="${await id(G)}"]');
    const banco = tr.querySelector('[data-campo="bancoInicial"]'); banco.value = '3'; banco.dispatchEvent(new Event('change', { bubbles: true }));
    const ativo = document.querySelector('#mt-corpo tr[data-id="${await id(H)}"] [data-campo="ativo"]'); ativo.checked = false; ativo.dispatchEvent(new Event('change', { bubbles: true }));
  })()`);
  await b.foto(join(FOTOS, '06-motoristas.png'));
  await clicarTexto('Fechar');
  assert.equal(await banco(G), 5);
  assert.equal(await b.avaliar(`document.querySelectorAll('#grade tbody tr[data-id]').length`), 75);
  ok('saldo inicial de 3 folgas somou no banco (2→5) e motorista inativo saiu da tela');

  // 9. Busca e troca de período
  const buscar = t => b.avaliar(`(() => { const i = document.querySelector('#busca'); i.value = ${JSON.stringify(t)}; i.dispatchEvent(new Event('input')); })()`);
  await buscar('anderson');
  await esperar(250);
  assert.equal(await b.avaliar(`document.querySelectorAll('#grade tbody tr[data-id]').length`), 3);
  await buscar('');
  await esperar(250);
  await clicar('#comp-prox');
  assert.equal(await b.avaliar(`document.querySelector('#comp-rotulo').textContent + ' ' + document.querySelector('#comp-datas').textContent`), 'Nov/2026 26/10/2026 a 25/11/2026');
  assert.equal(await b.avaliar(`document.querySelectorAll('#grade tbody tr:first-child td.cel.futuro').length`), 31);
  await clicar('#comp-atual');
  assert.equal(await b.avaliar(`document.querySelector('#comp-rotulo').textContent`), 'Out/2026');
  ok('busca por nome e navegação entre períodos funcionam');

  // 10. Backup: salvar
  assert.equal(await b.avaliar(`document.querySelector('#status-backup').classList.contains('pend')`), true);
  await b.enviar('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await clicar('#bt-salvar');
  let arquivo;
  for (let i = 0; i < 50 && !arquivo; i++) { await esperar(100); arquivo = readdirSync(downloads).find(f => f.endsWith('.json')); }
  assert.ok(arquivo, 'backup não foi baixado');
  assert.match(arquivo, /^folgas-bwa_\d{4}-\d{2}-\d{2}_\d{4}\.json$/);
  const backup = JSON.parse(readFileSync(join(downloads, arquivo), 'utf8'));
  assert.equal(backup.app, 'controle-folgas-bwa');
  assert.equal(backup.motoristas.length, 76);
  assert.equal(backup.versao, 2);
  assert.deepEqual(backup.feriadosFixos.find(r => r.dia === '12-08'), { dia: '12-08', nome: 'Imaculada Conceição (teste)', desde: 2026 });
  assert.equal(backup.feriados['2027-12-08'], 'Imaculada Conceição (teste)');
  assert.equal(await b.avaliar(`document.querySelector('#status-backup').classList.contains('ok')`), true);
  ok(`backup salvo (${arquivo}, ${Math.round(readFileSync(join(downloads, arquivo)).length / 1024)} KB) e o aviso mudou para "Backup em dia"`);

  // 11. Recarregar a página: dados continuam no navegador
  await b.recarregar();
  assert.equal(await b.avaliar(`document.querySelectorAll('#modais .modal-fundo').length`), 0);
  assert.equal(await banco(A), 1);
  assert.equal(await banco(G), 5);
  ok('depois de recarregar, os dados continuam e não aparece o aviso de dados vazios');

  // 12. Carregar um backup mais antigo que os dados atuais
  await marcar(B, '2026-10-05', 'F');
  assert.equal(await banco(B), 0);
  await b.enviarArquivo('#in-backup', join(downloads, arquivo));
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Carregar este backup?'`);
  const aviso = await b.avaliar(`document.querySelector('#modais .modal-corpo').textContent`);
  assert.match(aviso, /mais antigo que os dados abertos agora/);
  assert.match(aviso, /ainda não foram salvas em backup/);
  await b.foto(join(FOTOS, '07-backup-antigo.png'));
  await clicarTexto('Carregar mesmo assim');
  await esperar(100);
  assert.equal(await banco(B), 1);
  ok('ao abrir backup mais antigo, o sistema avisa antes de substituir os dados');

  // 13. Navegador limpo (como se o cache tivesse sido apagado) + restaurar backup
  await b.avaliar(`localStorage.clear()`);
  await b.recarregar();
  assert.equal(await tituloModal(), 'Nenhum dado neste navegador');
  await b.enviarArquivo('#in-backup', join(downloads, arquivo));
  await b.esperarAte(`App.estado.motoristas.length === 76`);
  assert.equal(await banco(A), 1);
  assert.equal(await banco(C), 0);
  assert.equal(await banco(G), 5);
  assert.equal(await b.avaliar(`document.querySelectorAll('#modais .modal-fundo').length`), 0);
  assert.equal(await b.avaliar(`App.estado.feriadosFixos.some(r => r.dia === '12-08')`), true);
  assert.equal(await b.avaliar(`App.estado.feriados['2027-12-08']`), 'Imaculada Conceição (teste)');
  ok('cache apagado: o backup restaurou tudo (76 motoristas, lançamentos e saldos)');

  // 14. Arquivo inválido
  const falso = join(downloads, 'nao-e-backup.json');
  writeFileSync(falso, '{"qualquer": 1}');
  await b.enviarArquivo('#in-backup', falso);
  await b.esperarAte(`document.querySelector('#modais h2')?.textContent === 'Não foi possível abrir o backup'`);
  assert.match(await b.avaliar(`document.querySelector('#modais .modal-corpo').textContent`), /não é um backup do Controle de Folgas/);
  await clicarTexto('Entendi');
  assert.equal(await b.avaliar(`App.estado.motoristas.length`), 76);
  ok('arquivo que não é backup é recusado sem mexer nos dados');

  // 14b. Backup salvo pela versão anterior do sistema (versão 1, sem feriados que repetem)
  const antigo = Object.assign({}, backup, { versao: 1 });
  delete antigo.feriadosFixos;
  const arqAntigo = join(downloads, 'folgas-bwa_versao-1.json');
  writeFileSync(arqAntigo, JSON.stringify(antigo));
  await b.enviarArquivo('#in-backup', arqAntigo);
  await b.esperarAte(`App.estado.feriadosFixos.length === 0`);
  assert.equal(await b.avaliar(`App.estado.versao`), 2);
  assert.equal(await b.avaliar(`App.estado.motoristas.length`), 76);
  assert.equal(await banco(A), 1);
  assert.equal(await banco(G), 5);
  assert.equal(await b.avaliar(`App.estado.feriados['2027-12-08']`), 'Imaculada Conceição (teste)');
  ok('backup da versão anterior (sem feriados que repetem) abre normalmente e é atualizado');

  // 15. Tela de notebook (1366x768)
  await b.enviar('Emulation.setDeviceMetricsOverride', { width: 1366, height: 768, deviceScaleFactor: 1, mobile: false });
  await b.recarregar();
  await b.foto(join(FOTOS, '08-notebook-1366.png'));
  assert.equal(await b.avaliar(`document.documentElement.scrollWidth <= window.innerWidth`), true);
  ok('em tela de notebook a página não rola para o lado (só a grade rola)');

  assert.deepEqual(b.errosJs, []);
  ok('nenhum erro de JavaScript no console');
  console.log(`\nTodos os ${passo} passos passaram. Fotos em: ${FOTOS}`);
} catch (e) {
  await b.foto(join(FOTOS, 'erro.png')).catch(() => {});
  console.error('\n✘ FALHOU no passo', passo + 1, '\n', e);
  if (b.errosJs.length) console.error('Erros de JavaScript:', b.errosJs);
  process.exitCode = 1;
} finally {
  await b.fechar();
  rmSync(downloads, { recursive: true, force: true });
}
