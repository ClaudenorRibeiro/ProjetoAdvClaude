const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Cobre o recurso "múltiplas OABs por processo" (usuário do sistema ou advogado
// avulso). Confere só o que está versionado no Git: controllers e tela. O script
// SQL que cria a tabela `processo_oabs` fica em scripts/ (pasta ignorada de
// propósito pelo Git, por causa de outros scripts com senha) e nunca chega a
// ser commitado — por isso não é conferido aqui (testes de sessões anteriores
// que dependiam de um arquivo em scripts/ falham sempre neste ambiente).

const raiz = path.join(__dirname, '../../..');
const processosController = fs.readFileSync(path.join(raiz, 'backend/src/controllers/processosController.js'), 'utf8');
const configuracaoController = fs.readFileSync(path.join(raiz, 'backend/src/controllers/configuracaoController.js'), 'utf8');
const audienciasController = fs.readFileSync(path.join(raiz, 'backend/src/controllers/audienciasController.js'), 'utf8');
const manutencaoController = fs.readFileSync(path.join(raiz, 'backend/src/controllers/manutencaoController.js'), 'utf8');
const processosFront = fs.readFileSync(path.join(raiz, 'frontend/src/pages/Processos/Processos.js'), 'utf8');
const estruturaBanco = fs.readFileSync(path.join(raiz, 'estrutura_banco.sql'), 'utf8');

test('estrutura_banco.sql tem a tabela processo_oabs, sem deixar usuário/freela órfão', () => {
  assert.match(estruturaBanco, /CREATE TABLE `processo_oabs`/);
  assert.match(estruturaBanco, /FOREIGN KEY \(`processo_id`\) REFERENCES `tblproc` \(`id`\) ON DELETE CASCADE/);
  assert.match(estruturaBanco, /FOREIGN KEY \(`usuario_id`\) REFERENCES `usuarios` \(`id`\) ON DELETE RESTRICT/);
  assert.match(estruturaBanco, /FOREIGN KEY \(`freela_id`\) REFERENCES `advogados_freela` \(`id`\) ON DELETE RESTRICT/);
  assert.match(estruturaBanco, /CHECK \(\(`usuario_id` IS NULL\) <> \(`freela_id` IS NULL\)\)/);
});

test('criar/editar processo grava e valida a lista de OABs (usuário ou avulso)', () => {
  assert.match(processosController, /async function validarOabsExistem/);
  assert.match(processosController, /INSERT INTO processo_oabs/);
  // criarProcesso e atualizarProcesso: confere existência antes de gravar
  assert.match(processosController, /validarOabsExistem\(conn, oabs\)/);
  // atualizarProcesso: substitui a lista (mesmo padrão já usado para peritos/assuntos)
  assert.match(processosController, /DELETE FROM processo_oabs WHERE processo_id = \?/);
});

test('excluir processo apaga os vínculos de OAB junto (não deixa órfão)', () => {
  const inicio = processosController.indexOf('async function excluirProcesso');
  const fim = processosController.indexOf('async function historicoProcesso', inicio);
  const trecho = processosController.slice(inicio, fim);
  assert.match(trecho, /DELETE FROM processo_oabs\s+WHERE processo_id = \?/);
});

test('auxiliares do processo devolvem os advogados avulsos, para a tela montar a lista', () => {
  assert.match(processosController, /SELECT id, nome, oab FROM advogados_freela ORDER BY nome/);
  assert.match(processosController, /advogados_freela: advogadosFreela\[0\]/);
});

test('excluir usuário e excluir advogado avulso bloqueiam se ainda estiverem numa lista de OABs de processo', () => {
  assert.match(configuracaoController, /\["processo_oabs", "usuario_id"\]/);
  assert.match(configuracaoController, /\["processo_oabs", "criado_por"\]/);
  assert.match(audienciasController, /FROM processo_oabs WHERE freela_id = \?/);
  assert.match(audienciasController, /processo\(s\) na lista de OABs/);
});

test('limpar dados de teste esvazia processo_oabs junto com os processos (senão sobra órfão)', () => {
  assert.match(manutencaoController, /'processo_oabs'/);
});

test('campo antigo "OAB do processo" (texto livre) não é mais usado em nenhuma tela nem controller', () => {
  assert.doesNotMatch(processosFront, /oab_processo/);
  assert.doesNotMatch(processosController, /oab_processo/);
});

test('tela de processo: seletor de OABs só mostra quem já tem OAB e permite cadastrar avulso na hora', () => {
  assert.match(processosFront, /function SeletorOabsProcesso/);
  assert.match(processosFront, /import \{ ModalNovoFreela \} from '\.\.\/Audiencias\/Audiencias'/);
  assert.match(processosFront, /function montarOpcoesAdvogados/);
  // Filtro: só entra quem tem OAB preenchida (usuário do escritório e avulso)
  assert.match(processosFront, /\(dados\.usuarios \|\| \[\]\)\.filter\(u => u\.oab\)/);
  assert.match(processosFront, /\(dados\.advogados_freela \|\| \[\]\)\.filter\(f => f\.oab\)/);
  // Usado nas duas telas (Novo Processo e Editar Processo)
  const usos = processosFront.match(/<SeletorOabsProcesso /g) || [];
  assert.equal(usos.length, 2, 'SeletorOabsProcesso precisa estar em Novo Processo e em Editar Processo');
});

test('tela "Detalhes do Processo" (somente leitura) trava a lista de OABs, sem editar', () => {
  const inicio = processosFront.indexOf('export function ModalEditarProcesso');
  const trecho = processosFront.slice(inicio, inicio + 20000);
  assert.match(trecho, /<SeletorOabsProcesso[^>]*somenteLeitura=\{leitura\}/);
});
