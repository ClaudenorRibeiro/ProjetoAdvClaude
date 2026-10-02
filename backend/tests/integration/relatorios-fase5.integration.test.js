// Relatórios (Fase 5) — exportar em PDF e Word contra MySQL real.
// O PDF é lido por dentro com pdfjs-dist (instalado pelo npm, sem programa externo) e o Word é aberto por dentro (zip + XML): conferimos o CONTEÚDO, não só o formato.
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const JSZip = require('jszip');

const { carregarAmbienteTeste } = require('../support/testEnvironment');
const { recriarBancoTeste, conectarBancoTeste } = require('../support/testDatabase');
const { lerPdf } = require('../support/pdfLeitor');

carregarAmbienteTeste();
const { criarApp } = require('../../src/app');
const { pool } = require('../../src/config/database');
const { lerImagemDoGrafico } = require('../../src/services/relatorios/exportadores/png');
const L = require('../../src/services/relatorios/limites');

let app; let usuarios; let semPermissao; let soRelatorios; let giro = 0;
const token = (id, nivel, sessao) => jwt.sign({ id, nome: `Teste ${id}`, nivel, tipo: 'advogado', sessao }, process.env.JWT_SECRET, { expiresIn: '1h' });
// Cada usuário pode exportar 10 vezes por minuto: os testes revezam entre vários para não esbarrar nesse limite
const proximo = () => usuarios[giro++ % usuarios.length];
async function sql(q, params = []) {
  const conn = await conectarBancoTeste();
  try { return (await conn.execute(q, params))[0]; } finally { await conn.end(); }
}
const binario = (res, cb) => { const p = []; res.on('data', c => p.push(c)); res.on('end', () => cb(null, Buffer.concat(p))); };
const exportar = (corpo, t = proximo()) => request(app).post('/api/relatorios/exportar').set('Authorization', `Bearer ${t}`).buffer(true).parse(binario).send(corpo);
const receita = (extra = {}) => ({ assunto: 'financeiro_parcelas', colunas: ['pasta', 'origem', 'vencimento', 'valor_bruto', 'status'], filtros: { op: 'E', itens: [] }, ordem: [{ campo: 'vencimento', direcao: 'asc' }], ...extra });
const AGRUPADA = receita({ colunas: ['pasta'], agrupar: [{ campo: 'status' }], metricas: [{ funcao: 'contagem' }, { funcao: 'soma', campo: 'valor_bruto' }] });

