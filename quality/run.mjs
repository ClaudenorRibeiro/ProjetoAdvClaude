import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { contarPulados } from './pulados.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const perfil = process.argv.includes('--profundo') ? 'profundo'
  : process.argv.includes('--completo') ? 'completo' : 'rapido';
const resultados = [];

// Tudo o que a bateria escreve na tela também vai para um arquivo (quality/test-results/ultima-bateria.txt, fora do Git):
// se a janela fechar ou a tela rolar, o resultado completo continua guardado. Escrita síncrona: nada se perde nem com process.exit().
const arquivoDaBateria = path.join(raiz, 'quality', 'test-results', 'ultima-bateria.txt');
try {
  fs.mkdirSync(path.dirname(arquivoDaBateria), { recursive: true });
  fs.writeFileSync(arquivoDaBateria, `Bateria iniciada em ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (perfil: ${perfil})\n\n`);
  const escreverNaTela = process.stdout.write.bind(process.stdout);
  process.stdout.write = (pedaco, ...resto) => {
    try { fs.appendFileSync(arquivoDaBateria, pedaco); } catch { /* o arquivo é só uma cópia: nunca derruba a bateria */ }
    return escreverNaTela(pedaco, ...resto);
  };
} catch { /* sem pasta para gravar: segue só com a tela */ }

// Roda um comando mostrando a saída em tempo real (como antes) e, nos comandos de teste,
// lê essa mesma saída para reprovar se algum teste foi pulado.
async function comando(binario, args, cwd, nome, obrigatorio = true, ehTeste = false) {
  const inicio = Date.now();
  let executavel = binario;
  let argumentos = args;
  if (process.platform === 'win32' && binario === 'npm') {
    const npmCli = process.env.npm_execpath
      || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (!fs.existsSync(npmCli)) throw new Error(`npm-cli.js não encontrado em ${npmCli}`);
    executavel = process.execPath;
    argumentos = [npmCli, ...args];
  }
  const segundos = () => ((Date.now() - inicio) / 1000).toFixed(1);
  const { status, erro, saida } = await new Promise((resolver) => {
    let texto = '';
    const filho = spawn(executavel, argumentos, {
      cwd: path.join(raiz, cwd),
      stdio: ['inherit', 'pipe', 'inherit'],
      env: { ...process.env },
      shell: false,
    });
    filho.stdout.on('data', (pedaco) => { process.stdout.write(pedaco); texto += pedaco.toString('utf8'); });
    filho.on('error', (e) => resolver({ status: null, erro: e, saida: texto }));
    filho.on('close', (codigo) => resolver({ status: codigo, erro: null, saida: texto }));
  });
  if (erro) {
    resultados.push({ nome, ok: false, segundos: segundos(), obrigatorio });
    console.error(`${nome}: ${erro.message}`);
    return false;
  }
  let ok = status === 0;
  let rotulo = nome;
  if (ok && ehTeste) {
    const pulados = contarPulados(saida);
    if (pulados > 0) {
      ok = false;
      rotulo = `${nome} — REPROVADO: ${pulados} teste(s) PULADO(S) (pulado = não verificado)`;
    }
  }
  resultados.push({ nome: rotulo, ok, segundos: segundos(), obrigatorio });
  return ok;
}

function preflight() {
  const arquivos = [];
  function visitar(pasta) {
    for (const item of fs.readdirSync(pasta, { withFileTypes: true })) {
      if (['node_modules', 'build', 'test-results', '.git'].includes(item.name)) continue;
      const alvo = path.join(pasta, item.name);
      if (item.isDirectory()) visitar(alvo);
      else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(item.name)) arquivos.push(alvo);
    }
  }
  visitar(path.join(raiz, 'backend', 'tests'));
  visitar(path.join(raiz, 'frontend', 'src'));
  visitar(path.join(raiz, 'frontend', 'e2e'));
  if (arquivos.length < 10) throw new Error(`Bateria incompleta: só ${arquivos.length} arquivos de teste foram encontrados.`);
  const proibidos = [];
  for (const arquivo of arquivos) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    if (/\b(?:test|it|describe|suite|t|testInfo)\.(?:only|skip|todo|fixme)\s*\(|[{,]\s*(?:skip|todo)\s*:/.test(texto)) proibidos.push(path.relative(raiz, arquivo));
  }
  if (proibidos.length) throw new Error(`Há testes isolados/ignorados: ${proibidos.join(', ')}`);

  const estrutura = fs.readFileSync(path.join(raiz, 'estrutura_banco.sql'), 'utf8');
  const declaradas = Number(estrutura.match(/Contém\s+(\d+)\s+tabelas/i)?.[1]);
  const reais = (estrutura.match(/^CREATE TABLE/gm) || []).length;
  if (declaradas !== reais) throw new Error(`estrutura_banco.sql declara ${declaradas} tabelas, mas contém ${reais}.`);
  resultados.push({ nome: `Preflight (${arquivos.length} arquivos de teste; ${reais} tabelas)`, ok: true, segundos: '0.0', obrigatorio: true });
}

