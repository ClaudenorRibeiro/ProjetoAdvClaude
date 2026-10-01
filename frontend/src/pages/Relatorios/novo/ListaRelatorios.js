// ============================================================
// RELATÓRIOS — lista: do sistema (do escritório), meus e compartilhados comigo.
// As ações de cada linha mudam conforme a origem e a permissão (o servidor confere tudo de novo).
// ============================================================
import React from 'react';
import MenuAcoes from '../../../components/MenuAcoes';
import { formatarDataHora } from '../../../utils/formatters';

const SECOES = [
  { origem: 'sistema', titulo: 'Relatórios do sistema', ajuda: 'Do escritório: todos veem, cada um com as suas permissões.' },
  { origem: 'proprio', titulo: 'Meus relatórios' },
  { origem: 'compartilhado', titulo: 'Compartilhados comigo', ajuda: 'Você abre, exporta e pode copiar; quem criou é quem altera.' },
];

function Selo({ texto, cor }) {
  return <span style={{ background: cor, color: '#fff', borderRadius: 10, padding: '1px 8px', fontSize: 11, marginLeft: 8, whiteSpace: 'nowrap' }}>{texto}</span>;
}

export default function ListaRelatorios({ modelos, assuntos, limite, criados, podeCriar, ehAdmin, onNovo, onAbrir, onEditar, onDuplicar, onExcluir, onCompartilhar, onAgendar, onSair, onInstalarPadrao }) {
  const cheio = criados >= limite;
  const rotuloAssunto = (chave) => assuntos.find(a => a.chave === chave)?.rotulo || chave;

  function linha(m) {
    const abrirDesabilitado = m.sem_acesso;
    return (
      <tr key={m.id}>
        <td>
          <button type="button" disabled={abrirDesabilitado} title={abrirDesabilitado ? 'Você não tem acesso ao assunto deste relatório' : ''}
            style={{ background: 'none', border: 0, padding: 0, color: abrirDesabilitado ? '#9ca3af' : '#2563eb', cursor: abrirDesabilitado ? 'not-allowed' : 'pointer', fontWeight: 600 }}
            onClick={() => onAbrir(m)}>{m.nome}</button>
          {(m.origem || 'proprio') === 'proprio' && m.compartilhado_com > 0 && <Selo texto={`compartilhado com ${m.compartilhado_com}`} cor="#7c3aed" />}
          {m.origem === 'compartilhado' && <Selo texto={`de ${m.dono_nome}`} cor="#0e7490" />}
          {m.sem_acesso && <Selo texto="sem acesso ao assunto" cor="#b45309" />}
        </td>
        <td>{rotuloAssunto(m.assunto)}</td>
        <td>{m.descricao || '—'}</td>
        <td>{formatarDataHora(m.alterado_em || m.criado_em)}</td>
        <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
          <button className="btn btn-secondary" disabled={abrirDesabilitado} onClick={() => onAbrir(m)}>Abrir</button>{' '}
          <MenuAcoes itens={[
            { label: 'Editar', icone: '✏️', onClick: () => onEditar(m), oculto: !m.pode_editar || !(podeCriar || ehAdmin) },
            { label: 'Duplicar para mim', icone: '📑', onClick: () => onDuplicar(m), oculto: !podeCriar || m.sem_acesso },
            { label: 'Compartilhar', icone: '🤝', onClick: () => onCompartilhar(m), oculto: (m.origem || 'proprio') !== 'proprio' || !podeCriar },
            { label: 'Agendar envio por e-mail', icone: '📧', onClick: () => onAgendar(m), oculto: !podeCriar || m.sem_acesso },
            { label: 'Remover da minha lista', icone: '🚫', onClick: () => onSair(m), oculto: m.origem !== 'compartilhado' },
            { label: 'Excluir', icone: '🗑️', onClick: () => onExcluir(m), perigo: true, oculto: !m.pode_editar || !(podeCriar || ehAdmin) },
          ]} />
        </td>
      </tr>
    );
  }

  const vazio = modelos.length === 0;
  return (
    <div>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '12px' }}>
        <span style={{ color: '#374151' }}>Você usa <strong>{criados}</strong> de <strong>{limite}</strong> relatórios pessoais permitidos.</span>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {ehAdmin && <button className="btn btn-secondary" onClick={onInstalarPadrao} title="Cria os relatórios padrão do escritório que ainda não existem">Instalar relatórios padrão</button>}
          {(podeCriar || ehAdmin) && <button className="btn btn-primary" disabled={cheio && !ehAdmin} title={cheio ? 'Limite atingido: exclua um relatório ou peça ao administrador' : ''} onClick={onNovo}>+ Novo relatório</button>}
        </span>
      </div>

      {vazio && (
        <div className="card">
          <p className="lista-vazia">
            {podeCriar
              ? 'Você ainda não tem relatórios. Clique em "+ Novo relatório" e monte o seu: escolha o assunto, as colunas e os filtros.'
              : 'Você não tem relatórios disponíveis e não tem permissão para criar. Peça ao administrador.'}
          </p>
        </div>
      )}

      {SECOES.map(s => {
        const itens = modelos.filter(m => (m.origem || 'proprio') === s.origem);
        if (!itens.length) return null;
        return (
          <div className="card" key={s.origem} style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0, marginBottom: s.ajuda ? 2 : 10 }}>{s.titulo}</h3>
            {s.ajuda && <p style={{ margin: '0 0 10px', color: '#6b7280', fontSize: 13 }}>{s.ajuda}</p>}
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead><tr><th>Relatório</th><th>Assunto</th><th>Descrição</th><th>Última alteração</th><th></th></tr></thead>
                <tbody>{itens.map(linha)}</tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}
