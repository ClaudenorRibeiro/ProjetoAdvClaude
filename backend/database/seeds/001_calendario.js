// ============================================================
// SEED: CALENDÁRIO — 30 anos de datas
// Pré-cadastra todos os dias de 2024 até 2054
// Sábados e domingos marcados como não úteis
// Feriados são adicionados pelo admin depois
// ============================================================

async function seedCalendario(pool) {
  console.log('📅 Populando tabela de calendário (30 anos)...');

  // Verifica se já foi populado para não duplicar
  const [existente] = await pool.execute('SELECT COUNT(*) as total FROM calendario');
  if (existente[0].total > 0) {
    console.log('   ✓ Calendário já está populado, pulando...');
    return;
  }

  const inicio = new Date('2024-01-01');
  const fim    = new Date('2054-12-31');
  const valores = [];

  // Percorre cada dia do período e determina se é útil ou não
  let atual = new Date(inicio);
  while (atual <= fim) {
    const diaSemana = atual.getDay(); // 0=domingo, 6=sábado
    const ehUtil = (diaSemana !== 0 && diaSemana !== 6) ? 1 : 0;

    // Formata a data para YYYY-MM-DD (formato MySQL)
    const dataFormatada = atual.toISOString().split('T')[0];
    valores.push(`('${dataFormatada}', ${ehUtil})`);

    // Avança um dia
    atual.setDate(atual.getDate() + 1);
  }

  // Insere em blocos de 1000 para não sobrecarregar o banco
  const tamanhoBloco = 1000;
  for (let i = 0; i < valores.length; i += tamanhoBloco) {
    const bloco = valores.slice(i, i + tamanhoBloco).join(',');
    await pool.execute(`INSERT IGNORE INTO calendario (data, dia_util) VALUES ${bloco}`);
  }

  console.log(`   ✓ ${valores.length} dias inseridos no calendário`);
}

module.exports = seedCalendario;
