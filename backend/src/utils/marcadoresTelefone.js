// Marcadores de canal nos telefones (whatsapp / sms): o banco só aceita UM número ativo marcado de cada por pessoa.
// Ao unir cadastros duplicados, os telefones dos duplicados vão para o principal: o principal manda; se ele não tem o marcador,
// herda o do duplicado mais antigo que tiver; os demais perdem a marca (os números continuam, só deixam de ser o "canal").
const TABELAS = ['telefones_pf', 'telefones_pj'];   // nomes fixos

async function consolidarMarcadoresTelefone(conn, tabela, principalId, duplicados) {
  if (!TABELAS.includes(tabela) || !duplicados.length) return;
  const ph = duplicados.map(() => '?').join(', ');
  for (const coluna of ['whatsapp', 'sms']) {
    const [[principal]] = await conn.execute(`SELECT COUNT(*) AS n FROM ${tabela} WHERE pessoa_id = ? AND ativo = 1 AND ${coluna} = 1`, [principalId]);
    let ficaComId = null;
    if (!principal.n) {
      const [[primeiro]] = await conn.execute(`SELECT MIN(id) AS id FROM ${tabela} WHERE pessoa_id IN (${ph}) AND ativo = 1 AND ${coluna} = 1`, duplicados);
      ficaComId = primeiro.id;
    }
    await conn.execute(`UPDATE ${tabela} SET ${coluna} = 0 WHERE pessoa_id IN (${ph}) AND ${coluna} = 1 AND (? IS NULL OR id <> ?)`, [...duplicados, ficaComId, ficaComId]);
  }
}

module.exports = { consolidarMarcadoresTelefone };
