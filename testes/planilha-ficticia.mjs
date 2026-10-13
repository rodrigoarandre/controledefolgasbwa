// Gera uma planilha .xlsx com motoristas FICTÍCIOS para os testes.
// A planilha real da BWA tem dados pessoais e fica fora do repositório (ver .gitignore).
// O formato imita a real: uma aba de histórico com mais nomes, e a aba "BWA" com o cabeçalho
// "Motoristas BWA - Atual", número na coluna B, nome na coluna C e observação depois do hífen.
import { deflateRawSync, crc32 } from 'node:zlib';

// Nomes com papel definido nos testes (em maiúsculas, como na planilha real).
const ESPECIAIS = [
  'ABEL DUARTE MOREIRA ',
  'ACÁCIO PRADO NUNES - Instrutor',
  'ADRIANO TELES CAMPOS',
  'AFONSO BRANDÃO LACERDA',
  'ALCEU VASCONCELOS ROCHA',
  'ANDERSON QUINTELA BARROS',
  'ANDRÉ SALDANHA PIRES',
  'ANDERSON MATOS VELASCO',
  'ANDERSON RANGEL TAVARES',
  'CAETANO FERRAZ DA COSTA - Afastado INSS',
  'DÉCIO MOURA PAIVA – ESCOLINHA',
  'ÉRICO FONTES GUSMÃO - ESCOLINHA',
  'TOMÁS AGUIAR DE BRITO\n',
];
const PRIMEIROS = ['BALTAZAR', 'BENTO', 'BERNARDO', 'CAIO', 'CELSO', 'CIRILO', 'DAVI', 'DIMAS', 'EDSON', 'ELIAS', 'FAUSTO',
  'FELIPE', 'GASPAR', 'GILSON', 'HEITOR', 'HUGO', 'IVO', 'JAIRO', 'LEANDRO', 'LÚCIO', 'MÁRCIO'];
const SOBRENOMES = ['ARRUDA MELO', 'BASTOS FARIA', 'CARDOSO NEVES', 'DANTAS RAMOS', 'ESTEVES PRADO',
  'FREITAS LOBO', 'GUERRA DA SILVA', 'HOLANDA REIS', 'JARDIM COUTO', 'LEMOS DE ANDRADE'];

// 13 especiais + 21 × 3 combinações = 76 motoristas, como na planilha real.
export const MOTORISTAS_FICTICIOS = [
  ...ESPECIAIS,
  ...PRIMEIROS.flatMap((p, i) => [0, 1, 2].map(k => `${p} ${SOBRENOMES[(i * 3 + k) % SOBRENOMES.length]}`)),
].sort((a, b) => a.localeCompare(b, 'pt-BR'));

const EX_MOTORISTAS = ['OTÁVIO PENHA SALES', 'PEDRO LUZ MACHADO', 'RAUL TORRES BUENO', 'SILAS VIANA CRUZ'];

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const letra = c => String.fromCharCode(65 + c);

function montarAba(linhas, textos) {
  const indice = s => { let i = textos.indexOf(s); if (i < 0) { i = textos.length; textos.push(s); } return i; };
  const xmlLinhas = linhas.map((cels, r) => `<row r="${r + 1}">` + cels.map((v, c) => v == null ? '' :
    `<c r="${letra(c)}${r + 1}" t="s"><v>${indice(v)}</v></c>`).join('') + '</row>').join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${xmlLinhas}</sheetData></worksheet>`;
}

function zip(arquivos) {
  const partes = [], central = [];
  let pos = 0;
  for (const [nome, texto] of arquivos) {
    const n = Buffer.from(nome, 'utf8'), dados = Buffer.from(texto, 'utf8'), comp = deflateRawSync(dados), crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(n.length, 26);
    partes.push(local, n, comp);
    const cab = Buffer.alloc(46);
    cab.writeUInt32LE(0x02014b50, 0); cab.writeUInt16LE(20, 4); cab.writeUInt16LE(20, 6); cab.writeUInt16LE(0x0800, 8); cab.writeUInt16LE(8, 10);
    cab.writeUInt32LE(crc, 16); cab.writeUInt32LE(comp.length, 20); cab.writeUInt32LE(dados.length, 24); cab.writeUInt16LE(n.length, 28); cab.writeUInt32LE(pos, 42);
    central.push(cab, n);
    pos += 30 + n.length + comp.length;
  }
  const dir = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(arquivos.length, 8); fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(dir.length, 12); fim.writeUInt32LE(pos, 16);
  return Buffer.concat([...partes, dir, fim]);
}

export function gerarPlanilha() {
  const textos = [];
  // Aba de histórico (vem antes, como as abas mensais da planilha real) com MAIS nomes que a atual:
  // o sistema precisa escolher a aba "BWA" pelo cabeçalho "Atual", não pela quantidade de nomes.
  const historico = montarAba([
    ['Cargo', 'Nome', 'Salário'],
    ...[...MOTORISTAS_FICTICIOS, ...EX_MOTORISTAS].map(n => ['MOTORISTA DE CAMINHÃO', n.split(' - ')[0].split(' – ')[0].trim(), '1000']),
  ], textos);
  const atual = montarAba([
    [null, 'N°', 'Motoristas BWA - Atual (lista fictícia para testes)'],
    ...MOTORISTAS_FICTICIOS.map((n, i) => [null, String(i + 1).padStart(2, '0'), n]),
  ], textos);
  const strings = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="${textos.length}" uniqueCount="${textos.length}">` +
    textos.map(t => `<si><t xml:space="preserve">${esc(t)}</t></si>`).join('') + '</sst>';
  return zip([
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      '<sheet name="historico" sheetId="1" r:id="rId1"/><sheet name="BWA" sheetId="2" r:id="rId2"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'],
    ['xl/worksheets/sheet1.xml', historico],
    ['xl/worksheets/sheet2.xml', atual],
    ['xl/sharedStrings.xml', strings],
  ]);
}
