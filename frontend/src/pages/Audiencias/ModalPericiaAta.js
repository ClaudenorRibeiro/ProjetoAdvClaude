import React, { useEffect, useState } from 'react';
import { periciasAPI, pessoasAPI } from '../../services/api';
import { toast } from 'react-toastify';
import useEscFechar from '../../hooks/useEscFechar';
import SeletorData from '../../components/ui/SeletorData';
import { ModalPessoa } from '../Pessoas/Pessoas';

function chaveLocal(pessoa) { return `${pessoa.tipo_pessoa}:${pessoa.pessoa_id}`; }
function enderecoResumo(pessoa) { return [[pessoa.logradouro, pessoa.numero].filter(Boolean).join(', '), pessoa.complemento, pessoa.bairro, pessoa.cidade, pessoa.estado].filter(Boolean).join(' — '); }

// Formulário próprio da ATA: a tela normal de Perícias não é alterada por este fluxo.
export default function ModalPericiaAta({ processo, tipos, modelosEmailPerito, onFechar, onSalvar }) {
  const overlayRef = useEscFechar(onFechar);
  const [form, setForm] = useState({ tipo_pericia_id:'', tem_data:false, tem_perito:false, data:'', hora:'', perito_id:'', perito_nome:'', enviar_email_perito:false, modelo_email_perito_id:'' });
  const [reus, setReus] = useState([]);
  const [locaisReus, setLocaisReus] = useState([]);
  const [manual, setManual] = useState(false);
  const [endereco, setEndereco] = useState({ local:'', cep:'', logradouro:'', numero:'', complemento:'', bairro:'', cidade:'', estado:'' });
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState([]);
  const [peritosProcesso, setPeritosProcesso] = useState([]);
  const [modalPessoa, setModalPessoa] = useState(false);

  useEffect(() => {
    if (!processo.processo_id) return;
    periciasAPI.reusProcesso(processo.processo_id).then(({ data }) => { if (data.ok) setReus(data.dados || []); }).catch(() => setReus([]));
    periciasAPI.peritosProcesso(processo.processo_id).then(({ data }) => { if (data.ok) setPeritosProcesso(data.dados || []); }).catch(() => setPeritosProcesso([]));
  }, [processo.processo_id]);

  function set(campo, valor) { setForm(atual => ({ ...atual, [campo]: valor })); }
  function alternarReu(reu) {
    if (reu.endereco_incompleto) return toast.error(`Complete o endereço de ${reu.nome} antes de usá-lo como local.`);
    const chave = chaveLocal(reu);
    setLocaisReus(lista => lista.some(item => chaveLocal(item) === chave) ? lista.filter(item => chaveLocal(item) !== chave) : [...lista, { tipo_pessoa: reu.tipo_pessoa, pessoa_id: reu.pessoa_id, nome: reu.nome }]);
  }
  async function buscarPerito(valor) {
    setBusca(valor);
    if (valor.trim().length < 2) return setResultados([]);
    try { const { data } = await periciasAPI.buscarPeritosAta(valor); if (data.ok) setResultados(data.dados || []); } catch { setResultados([]); }
  }
  function nomeExibicaoPerito(pessoa) { return [pessoa.nome, pessoa.profissao].filter(Boolean).join(' — '); }
  function escolherPerito(pessoa) { setForm(atual => ({ ...atual, perito_id:pessoa.id || pessoa.pessoa_id, perito_nome:pessoa.nome })); setBusca(nomeExibicaoPerito(pessoa)); setResultados([]); }
  async function buscarCep(valor) {
    const cep = valor.replace(/\D/g, ''); if (cep.length !== 8) return;
    try { const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const dados = await resposta.json(); if (!dados.erro) setEndereco(atual => ({ ...atual, logradouro: dados.logradouro || '', bairro: dados.bairro || '', cidade: dados.localidade || '', estado: dados.uf || '' })); } catch { /* preenchimento manual continua disponível */ }
  }
  function salvar() {
    if (!form.tipo_pericia_id) return toast.error('Selecione o tipo de perícia.');
    if (form.tem_data && !form.data) return toast.error('Informe a data da perícia.');
    const temEnderecoManual = Object.values(endereco).some(valor => String(valor || '').trim());
    if (form.tem_data && locaisReus.length === 0 && !temEnderecoManual) return toast.error('Selecione o endereço de um réu ou informe outro local.');
    if (form.tem_data && manual && !temEnderecoManual) return toast.error('Preencha o outro local ou desmarque essa opção.');
    if (form.tem_data && !form.perito_id) return toast.error('Selecione ou cadastre o perito da perícia agendada.');
    if (!form.tem_data && form.tem_perito && !form.perito_id) return toast.error('Selecione ou cadastre o perito.');
    if (form.enviar_email_perito && !form.modelo_email_perito_id) return toast.error('Escolha o modelo de e-mail para o perito.');
    onSalvar({ tipo_pericia_id:form.tipo_pericia_id, data:form.tem_data ? form.data : null, hora:form.tem_data ? form.hora || null : null,
      ...Object.fromEntries(Object.entries(endereco).map(([campo, valor]) => [campo, form.tem_data && manual ? String(valor || '').trim() || null : null])),
      locais_reus:locaisReus.map(reu => ({ tipo_pessoa:reu.tipo_pessoa, pessoa_id:reu.pessoa_id })),
      perito_id:(form.tem_data || form.tem_perito) ? form.perito_id : null, perito_nome:(form.tem_data || form.tem_perito) ? form.perito_nome : '', enviar_email_perito:(form.tem_data || form.tem_perito) && form.enviar_email_perito,
      modelo_email_perito_id:(form.tem_data || form.tem_perito) && form.enviar_email_perito ? form.modelo_email_perito_id : null, status:form.tem_data ? 'agendada' : 'aguardando_data', responsavel_id:null, responsavel_freela_id:null, assistente_tecnico_id:null });
  }

  return <div className="modal-overlay" ref={overlayRef}>
    <div className="modal-box modal-grande"><div className="modal-header"><h3>Cadastrar perícia da ata</h3><button className="modal-fechar" onClick={onFechar}>✕</button></div>
      <div className="modal-body">
        {processo.pasta && <h3 style={{margin:'0 0 12px'}}>{processo.pasta}</h3>}
        <div className="form-group"><label className="form-label">Número do Processo</label><input className="form-control" value={processo.numero || ''} readOnly style={{maxWidth:300,background:'#f8fafc'}} /></div>
        <div className="form-group"><label className="form-label">Título</label><input className="form-control" value={processo.titulo || ''} readOnly style={{background:'#f8fafc'}} /></div>
        <div className="form-group"><label className="form-label">Tipo de perícia *</label><select className="form-control" value={form.tipo_pericia_id} onChange={e => set('tipo_pericia_id', e.target.value)}><option value="">— Selecione —</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}</select></div>
        <div className="form-group"><label className="form-label">A perícia já tem data?</label><div style={{display:'flex',gap:16}}><label><input type="radio" checked={form.tem_data} onChange={() => setForm(atual => ({ ...atual, tem_data:true, tem_perito:true }))} /> Sim, cadastrar o agendamento</label><label><input type="radio" checked={!form.tem_data} onChange={() => set('tem_data', false)} /> Não, aguardar data</label></div>{!form.tem_data && <small style={{color:'#64748b'}}>Ela será exibida no menu Perícias como “Aguardando data”.</small>}</div>
        {form.tem_data && <><div className="grid-2"><div className="form-group"><label className="form-label">Data *</label><SeletorData value={form.data} onChange={valor => set('data', valor)} /></div><div className="form-group"><label className="form-label">Hora</label><input type="time" className="form-control" value={form.hora} onChange={e => set('hora', e.target.value)} /></div></div>
          <div className="form-group"><label className="form-label">Onde será realizada a perícia? *</label>{reus.length ? <div style={{border:'1px solid #e5e7eb',borderRadius:8,padding:10,background:'#fbfdff'}}>{reus.map(reu => <label key={chaveLocal(reu)} style={{display:'block',padding:'8px 4px',borderBottom:'1px solid #eef2f7'}}><input type="checkbox" checked={locaisReus.some(item => chaveLocal(item) === chaveLocal(reu))} disabled={reu.endereco_incompleto} onChange={() => alternarReu(reu)} style={{marginRight:8}} /><strong>{reu.nome}</strong><small style={{display:'block',marginLeft:24,color:reu.endereco_incompleto ? '#b45309' : '#64748b'}}>{reu.endereco_incompleto ? 'Endereço incompleto — edite o cadastro antes de usar como local.' : enderecoResumo(reu)}</small></label>)}</div> : <small style={{color:'#888'}}>Nenhum réu carregado para este processo.</small>}</div>
          <div className="form-group"><label style={{display:'flex',alignItems:'center',gap:8,cursor:'pointer'}}><input type="checkbox" checked={manual} onChange={e => setManual(e.target.checked)} /> Adicionar outro local manual</label></div>
          {manual && <><div className="form-group"><label className="form-label">Nome/Referência do local</label><input className="form-control" autoComplete="off" value={endereco.local} onChange={e => setEndereco(v => ({...v,local:e.target.value}))} /></div><div className="grid-3"><div className="form-group"><label className="form-label">CEP</label><input className="form-control" autoComplete="off" value={endereco.cep} onChange={e => { const valor=e.target.value.replace(/\D/g,'').slice(0,8); setEndereco(v => ({...v,cep:valor.length>5 ? valor.replace(/(\d{5})(\d)/,'$1-$2') : valor})); if(valor.length===8) buscarCep(valor); }} placeholder="00000-000" /></div><div className="form-group" style={{gridColumn:'span 2'}}><label className="form-label">Logradouro</label><input className="form-control" autoComplete="off" value={endereco.logradouro} onChange={e => setEndereco(v => ({...v,logradouro:e.target.value}))} /></div></div><div className="grid-3"><div className="form-group"><label className="form-label">Número</label><input className="form-control" autoComplete="off" value={endereco.numero} onChange={e => setEndereco(v => ({...v,numero:e.target.value}))} /></div><div className="form-group"><label className="form-label">Complemento</label><input className="form-control" autoComplete="off" value={endereco.complemento} onChange={e => setEndereco(v => ({...v,complemento:e.target.value}))} /></div><div className="form-group"><label className="form-label">Bairro</label><input className="form-control" autoComplete="off" value={endereco.bairro} onChange={e => setEndereco(v => ({...v,bairro:e.target.value}))} /></div></div><div className="grid-3"><div className="form-group" style={{gridColumn:'span 2'}}><label className="form-label">Cidade</label><input className="form-control" autoComplete="off" value={endereco.cidade} onChange={e => setEndereco(v => ({...v,cidade:e.target.value}))} /></div><div className="form-group"><label className="form-label">Estado</label><input className="form-control" autoComplete="off" value={endereco.estado} maxLength={2} onChange={e => setEndereco(v => ({...v,estado:e.target.value.toUpperCase()}))} placeholder="SP" /></div></div></>}</>}
        {!form.tem_data && <div className="form-group"><label className="form-label">Há informações do perito?</label><div style={{display:'flex',gap:16}}><label><input type="radio" checked={form.tem_perito} onChange={() => set('tem_perito', true)} /> Sim, informar perito</label><label><input type="radio" checked={!form.tem_perito} onChange={() => set('tem_perito', false)} /> Não</label></div></div>}
        {(form.tem_data || form.tem_perito) && <div style={{border:'1px solid #dbeafe',borderRadius:8,padding:12,background:'#f8fbff'}}><div className="form-group"><label className="form-label">Perito (pessoas cuja profissão começa com Perícia){form.tem_data ? ' *' : ''}</label>{peritosProcesso.length > 0 && <select className="form-control" value={form.perito_id ? `fisica:${form.perito_id}` : ''} onChange={e => { const selecionado=peritosProcesso.find(p => `fisica:${p.pessoa_id}` === e.target.value); if (selecionado) escolherPerito(selecionado); }}><option value="">— Selecione um perito do processo —</option>{peritosProcesso.map(p => <option key={p.pessoa_id} value={`fisica:${p.pessoa_id}`}>{nomeExibicaoPerito(p)}{p.telefone ? ` · ${p.telefone}` : ''}{p.email ? ` · ${p.email}` : ''}</option>)}</select>}<div style={{display:'flex',gap:8,marginTop:8}}><input className="form-control" value={busca} onChange={e => buscarPerito(e.target.value)} placeholder="Buscar perito por nome, telefone ou e-mail..." /><button type="button" className="btn btn-outline" onClick={() => setModalPessoa(true)}>Cadastrar perito</button></div>{resultados.length > 0 && <div style={{border:'1px solid #dbeafe',background:'#fff',marginTop:4,borderRadius:6}}>{resultados.map(p => <button key={p.id} type="button" onClick={() => escolherPerito(p)} style={{display:'block',width:'100%',textAlign:'left',background:'#fff',border:'none',padding:'8px 10px',cursor:'pointer'}}><strong>{nomeExibicaoPerito(p)}</strong><small style={{display:'block',color:'#64748b'}}>{p.telefone ? `Tel: ${p.telefone}` : 'Sem telefone principal'}{p.email ? ` · ${p.email}` : ''}</small></button>)}</div>}{form.perito_nome && <small style={{color:'#166534'}}>Selecionado: {busca || form.perito_nome}</small>}</div>{form.perito_id && <><label style={{display:'flex',alignItems:'center',gap:8}}><input type="checkbox" checked={form.enviar_email_perito} onChange={e => set('enviar_email_perito',e.target.checked)} /> Enviar e-mail para este perito ao registrar a ata</label>{form.enviar_email_perito && <select className="form-control" style={{marginTop:8}} value={form.modelo_email_perito_id} onChange={e => set('modelo_email_perito_id',e.target.value)}><option value="">— Escolha o modelo de e-mail —</option>{modelosEmailPerito.map(m => <option key={m.id} value={m.id}>{m.nome}</option>)}</select>}</>}</div>}
      </div><div className="modal-footer"><button className="btn btn-secondary" onClick={onFechar}>Cancelar</button><button className="btn btn-primary" onClick={salvar}>Adicionar à ata</button></div>
    </div>
    {modalPessoa && <ModalPessoa tipo="fisicas" onSalvo={escolherPerito} onFechar={() => setModalPessoa(false)} />}
  </div>;
}
