import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const perfil = process.argv.includes('--profundo') ? 'profundo'
  : process.argv.includes('--completo') ? 'completo' : 'rapido';
const resultados = [];

function comando(binario, args, cwd, nome, obrigatorio = true) {
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
  const r = spawnSync(executavel, argumentos, {
    cwd: path.join(raiz, cwd),
    stdio: 'inherit',
    env: { ...process.env },
    shell: false,
  });
  if (r.error) {
    resultados.push({ nome, ok: false, segundos: ((Date.now() - inicio) / 1000).toFixed(1), obrigatorio });
    console.error(`${nome}: ${r.error.message}`);
    return false;
  }
  const ok = r.status === 0;
  resultados.push({ nome, ok, segundos: ((Date.now() - inicio) / 1000).toFixed(1), obrigatorio });
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
    if (/\b(?:test|it|describe)\.(?:only|skip)\s*\(/.test(texto)) proibidos.push(path.relative(raiz, arquivo));
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

try {
  preflight();
  comando('npm', ['test'], 'backend', 'Backend: unidade, contratos e 293 rotas sem token');
  comando(process.execPath, ['quality/check-backend-load.js'], '.', 'Backend: todos os módulos carregam');
  comando('npm', ['test'], 'frontend', 'Frontend: regras e formatadores');
  comando('npm', ['run', 'build'], 'frontend', 'Build de produção do frontend');
  auditarDependenciasProducao();

  if (perfil === 'completo' || perfil === 'profundo') {
    comando('npm', ['run', 'test:integration'], 'backend', 'API + MySQL isolado + permissões + transações');
    comando('npm', ['run', 'test:e2e:critical'], 'frontend', 'Navegador Chromium: fluxos críticos e acessibilidade');
  }

  if (perfil === 'profundo') {
    comando('npm', ['run', 'test:coverage'], 'backend', 'Cobertura backend');
    comando('npm', ['run', 'test:coverage'], 'frontend', 'Cobertura frontend');
    comando('npm', ['run', 'test:e2e'], 'frontend', 'Navegadores e tamanhos de tela');
    comando('npm', ['run', 'test:mutation'], 'frontend', 'Mutação: qualidade dos próprios testes');
    comando('npm', ['audit', '--omit=dev', '--audit-level=high'], 'backend', 'Dependências de produção do backend');
    comando('npm', ['audit', '--omit=dev', '--audit-level=high'], 'frontend', 'Dependências de produção do frontend');
  }
  imprimirResumo();
  if (resultados.some(r => r.obrigatorio && !r.ok)) process.exit(1);
} catch (erro) {
  resultados.push({ nome: erro.message, ok: false, segundos: '0.0', obrigatorio: true });
  imprimirResumo();
  process.exit(1);
}