async function abrirDocx(buf) {
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml').async('string');
  const entidades = { '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'", '&amp;': '&' };
  const texto = xml.replace(/<w:tab\/>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&(lt|gt|quot|apos|amp);/g, (e) => entidades[e]).replace(/\s+/g, ' ');
  return { zip, xml, texto, midias: Object.keys(zip.files).filter(n => n.startsWith('word/media/') && !n.endsWith('/')) };
}
function crc32Png(tipo, dados) { const b = Buffer.alloc(4); b.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(tipo), dados])) >>> 0); return b; }
function pngValido(w = 120, h = 60) {
  const chunk = (tipo, dados) => { const t = Buffer.alloc(4); t.writeUInt32BE(dados.length); return Buffer.concat([t, Buffer.from(tipo), dados, crc32Png(tipo, dados)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const linhas = Buffer.alloc((w * 3 + 1) * h, 0x7a);
  for (let y = 0; y < h; y++) linhas[y * (w * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(linhas)), chunk('IEND', Buffer.alloc(0))]);
}
const dataUrl = (png) => `data:image/png;base64,${png.toString('base64')}`;

test.before(async () => {
  await recriarBancoTeste();
  await sql("INSERT INTO conta_financeira (id, nome, tipo, principal, ativo) VALUES (1, 'Caixa', 'especie', 1, 1)");
  await sql("INSERT INTO acordo (id, processo_id, tipo, valor_total, qtd_parcelas, data_primeira, status, criado_por) VALUES (1, 1, 'acordo', 300.50, 3, '2026-01-10', 'ativo', 1), (2, 1, 'alvara', 50, 1, '2026-01-20', 'cancelado', 1)");
  await sql(`INSERT INTO acordo_parcela (id, acordo_id, numero, vencimento, valor_bruto, honor_tipo, honor_valor, valor_liquido, status, observacao) VALUES
    (1, 1, 1, '2026-01-10', 100.00, 'percent', 30.00, 70.00, 'pago', 'Texto <b>com</b> marcação & símbolos ∑ 日本'),
    (2, 1, 2, '2026-02-10', 100.00, 'percent', 30.00, 70.00, 'pago', CONCAT('Controle', CHAR(7), ' aqui')),
    (3, 1, 3, '2999-03-10', 100.50, 'percent', 30.15, 70.35, 'pendente', NULL),
    (4, 2, 1, '2026-01-20', 50.00, 'percent', 0.00, 50.00, 'cancelada', NULL)`);
  const ids = [4, 5, 6, 8, 9, 10, 11];
  for (const id of ids) {
    await sql(`INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo)
               VALUES (?, ?, ?, 'x', ?, 'advogado', 2, 1, 0, ?, 0, 0)`, [id, `Usuário ${id} Ção`, `u${id}`, `u${id}@example.invalid`, `sessao-${id}`]);
    await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (?, 'relatorios', NULL, 'visualizar', 1), (?, 'financeiro', NULL, 'visualizar', 1)", [id, id]);
  }
  await sql("INSERT INTO usuarios (id, nome, login, senha_hash, email, tipo, nivel, ativo, ver_todos_processos, sessao_atual, notif_email, google_agenda_ativo) VALUES (7, 'So Relatorios', 'sorel', 'x', 'sorel@example.invalid', 'advogado', 2, 1, 0, 'sessao-7', 0, 0)");
  await sql("INSERT INTO permissoes (usuario_id, modulo, submodulo, acao, permitido) VALUES (7, 'relatorios', NULL, 'visualizar', 1)");
  app = criarApp();
  usuarios = [token(1, 1, 'sessao-admin'), ...ids.map(id => token(id, 2, `sessao-${id}`))];
  semPermissao = token(3, 2, 'sessao-sem-permissao'); soRelatorios = token(7, 2, 'sessao-7');
});
test.after(async () => pool.end());

test('PDF de lista: abre, tem título, quem gerou, filtros, cabeçalho e os valores em R$ certos', async () => {
  const r = await exportar({ receita: receita(), formato: 'pdf', nome: 'Parcelas do mês' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['content-type'], 'application/pdf');
  assert.equal(r.headers['cache-control'], 'no-store');
  assert.match(decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(r.headers['content-disposition'])[1]), /^Parcelas do mês - \d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(r.body.subarray(0, 5).toString(), '%PDF-');
  const pdf = await lerPdf(r.body);
  const txt = pdf.texto;
  assert.match(txt, /Parcelas do mês/);
  assert.match(txt, /Escritório Automatizado/);
  assert.match(txt, /Gerado por:\s+Usuário \d Ção|Gerado por:\s+Teste|Gerado por:/);
  assert.match(txt, /Total de linhas:\s+4/);
  assert.match(txt, /\(nenhum filtro\)/);
  assert.match(txt, /Acordo 1/); assert.match(txt, /Alvará 1/);
  assert.match(txt, /R\$\s*100,00/); assert.match(txt, /R\$\s*100,50/);
  assert.match(txt, /Recebida/); assert.match(txt, /Cancelada/);
  assert.match(txt, /Página 1 de 1/);
  assert.equal(pdf.paginas, 1);
});

test('Word de lista: abre como .docx, tabela com cabeçalho repetível, mesmos valores e rodapé com página', async () => {
  const r = await exportar({ receita: receita(), formato: 'docx', nome: 'Parcelas' });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /wordprocessingml\.document/);
  assert.match(decodeURIComponent(/filename\*=UTF-8''([^;]+)/.exec(r.headers['content-disposition'])[1]), /\.docx$/);
  const d = await abrirDocx(r.body);
  assert.equal((d.xml.match(/<w:tr[ >]/g) || []).length, 1 + 4);               // cabeçalho + 4 parcelas
  assert.match(d.xml, /<w:tblHeader\/>/);                                       // cabeçalho se repete a cada página
  assert.match(d.texto, /Acordo 1/); assert.match(d.texto, /Alvará 1/);
  assert.match(d.texto, /R\$\s*100,50/); assert.match(d.texto, /Escritório Automatizado/);
  assert.match(d.texto, /Total de linhas: 4/);
  const rodape = await d.zip.file('word/footer1.xml').async('string');
  assert.match(rodape, /PAGE/); assert.match(rodape, /NUMPAGES/);
  assert.doesNotMatch(d.xml, /w:orient="landscape"/);                           // 5 colunas: retrato
});

test('mais de 5 colunas vira paisagem (PDF e Word)', async () => {
  const larga = receita({ colunas: ['pasta', 'origem', 'parcela', 'vencimento', 'valor_bruto', 'honorario', 'status'] });
  const w = await abrirDocx((await exportar({ receita: larga, formato: 'docx' })).body);
  assert.match(w.xml, /w:orient="landscape"/);
  const p = await exportar({ receita: larga, formato: 'pdf' });
  assert.equal((await lerPdf(p.body)).tamanho.largura, 842);   // A4 paisagem
});

test('agrupado: resumo com subtotais/total geral em R$; "incluir os itens" acrescenta a lista; igual ao Excel', async () => {
  const r = await exportar({ receita: AGRUPADA, formato: 'docx' });
  const d = await abrirDocx(r.body);
  assert.match(d.texto, /Resumo/); assert.match(d.texto, /TOTAL GERAL/);
  assert.match(d.texto, /Agrupado por: Status da parcela/);
  assert.match(d.texto, /R\$\s*350,50/);                                        // soma bruta de todas as parcelas
  assert.equal((d.xml.match(/<w:tr[ >]/g) || []).length, 1 + 3 + 1);           // cabeçalho + 3 grupos + total
  assert.doesNotMatch(d.texto, /Itens listados/);
  const com = await abrirDocx((await exportar({ receita: AGRUPADA, formato: 'docx', incluirDetalhes: true })).body);
  assert.match(com.texto, /Itens listados: 4/); assert.match(com.texto, /\bItens\b/);
  const pdf = await exportar({ receita: AGRUPADA, formato: 'pdf', incluirDetalhes: true });
  { const t = (await lerPdf(pdf.body)).texto; assert.match(t, /TOTAL GERAL\s+4\s+R\$\s*350,50/); assert.match(t, /Itens/); }
});

test('gráfico: a imagem PNG entra no PDF e no Word (e só em relatório agrupado)', async () => {
  const png = pngValido(300, 120);
  const w = await exportar({ receita: AGRUPADA, formato: 'docx', grafico: dataUrl(png) });
  assert.equal(w.status, 200);
  const d = await abrirDocx(w.body);
  assert.equal(d.midias.length, 1);
  assert.ok(Buffer.from(await d.zip.file(d.midias[0]).async('nodebuffer')).equals(png));      // a mesma imagem, byte a byte
  const p = await exportar({ receita: AGRUPADA, formato: 'pdf', grafico: dataUrl(png) });
  assert.equal(p.status, 200);
  assert.ok(p.body.length > (await exportar({ receita: AGRUPADA, formato: 'pdf' })).body.length);   // com imagem é maior
  const lista = await abrirDocx((await exportar({ receita: receita(), formato: 'docx', grafico: dataUrl(png) })).body);
  assert.equal(lista.midias.length, 0);                                                        // lista simples ignora o gráfico
});

test('imagem do gráfico inválida é recusada (não é PNG, truncada, enorme, texto solto)', async () => {
  const bom = pngValido(100, 50);
  assert.equal(lerImagemDoGrafico(dataUrl(bom)).largura, 100);                                  // a boa passa
  const ruins = {
    'não é data URL': 'oi', 'jpeg': `data:image/jpeg;base64,${bom.toString('base64')}`, 'sem base64': 'data:image/png;base64,@@@@',
    'assinatura errada': dataUrl(Buffer.concat([Buffer.from('GIF89a'), bom.subarray(6)])), 'truncada (sem fim)': dataUrl(bom.subarray(0, bom.length - 20)),
    'lado enorme': dataUrl(pngValido(7000, 60)), 'minúscula': dataUrl(pngValido(10, 10)), 'número': 123, 'objeto': { a: 1 }, 'vazio': '',
    'gigante': `data:image/png;base64,${'A'.repeat(5 * 1024 * 1024)}`, 'script': 'data:image/png;base64,PHNjcmlwdD4=',
  };
  for (const [nome, grafico] of Object.entries(ruins)) assert.throws(() => lerImagemDoGrafico(grafico), (e) => e.status === 422, nome);
  // e pela API: a recusa chega como 422 com mensagem clara, antes de gerar qualquer arquivo
  const r = await exportar({ receita: AGRUPADA, formato: 'pdf', grafico: 'data:image/png;base64,naoepng' });
  assert.equal(r.status, 422);
  assert.match(JSON.parse(r.body.toString()).mensagem, /imagem do gráfico/i);
  assert.equal((await exportar({ receita: AGRUPADA, formato: 'docx', grafico: { a: 1 } })).status, 422);
});

test('texto do banco é protegido: marcação, símbolos e caracteres de controle não quebram o arquivo', async () => {
  const col = receita({ colunas: ['pasta', 'observacao'], filtros: { op: 'E', itens: [{ campo: 'observacao', operador: 'nao_vazio', valor: null }] } });
  const w = await exportar({ receita: col, formato: 'docx' });
  assert.equal(w.status, 200);
  const d = await abrirDocx(w.body);
  assert.match(d.texto, /Texto <b>com<\/b> marcação & símbolos ∑ 日本/);     // aparece como TEXTO (o XML tem &lt;b&gt;)
  assert.match(d.xml, /&lt;b&gt;com&lt;\/b&gt;/); assert.doesNotMatch(d.xml, /<b>com/);
  assert.doesNotMatch(d.xml, /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);   // sem caracteres proibidos no XML
  const p = await exportar({ receita: col, formato: 'pdf' });
  assert.equal(p.status, 200);
  assert.match((await lerPdf(p.body)).texto, /Texto <b>com<\/b> marcação & símbolos \? \?\?/);   // fonte do PDF: o que não existe vira "?"
});

test('logo e cor do escritório: PNG válido entra no cabeçalho; imagem inválida é ignorada sem derrubar o relatório', async () => {
  const logo = pngValido(200, 80);
  await sql('UPDATE configuracoes_escritorio SET logo_base64 = ?, cor_principal = ? WHERE id = 1', [dataUrl(logo), '#8B0000']);
  const w = await abrirDocx((await exportar({ receita: receita(), formato: 'docx' })).body);
  assert.equal(w.midias.length, 1);
  assert.match(w.xml, /8B0000/);
  assert.equal((await exportar({ receita: receita(), formato: 'pdf' })).status, 200);
  await sql("UPDATE configuracoes_escritorio SET logo_base64 = 'data:image/png;base64,naoépng', cor_principal = '#zzzzzz' WHERE id = 1");
  const sem = await exportar({ receita: receita(), formato: 'docx' });
  assert.equal(sem.status, 200);
  assert.equal((await abrirDocx(sem.body)).midias.length, 0);
});

test('limite de linhas do PDF/Word: recusa com orientação (lista, resumo e itens) e libera quando cabe', async () => {
  const original = L.LIMITE_DOCUMENTO;
  const corpo = async (limite, extra) => { L.LIMITE_DOCUMENTO = limite; return exportar({ formato: 'docx', ...extra }); };
  try {
    const lista = await corpo(3, { receita: receita() });                                         // 4 parcelas > 3
    assert.equal(lista.status, 413);
    assert.match(JSON.parse(lista.body.toString()).mensagem, /Este relatório tem 4 linhas e o máximo para PDF\/Word é 3\. Use o Excel \(até 50\.000 linhas\)/);
    const resumo = await corpo(3, { receita: AGRUPADA });                                          // 3 grupos + total = 4 linhas > 3
    assert.equal(resumo.status, 413);
    assert.match(JSON.parse(resumo.body.toString()).mensagem, /resumo deste relatório tem 4 linhas/);
    assert.equal((await corpo(4, { receita: receita() })).status, 200);                           // exatamente no limite: cabe
    assert.equal((await corpo(4, { receita: AGRUPADA })).status, 200);
    const itens = await corpo(3, { receita: { ...AGRUPADA, agrupar: [{ campo: 'status' }], filtros: { op: 'E', itens: [{ campo: 'status', operador: 'em', valor: ['pago'] }] } }, incluirDetalhes: true });
    assert.equal(itens.status, 200);                                                              // 1 grupo + total = 2 linhas e 2 itens: cabem em 3
    assert.equal((await corpo(3, { receita: AGRUPADA, incluirDetalhes: true })).status, 413);     // resumo (4) não cabe
  } finally { L.LIMITE_DOCUMENTO = original; }
});

test('permissões e formato: sem permissão 403; assunto sem permissão 403; formato desconhecido 422; uso fica no Histórico', async () => {
  for (const f of ['pdf', 'docx']) {
    assert.equal((await exportar({ receita: receita(), formato: f }, semPermissao)).status, 403);
    assert.equal((await exportar({ receita: receita(), formato: f }, soRelatorios)).status, 403);   // pode relatórios, mas não tem Financeiro
  }
  for (const f of ['odt', 'PDF', '../pdf', 'constructor', null]) assert.equal((await exportar({ receita: receita(), formato: f })).status, f === null ? 200 : 422, String(f));
  await sql("DELETE FROM logs_auditoria WHERE acao = 'exportar'");
  await exportar({ receita: receita(), formato: 'pdf' }, usuarios[2]);
  await exportar({ receita: receita(), formato: 'docx' }, usuarios[2]);
  const logs = await sql("SELECT tabela, acao FROM logs_auditoria WHERE usuario_id = 5 AND acao = 'exportar'");
  assert.equal(logs.length, 2);
});