// Contagem de vulnerabilidades das dependências de produção — SÓ informativa, roda em
// TODO perfil (inclusive --rapido) e nunca reprova a bateria: um aviso novo publicado por
// terceiros não pode travar o trabalho (decisão do usuário 24/09). O --profundo já tem,
// mais abaixo, uma checagem própria e mais rígida (--audit-level=high, essa sim obrigatória).
function auditarDependenciasProducao() {
  function contar(pastaLabel, pasta) {
    // Mesma resolução do npm no Windows usada em comando() acima (sem shell:true).
    let executavel = 'npm';
    let argumentos = ['audit', '--omit=dev', '--json'];
    if (process.platform === 'win32') {
      const npmCli = process.env.npm_execpath
        || path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
      if (fs.existsSync(npmCli)) {
        executavel = process.execPath;
        argumentos = [npmCli, ...argumentos];
      }
    }
    const r = spawnSync(executavel, argumentos, { cwd: path.join(raiz, pasta), encoding: 'utf8' });
    try {
      const j = JSON.parse(r.stdout);
      const v = j.metadata.vulnerabilities;
      if (v.total === 0) return `${pastaLabel}: nenhuma`;
      return `${pastaLabel}: ${v.total} (${v.critical} crítica, ${v.high} alta, ${v.moderate} média, ${v.low} baixa)`;
    } catch {
      return `${pastaLabel}: não verificado (npm audit falhou ao rodar)`;
    }
  }
  const texto = `${contar('backend', 'backend')}  |  ${contar('frontend', 'frontend')}`;
  resultados.push({ nome: `npm audit (produção) — ${texto}`, ok: true, segundos: '0.0', obrigatorio: false, info: true });
}

function imprimirResumo() {
  console.log('\nRESUMO DA BATERIA');
  console.log('='.repeat(72));
  for (const r of resultados) {
    const marca = r.info ? 'INFO ' : (r.ok ? 'OK   ' : 'FALHA');
    console.log(`${marca} ${r.nome} (${r.segundos}s)`);
  }
  console.log('='.repeat(72));
  const etapas = resultados.filter(r => !r.info);
  console.log(`Perfil: ${perfil} | ${etapas.filter(r => r.ok).length}/${etapas.length} etapas aprovadas`);
}

// A bateria prepara o que precisa em vez de pular testes: instala as dependências do npm
// (rápido quando já estão em dia) e, nos perfis com navegador, baixa o Chromium de teste.
async function prepararFerramentas() {
  await comando('npm', ['install', '--no-audit', '--no-fund'], 'backend', 'Preparar: dependências do backend');
  await comando('npm', ['install', '--no-audit', '--no-fund'], 'frontend', 'Preparar: dependências do frontend');
  if (perfil === 'completo' || perfil === 'profundo') {
    await comando('npm', ['exec', '--', 'playwright', 'install', 'chromium'], 'frontend', 'Preparar: navegador Chromium de teste');
  }
}

try {
  preflight();
  await prepararFerramentas();
  await comando('npm', ['test'], 'backend', 'Backend: unidade, contratos e rotas sem token', true, true);
  await comando(process.execPath, ['quality/check-backend-load.js'], '.', 'Backend: todos os módulos carregam');
  await comando(process.execPath, ['quality/check-tamanho-relatorios.js'], '.', 'Relatórios: nenhum arquivo passa de 300 linhas');
  await comando(process.execPath, ['quality/check-nomes-indefinidos.mjs'], '.', 'Código: nenhum nome indefinido (frontend e backend)');
  await comando('npm', ['test'], 'frontend', 'Frontend: regras e formatadores', true, true);
  await comando('npm', ['run', 'build'], 'frontend', 'Build de produção do frontend');
  auditarDependenciasProducao();

  if (perfil === 'completo' || perfil === 'profundo') {
    await comando('npm', ['run', 'test:integration'], 'backend', 'API + MySQL isolado + permissões + transações', true, true);
    await comando('npm', ['run', 'test:e2e:critical'], 'frontend', 'Navegador Chromium: fluxos críticos e acessibilidade', true, true);
  }

  if (perfil === 'profundo') {
    await comando('npm', ['run', 'test:coverage'], 'backend', 'Cobertura backend', true, true);
    await comando('npm', ['run', 'test:coverage'], 'frontend', 'Cobertura frontend', true, true);
    await comando('npm', ['run', 'test:e2e'], 'frontend', 'Navegadores e tamanhos de tela', true, true);
    await comando('npm', ['run', 'test:mutation'], 'frontend', 'Mutação: qualidade dos próprios testes');
    await comando('npm', ['audit', '--omit=dev', '--audit-level=high'], 'backend', 'Dependências de produção do backend');
    await comando('npm', ['audit', '--omit=dev', '--audit-level=high'], 'frontend', 'Dependências de produção do frontend');
  }
  imprimirResumo();
  if (resultados.some(r => r.obrigatorio && !r.ok)) process.exit(1);
} catch (erro) {
  resultados.push({ nome: erro.message, ok: false, segundos: '0.0', obrigatorio: true });
  imprimirResumo();
  process.exit(1);
}
