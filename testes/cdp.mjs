// Cliente mínimo do Chrome DevTools Protocol (sem dependências) para os testes no navegador.
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const esperar = ms => new Promise(r => setTimeout(r, ms));

export async function abrirChrome({ largura = 1500, altura = 950 } = {}) {
  const perfil = mkdtempSync(join(tmpdir(), 'folgas-e2e-'));
  const bin = ['/usr/bin/google-chrome-stable', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync);
  if (!bin) throw new Error('Chrome não encontrado');
  const proc = spawn(bin, [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', `--window-size=${largura},${altura}`, 'about:blank',
  ], { stdio: 'ignore' });

  let porta;
  for (let i = 0; i < 150 && !porta; i++) {
    await esperar(100);
    try { porta = readFileSync(join(perfil, 'DevToolsActivePort'), 'utf8').split('\n')[0]; } catch { /* ainda subindo */ }
  }
  if (!porta) throw new Error('Chrome não respondeu');
  const alvos = await (await fetch(`http://127.0.0.1:${porta}/json/list`)).json();
  const pagina = alvos.find(a => a.type === 'page');
  const ws = new WebSocket(pagina.webSocketDebuggerUrl);
  await new Promise((ok, erro) => { ws.onopen = ok; ws.onerror = erro; });

  let seq = 0;
  const pendentes = new Map();
  const ouvintes = new Set();
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pendentes.has(msg.id)) {
      const { ok, erro } = pendentes.get(msg.id);
      pendentes.delete(msg.id);
      msg.error ? erro(new Error(msg.error.message)) : ok(msg.result);
    } else if (msg.method) for (const f of ouvintes) f(msg);
  };
  const enviar = (method, params = {}) => new Promise((ok, erro) => {
    const id = ++seq;
    pendentes.set(id, { ok, erro });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const proximo = (method, ms = 10000) => new Promise((ok, erro) => {
    const t = setTimeout(() => { ouvintes.delete(f); erro(new Error('tempo esgotado esperando ' + method)); }, ms);
    const f = msg => { if (msg.method === method) { clearTimeout(t); ouvintes.delete(f); ok(msg.params); } };
    ouvintes.add(f);
  });

  const errosJs = [];
  ouvintes.add(msg => {
    if (msg.method === 'Runtime.exceptionThrown') errosJs.push(msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') errosJs.push(msg.params.args.map(a => a.value ?? a.description).join(' '));
    if (msg.method === 'Page.javascriptDialogOpening') enviar('Page.handleJavaScriptDialog', { accept: true });
  });
  await enviar('Page.enable');
  await enviar('Runtime.enable');

  async function avaliar(expr) {
    const r = await enviar('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error('Erro no navegador: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async function ir(url) {
    const carregou = proximo('Page.loadEventFired');
    await enviar('Page.navigate', { url });
    await carregou;
    await esperar(150);
  }
  async function recarregar() {
    const carregou = proximo('Page.loadEventFired');
    await enviar('Page.reload', { ignoreCache: true });
    await carregou;
    await esperar(150);
  }
  async function esperarAte(expr, ms = 8000) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      if (await avaliar(expr)) return true;
      await esperar(80);
    }
    throw new Error('Condição não atingida: ' + expr);
  }
  async function enviarArquivo(seletor, caminho) {
    const { root } = await enviar('DOM.getDocument', { depth: 0 });
    const { nodeId } = await enviar('DOM.querySelector', { nodeId: root.nodeId, selector: seletor });
    if (!nodeId) throw new Error('Não achei ' + seletor);
    await enviar('DOM.setFileInputFiles', { nodeId, files: [caminho] });
  }
  async function tecla(key, code, vk) {
    await enviar('Input.dispatchKeyEvent', { type: 'keyDown', key, code, windowsVirtualKeyCode: vk, text: key.length === 1 ? key : undefined });
    await enviar('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
  }
  async function foto(caminho) {
    const { data } = await enviar('Page.captureScreenshot', { format: 'png' });
    const { writeFileSync } = await import('node:fs');
    writeFileSync(caminho, Buffer.from(data, 'base64'));
  }
  async function fechar() {
    try { await enviar('Browser.close'); } catch { /* já fechou */ }
    ws.close();
    proc.kill();
    await esperar(200);
    rmSync(perfil, { recursive: true, force: true });
  }
  return { enviar, avaliar, ir, recarregar, esperarAte, enviarArquivo, tecla, foto, fechar, errosJs };
}
