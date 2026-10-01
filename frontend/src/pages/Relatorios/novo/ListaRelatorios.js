// ============================================================
// RELATÓRIOS — lista dos relatórios do usuário (as "receitas" salvas)
// ============================================================
import React from 'react';
import MenuAcoes from '../../../components/MenuAcoes';
import { formatarDataHora } from '../../../utils/formatters';

export default function ListaRelatorios({ modelos, assuntos, limite, criados, podeCriar, onNovo, onAbrir, onEditar, onDuplicar, onExcluir }) {
  const cheio = criados >= limite;
  const rotuloAssunto = (chave) => assuntos.find(a => a.chave === chave)?.rotulo || chave;

  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{ color: '#374151' }}>Você usa <strong>{criados}</strong> de <strong>{limite}</strong> relatórios permitidos.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
          {podeCriar && <button className="btn btn-primary" disabled={cheio} title={cheio ? 'Limite atingido: exclua um relatório ou peça ao administrador' : ''} onClick={onNovo}>+ Novo relatório</button>}
        </span>
      </div>

      <div className="card">
        {modelos.length === 0 ? (
          <p className="lista-vazia">
            {podeCriar
              ? 'Você ainda não criou nenhum relatório. Clique em "+ Novo relatório" e monte o seu: escolha o assunto, as colunas e os filtros.'
              : 'Você não tem relatórios salvos e não tem permissão para criar. Peça ao administrador.'}
          </p>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead><tr><th>Relatório</th><th>Assunto</th><th>Descrição</th><th>Última alteração</th><th></th></tr></thead>
              <tbody>
                {modelos.map(m => (
                  <tr key={m.id}>
                    <td><button type="button" className="btn-link" style={{ background: 'none', border: 0, padding: 0, color: '#2563eb', cursor: 'pointer', fontWeight: 600 }}
                      onClick={() => onAbrir(m)}>{m.nome}</button></td>
                    <td>{rotuloAssunto(m.assunto)}</td>
                    <td>{m.descricao || '—'}</td>
                    <td>{formatarDataHora(m.alterado_em || m.criado_em)}</td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      <button className="btn btn-secondary" onClick={() => onAbrir(m)}>Abrir</button>{' '}
                      <MenuAcoes itens={[
                        { label: 'Editar', icone: '✏️', onClick: () => onEditar(m), oculto: !podeCriar },
                        { label: 'Duplicar', icone: '📑', onClick: () => onDuplicar(m), oculto: !podeCriar },
                        { label: 'Excluir', icone: '🗑️', onClick: () => onExcluir(m), perigo: true, oculto: !podeCriar },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
