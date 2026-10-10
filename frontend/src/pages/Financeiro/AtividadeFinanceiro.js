// ============================================================
// ATIVIDADE DO FINANCEIRO — "quem fez o quê e quando" (só leitura).
// Duas portas, a mesma tabela: a aba "Atividade" (tudo, com filtros) e o "Histórico do acordo" (só aquele acordo e as parcelas dele).
// Quem vê: permissão Histórico do Financeiro (a tela de permissões já tem a coluna). Os dados vêm do registro geral do sistema.
// ============================================================
import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { financeiroAPI } from '../../services/api';
import { formatarDataHora, formatarNumeroPasta } from '../../utils/formatters';

const POR_PAGINA = 50;
const GRUPOS = [
  ['', 'Todas as ações'], ['lancamentos', 'Lançamentos'], ['acordos', 'Acordos e alvarás'], ['recebimentos', 'Recebimentos'],
  ['repasses', 'Repasses'], ['multas', 'Multas'], ['contas', 'Contas bancárias'],
];

function TabelaAtividade({ registros, mostrarProcesso = true }) {
  if (!registros.length) return <p className="lista-vazia">Nenhuma atividade encontrada</p>;
  return (
    <div className="tabela-wrapper" tabIndex={0} role="region" aria-label="Atividade do Financeiro">
      <table className="tabela">
        <thead>
          <tr><th>Quando</th><th>Quem</th><th>O que foi feito</th>{mostrarProcesso && <th>Processo / Pasta</th>}<th>Registro</th></tr>
        </thead>
        <tbody>
          {registros.map(r => (
            <tr key={r.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{formatarDataHora(r.criado_em)}</td>
              <td>{r.usuario_nome || '—'}</td>
              <td>{r.acao_rotulo}{r.parcela_numero ? ` (parcela ${r.parcela_numero})` : ''}</td>
              {mostrarProcesso && (
                <td style={{ fontSize: 12 }}>
                  {r.processo_numero ? <span style={{ fontFamily: 'monospace' }}>{r.processo_numero}</span> : '—'}
                  {r.pasta_numero ? <div style={{ color: '#5b6472' }}>Pasta {formatarNumeroPasta(r.pasta_numero)}</div> : null}
                </td>
              )}
              <td style={{ fontSize: 12, color: '#475569', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.descricao || ''}>{r.descricao || `#${r.registro_id}`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Aba "Atividade" do Financeiro.
export default function AtividadeFinanceiro() {
  const [filtros, setFiltros] = useState({ usuario_id: '', grupo: '', data_de: '', data_ate: '' });
  const [pagina, setPagina] = useState(1);
  const [dados, setDados] = useState(null);
  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const params = { pagina, limite: POR_PAGINA };
      for (const [k, v] of Object.entries(filtros)) if (v) params[k] = v;
      const { data } = await financeiroAPI.atividade(params);
      if (data.ok) { setDados(data.dados); if (data.dados.usuarios) setUsuarios(data.dados.usuarios); }
    } catch (err) { toast.error(err.response?.data?.mensagem || 'Erro ao carregar a atividade'); }
    finally { setCarregando(false); }
  }, [filtros, pagina]);
  useEffect(() => { carregar(); }, [carregar]);

  const mudar = (campo, valor) => { setFiltros(f => ({ ...f, [campo]: valor })); setPagina(1); };
  const totalPaginas = dados ? Math.max(1, Math.ceil(dados.total / POR_PAGINA)) : 1;

  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>Atividade do Financeiro</h3>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#5b6472' }}>Quem fez o quê e quando: lançamentos, acordos e alvarás, recebimentos, repasses e multas.</p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="ativ-usuario">Usuário</label>
          <select id="ativ-usuario" className="form-control" value={filtros.usuario_id} onChange={e => mudar('usuario_id', e.target.value)}>
            <option value="">Todos</option>
            {usuarios.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="ativ-grupo">Tipo de ação</label>
          <select id="ativ-grupo" className="form-control" value={filtros.grupo} onChange={e => mudar('grupo', e.target.value)}>
            {GRUPOS.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="ativ-de">De</label>
          <input id="ativ-de" type="date" className="form-control" value={filtros.data_de} onChange={e => mudar('data_de', e.target.value)} />
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label" htmlFor="ativ-ate">Até</label>
          <input id="ativ-ate" type="date" className="form-control" value={filtros.data_ate} onChange={e => mudar('data_ate', e.target.value)} />
        </div>
        <button className="btn btn-outline" onClick={() => { setFiltros({ usuario_id: '', grupo: '', data_de: '', data_ate: '' }); setPagina(1); }}>Limpar filtros</button>
      </div>
      {carregando && !dados ? <div className="loading">Carregando...</div> : <TabelaAtividade registros={dados?.registros || []} />}
      {dados && dados.total > POR_PAGINA && (
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center', alignItems: 'center' }}>
          <button className="btn btn-outline" disabled={pagina === 1 || carregando} onClick={() => setPagina(p => p - 1)}>← Anterior</button>
          <span style={{ padding: '8px 12px', fontSize: 13 }}>Página {pagina} de {totalPaginas} · {dados.total} registros</span>
          <button className="btn btn-outline" disabled={pagina >= totalPaginas || carregando} onClick={() => setPagina(p => p + 1)}>Próxima →</button>
        </div>
      )}
    </div>
  );
}

// "Histórico" de UM acordo/alvará: quem criou, editou, cancelou, e o que foi feito nas parcelas dele.
export function ModalHistoricoAcordo({ acordo, onFechar }) {
  const [registros, setRegistros] = useState(null);
  useEffect(() => {
    financeiroAPI.atividadeAcordo(acordo.id, { limite: 100 })
      .then(({ data }) => { if (data.ok) setRegistros(data.dados.registros); })
      .catch(err => { toast.error(err.response?.data?.mensagem || 'Erro ao carregar o histórico'); setRegistros([]); });
  }, [acordo.id]);
  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div className="modal-box modal-grande" style={{ maxWidth: 860 }}>
        <div className="modal-header">
          <h3>Histórico — {acordo.tipo === 'alvara' ? 'Alvará' : 'Acordo'}{acordo.descricao ? `: ${acordo.descricao}` : ''}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          {registros === null ? <div className="loading">Carregando...</div> : <TabelaAtividade registros={registros} mostrarProcesso={false} />}
        </div>
        <div className="modal-footer"><button className="btn btn-secondary" onClick={onFechar}>Fechar</button></div>
      </div>
    </div>
  );
}
