// ============================================================
// PÁGINA DE CADASTRO DE INSTITUIÇÕES FINANCEIRAS / BANCOS (menu Controle)
// CRUD simples: listar, criar, renomear, excluir (soft-delete).
// Usadas nas contas bancárias de Pessoas e, nas próximas etapas, no Financeiro.
// Apenas administradores (rota no menu é apenasAdmin).
// Mesmo padrão de Controle/FormasPagamento.js.
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { financeiroAPI } from '../../services/api';
import { toast } from 'react-toastify';
import ModalConfirmar from '../../components/ui/ModalConfirmar';
import MenuAcoes from '../../components/MenuAcoes';

export default function InstituicoesFinanceiras() {
  const [bancos,     setBancos]     = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [modal,      setModal]      = useState(false);
  const [editando,   setEditando]   = useState(null);  // banco em edição (ou null = novo)
  const [nome,       setNome]       = useState('');
  const [salvando,   setSalvando]   = useState(false);
  const [confirmar,  setConfirmar]  = useState(null);
  const [contas, setContas] = useState([]);
  const [modalConta, setModalConta] = useState(false);
  const [contaEditando, setContaEditando] = useState(null);
  const contaVazia = { nome: '', tipo: 'bancaria', instituicao_financeira_id: '', agencia: '', numero: '', digito: '', chave_pix: '', observacao: '', principal: false };
  const [formConta, setFormConta] = useState(contaVazia);
  // Todo aviso/erro de validação destes 2 modais aparece na FAIXA interna (nunca na
  // notificação do canto) e o cursor volta para o campo que originou o problema.
  const [aviso, setAviso] = useState('');
  const refNome      = useRef(null);
  const refBanco     = useRef(null);
  const refNomeConta = useRef(null);
  function avisar(mensagem, campo) {
    setAviso(mensagem);
    setTimeout(() => campo?.current?.focus(), 0);
  }

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setCarregando(true);
    try {
      const { data } = await financeiroAPI.instituicoesFinanceiras();
      if (data.ok) setBancos(data.dados);
      const contasResp = await financeiroAPI.contasEscritorio();
      if (contasResp.data.ok) setContas(contasResp.data.dados);
    } catch {
      toast.error('Erro ao carregar instituições financeiras');
    } finally {
      setCarregando(false);
    }
  }

  function abrirNovo()        { setEditando(null); setNome(''); setAviso(''); setModal(true); }
  function abrirEditar(b)     { setEditando(b); setNome(b.nome || ''); setAviso(''); setModal(true); }
  function fecharModal()      { setModal(false); setEditando(null); setNome(''); setAviso(''); }

  async function salvar(e) {
    e.preventDefault();
    if (!nome.trim()) return avisar('Nome é obrigatório', refNome);
    setSalvando(true);
    try {
      if (editando) {
        await financeiroAPI.atualizarInstituicaoFinanceira(editando.id, { nome: nome.trim() });
        toast.success('Instituição financeira atualizada!');
      } else {
        await financeiroAPI.criarInstituicaoFinanceira({ nome: nome.trim() });
        toast.success('Instituição financeira criada!');
      }
      fecharModal();
      carregar();
    } catch (err) {
      avisar(err.response?.data?.mensagem || 'Erro ao salvar', refNome);
    } finally {
      setSalvando(false);
    }
  }

  function excluir(b) {
    setConfirmar({
      titulo: 'Excluir instituição financeira',
      mensagem: `Excluir "${b.nome}"? Ela deixará de aparecer nas listas, mas as contas e lançamentos antigos continuam exibindo o nome.`,
      textoBotao: '🗑️ Excluir',
      tipo: 'perigo',
      acao: async () => {
        try {
          await financeiroAPI.excluirInstituicaoFinanceira(b.id);
          toast.success('Instituição financeira removida!');
          carregar();
        } catch (err) {
          toast.error(err.response?.data?.mensagem || 'Erro ao excluir');
        }
      },
    });
  }
  function abrirConta(c = null) { setContaEditando(c); setFormConta(c ? { ...contaVazia, ...c } : contaVazia); setAviso(''); setModalConta(true); }
  async function salvarConta(e, digitoConfirmado = false) {
    e?.preventDefault();
    if (!formConta.nome.trim()) return avisar('Informe um nome para a conta.', refNomeConta);
    if (formConta.tipo === 'bancaria' && !formConta.instituicao_financeira_id) return avisar('Escolha o banco.', refBanco);
    const digito = String(formConta.digito || '').trim();
    if (formConta.tipo === 'bancaria' && digito.length > 2 && !digitoConfirmado) {
      setConfirmar({
        titulo: 'Confirmar dígito da conta',
        mensagem: `O dígito informado (${digito}) tem ${digito.length} caracteres. Normalmente ele possui até 2. Deseja salvar mesmo assim?`,
        textoBotao: 'Salvar mesmo assim',
        tipo: 'aviso',
        acao: () => salvarConta(null, true),
      });
      return;
    }
    try {
      if (contaEditando) await financeiroAPI.atualizarContaEscritorio(contaEditando.id, formConta);
      else await financeiroAPI.criarContaEscritorio(formConta);
      toast.success('Conta do escritório salva.'); setModalConta(false); carregar();
    } catch (err) { avisar(err.response?.data?.mensagem || 'Erro ao salvar conta', refNomeConta); }
  }
  function alterarTipoConta(tipo) {
    setFormConta(f => ({ ...f, tipo, ...(tipo === 'especie' ? {
      instituicao_financeira_id: '', agencia: '', numero: '', digito: '', chave_pix: '',
    } : {}) }));
  }
  function desativarConta(c) { setConfirmar({ titulo: 'Desativar conta', mensagem: `Desativar "${c.nome}"? Os lançamentos antigos serão preservados.`, textoBotao: 'Desativar', tipo: 'aviso', acao: async () => { await financeiroAPI.desativarContaEscritorio(c.id); toast.success('Conta desativada.'); carregar(); } }); }

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#1e2a3a', margin: 0 }}>Instituições financeiras</h2>
          <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>
            Bancos usados nas contas bancárias de Pessoas e no Financeiro
          </p>
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Novo banco</button>
      </div>

      {/* Tabela */}
      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading">Carregando...</div>
        ) : bancos.length === 0 ? (
          <div className="lista-vazia">Nenhuma instituição financeira cadastrada ainda.</div>
        ) : (
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th style={{ width: 60 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {bancos.map(b => (
                  <tr key={b.id}>
                    <td>{b.nome}</td>
                    <td>
                      <MenuAcoes itens={[
                        { label: 'Editar',  icone: '✏️', onClick: () => abrirEditar(b) },
                        { label: 'Excluir', icone: '🗑️', perigo: true, onClick: () => excluir(b) },
                      ]} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 0, marginTop: 20 }}>
        <div style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><h3 style={{ margin: 0, fontSize: 16 }}>Contas do escritório e caixa</h3><small>Cadastre todas as contas, inclusive do mesmo banco, e o dinheiro em espécie.</small></div>
          <button className="btn btn-primary" onClick={() => abrirConta()}>+ Nova conta</button>
        </div>
        <div className="tabela-wrapper"><table className="tabela"><thead><tr><th>Banco / caixa</th><th>Identificação</th><th>Conta</th><th>Principal</th><th>Ações</th></tr></thead>
          <tbody>{contas.length === 0 ? <tr><td colSpan="5" className="lista-vazia">Nenhuma conta do escritório cadastrada.</td></tr> : contas.map(c => <tr key={c.id}><td>{c.instituicao_nome || 'Dinheiro em espécie'}</td><td>{c.nome}</td><td>{c.agencia ? `Ag. ${c.agencia} · ` : ''}{c.numero || c.chave_pix || '—'}</td><td>{c.principal ? 'Sim' : '—'}</td><td><MenuAcoes itens={[{ label:'Editar', icone:'✏️', onClick:()=>abrirConta(c) },...(c.tipo === 'especie' ? [] : [{ label:'Desativar', icone:'🗑️', perigo:true, onClick:()=>desativarConta(c) }])]} /></td></tr>)}</tbody>
        </table></div>
      </div>

      {/* Modal criar / editar */}
      {modal && (
        <div className="modal-overlay">
          <div className="modal-box" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3>{editando ? 'Editar instituição financeira' : 'Nova instituição financeira'}</h3>
              <button className="modal-fechar" onClick={fecharModal}>✕</button>
            </div>
            <form onSubmit={salvar}>
              <div className="modal-body">
                {aviso && (
                  <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c',
                    borderRadius:'6px', padding:'8px 10px', marginBottom:'12px', fontSize:'13px',
                    display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
                    <span>⚠️ {aviso}</span>
                    <button type="button" onClick={() => setAviso('')}
                      style={{ background:'none', border:'none', color:'#b91c1c', cursor:'pointer', fontSize:'15px', lineHeight:1 }}
                      title="Fechar">✕</button>
                  </div>
                )}
                <div className="form-group">
                  <label className="form-label obrigatorio">Nome</label>
                  <input ref={refNome} className="form-control" placeholder="Ex.: Nubank, Bradesco, Banco do Brasil..."
                    value={nome} onChange={e => setNome(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={fecharModal}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={salvando}>
                  {salvando ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {modalConta && <div className="modal-overlay"><div className="modal-box" style={{ maxWidth: 620 }}><div className="modal-header"><h3>{contaEditando ? 'Editar conta do escritório' : 'Nova conta do escritório'}</h3><button className="modal-fechar" onClick={() => setModalConta(false)}>✕</button></div><form onSubmit={salvarConta}><div className="modal-body">
        {aviso && (
          <div style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c',
            borderRadius:'6px', padding:'8px 10px', marginBottom:'12px', fontSize:'13px',
            display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
            <span>⚠️ {aviso}</span>
            <button type="button" onClick={() => setAviso('')}
              style={{ background:'none', border:'none', color:'#b91c1c', cursor:'pointer', fontSize:'15px', lineHeight:1 }}
              title="Fechar">✕</button>
          </div>
        )}
        <div className="grid-2"><div className="form-group"><label className="form-label">Tipo *</label><select className="form-control" value={formConta.tipo} onChange={e => alterarTipoConta(e.target.value)}><option value="bancaria">Conta bancária</option><option value="especie">Dinheiro em espécie</option></select></div><div className="form-group"><label className="form-label">Nome *</label><input ref={refNomeConta} className="form-control" value={formConta.nome} onChange={e=>setFormConta(f=>({...f,nome:e.target.value}))} placeholder={formConta.tipo === 'especie' ? 'Ex.: Caixa físico — gaveta principal' : 'Ex.: Conta operacional'} /></div></div>
        {formConta.tipo === 'bancaria' && <div className="form-group"><label className="form-label">Banco *</label><select ref={refBanco} className="form-control" value={formConta.instituicao_financeira_id} onChange={e=>setFormConta(f=>({...f,instituicao_financeira_id:e.target.value}))}><option value="">Selecione...</option>{bancos.map(b=><option key={b.id} value={b.id}>{b.nome}</option>)}</select></div>}
        {formConta.tipo === 'bancaria' && <><div className="grid-3"><div className="form-group"><label className="form-label">Agência</label><input className="form-control" value={formConta.agencia||''} onChange={e=>setFormConta(f=>({...f,agencia:e.target.value}))}/></div><div className="form-group"><label className="form-label">Conta</label><input className="form-control" value={formConta.numero||''} onChange={e=>setFormConta(f=>({...f,numero:e.target.value}))}/></div><div className="form-group"><label className="form-label">Dígito</label><input className="form-control" maxLength={4} value={formConta.digito||''} onChange={e=>setFormConta(f=>({...f,digito:e.target.value}))}/></div></div><div className="form-group"><label className="form-label">Chave PIX</label><input className="form-control" value={formConta.chave_pix||''} onChange={e=>setFormConta(f=>({...f,chave_pix:e.target.value}))}/></div></>}
        <div className="form-group"><label className="form-label">{formConta.tipo === 'especie' ? 'Local físico / observação' : 'Observação'}</label><textarea className="form-control" value={formConta.observacao||''} onChange={e=>setFormConta(f=>({...f,observacao:e.target.value}))} placeholder={formConta.tipo === 'especie' ? 'Ex.: Gaveta da recepção, cofre principal...' : ''}/></div><label><input type="checkbox" checked={!!formConta.principal} onChange={e=>setFormConta(f=>({...f,principal:e.target.checked}))}/> Conta principal do escritório</label>
      </div><div className="modal-footer"><button type="button" className="btn btn-secondary" onClick={()=>setModalConta(false)}>Cancelar</button><button className="btn btn-primary">Salvar</button></div></form></div></div>}

      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </div>
  );
}
