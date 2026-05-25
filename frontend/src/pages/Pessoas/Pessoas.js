// ============================================================
// PÁGINA DE PESSOAS — Lista e cadastro de PF e PJ
// ============================================================

import React, { useState, useEffect, useCallback } from 'react';
import { pessoasAPI } from '../../services/api';
import { formatarCPF, formatarCNPJ, formatarData, mascaraCPF, validarCPF } from '../../utils/formatters';
import { toast } from 'react-toastify';

export default function Pessoas() {
  const [aba, setAba]             = useState('fisicas'); // 'fisicas' | 'juridicas'
  const [lista, setLista]         = useState([]);
  const [total, setTotal]         = useState(0);
  const [busca, setBusca]         = useState('');
  const [pagina, setPagina]       = useState(1);
  const [carregando, setCarregando] = useState(false);
  const [modalAberto, setModalAberto] = useState(false);
  const [pessoaSelecionada, setPessoaSelecionada] = useState(null);

  const LIMITE = 20;

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const fn = aba === 'fisicas' ? pessoasAPI.listarFisicas : pessoasAPI.listarJuridicas;
      const { data } = await fn({ busca, pagina, limite: LIMITE });
      if (data.ok) {
        setLista(data.dados.registros);
        setTotal(data.dados.total);
      }
    } catch { toast.error('Erro ao carregar pessoas'); }
    finally { setCarregando(false); }
  }, [aba, busca, pagina]);

  useEffect(() => { carregar(); }, [carregar]);

  function abrirNovoCadastro() { setPessoaSelecionada(null); setModalAberto(true); }
  function abrirEdicao(pessoa) { setPessoaSelecionada(pessoa); setModalAberto(true); }

  function fecharModal(recarregar, pessoaParaEditar = null) {
    setModalAberto(false);
    if (pessoaParaEditar) {
      // CPF duplicado: fecha o form de cadastro e abre o form de edição da pessoa encontrada
      // Pequeno delay para o React processar o fechamento antes de reabrir
      setTimeout(() => {
        setPessoaSelecionada(pessoaParaEditar);
        setModalAberto(true);
      }, 50);
    } else if (recarregar) {
      carregar();
    }
  }

  const totalPaginas = Math.ceil(total / LIMITE);

  return (
    <div>
      {/* Abas */}
      <div className="abas" style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
        <button className={`btn ${aba==='fisicas'?'btn-primary':'btn-outline'}`} onClick={() => { setAba('fisicas'); setPagina(1); }}>
          Pessoas Físicas
        </button>
        <button className={`btn ${aba==='juridicas'?'btn-primary':'btn-outline'}`} onClick={() => { setAba('juridicas'); setPagina(1); }}>
          Pessoas Jurídicas
        </button>
      </div>

      <div className="card">
        {/* Barra de ações */}
        <div style={{display:'flex',gap:'12px',marginBottom:'16px',alignItems:'center',flexWrap:'wrap'}}>
          <input
            className="form-control" style={{maxWidth:'300px'}}
            placeholder={aba==='fisicas' ? 'Buscar por nome ou CPF...' : 'Buscar por razão social ou CNPJ...'}
            value={busca}
            onChange={e => { setBusca(e.target.value); setPagina(1); }}
          />
          <button className="btn btn-primary" onClick={abrirNovoCadastro}>
            + {aba==='fisicas' ? 'Nova Pessoa Física' : 'Nova Pessoa Jurídica'}
          </button>
          <span style={{marginLeft:'auto',color:'#888',fontSize:'13px'}}>{total} registro(s)</span>
        </div>

        {/* Tabela */}
        {carregando ? <div className="loading">Carregando...</div> : (
          <div className="tabela-wrapper">
            {aba === 'fisicas' ? (
              <TabelaFisicas lista={lista} onEditar={abrirEdicao} />
            ) : (
              <TabelaJuridicas lista={lista} onEditar={abrirEdicao} />
            )}
            {lista.length === 0 && <p className="lista-vazia">Nenhum registro encontrado</p>}
          </div>
        )}

        {/* Paginação */}
        {totalPaginas > 1 && (
          <div style={{display:'flex',gap:'8px',marginTop:'16px',justifyContent:'center'}}>
            <button className="btn btn-outline" disabled={pagina===1} onClick={() => setPagina(p=>p-1)}>← Anterior</button>
            <span style={{padding:'8px 12px',fontSize:'13px'}}>Página {pagina} de {totalPaginas}</span>
            <button className="btn btn-outline" disabled={pagina===totalPaginas} onClick={() => setPagina(p=>p+1)}>Próxima →</button>
          </div>
        )}
      </div>

      {/* Modal de cadastro/edição */}
      {modalAberto && (
        <ModalPessoa
          tipo={aba}
          pessoa={pessoaSelecionada}
          onFechar={fecharModal}
          onAbrirEdicao={(p) => fecharModal(false, p)}
        />
      )}
    </div>
  );
}

// Tabela de pessoas físicas
function TabelaFisicas({ lista, onEditar }) {
  return (
    <table className="tabela">
      <thead>
        <tr><th>Nome</th><th>CPF</th><th>Telefone</th><th>E-mail</th><th>Ações</th></tr>
      </thead>
      <tbody>
        {lista.map(p => (
          <tr key={p.id}>
            <td><strong>{p.nome}</strong></td>
            <td>{formatarCPF(p.cpf)}</td>
            <td>{p.telefone || '—'}</td>
            <td>{p.email || '—'}</td>
            <td>
              <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}} onClick={() => onEditar(p)}>
                Editar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Tabela de pessoas jurídicas
function TabelaJuridicas({ lista, onEditar }) {
  return (
    <table className="tabela">
      <thead>
        <tr><th>Razão Social</th><th>Nome Fantasia</th><th>CNPJ</th><th>Telefone</th><th>Ações</th></tr>
      </thead>
      <tbody>
        {lista.map(p => (
          <tr key={p.id}>
            <td><strong>{p.razao_social}</strong></td>
            <td>{p.nome_fantasia || '—'}</td>
            <td>{formatarCNPJ(p.cnpj)}</td>
            <td>{p.telefone || '—'}</td>
            <td>
              <button className="btn btn-outline" style={{fontSize:'12px',padding:'4px 10px'}} onClick={() => onEditar(p)}>
                Editar
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Modal de cadastro / edição de pessoa
function ModalPessoa({ tipo, pessoa, onFechar, onAbrirEdicao }) {
  const [form, setForm]         = useState(pessoa || {});
  const [auxiliares, setAux]    = useState({ estados_civis: [], generos: [], profissoes: [] });
  const [salvando, setSalvando] = useState(false);
  const [telefones, setTelefones] = useState(pessoa?.telefones || [{ numero: '', tipo: 'celular', principal: true }]);
  const [emails, setEmails]       = useState(pessoa?.emails || [{ email: '', principal: true }]);

  useEffect(() => {
    pessoasAPI.auxiliares().then(r => setAux(r.data.dados));
    // Se editando, busca dados completos
    if (pessoa?.id && tipo === 'fisicas') {
      pessoasAPI.buscarFisica(pessoa.id).then(r => {
        if (r.data.ok) {
          setForm(r.data.dados);
          setTelefones(r.data.dados.telefones || []);
          setEmails(r.data.dados.emails || []);
        }
      });
    }
  }, []);

  function set(campo, valor) { setForm(f => ({...f, [campo]: valor})); }

  async function salvar() {
    if (!form.nome && tipo === 'fisicas') return toast.error('Nome é obrigatório');
    if (!form.razao_social && tipo === 'juridicas') return toast.error('Razão social é obrigatória');
    setSalvando(true);
    try {
      const payload = { ...form, telefones, emails };
      if (pessoa?.id) {
        await pessoasAPI.atualizarFisica(pessoa.id, payload);
        toast.success('Pessoa atualizada com sucesso!');
      } else {
        const fn = tipo === 'fisicas' ? pessoasAPI.criarFisica : pessoasAPI.criarJuridica;
        await fn(payload);
        toast.success('Pessoa cadastrada com sucesso!');
      }
      onFechar(true);
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  return (
    <div className="modal-overlay" onClick={() => onFechar(false)}>
      <div className="modal-box modal-grande" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{pessoa ? 'Editar' : 'Nova'} {tipo === 'fisicas' ? 'Pessoa Física' : 'Pessoa Jurídica'}</h3>
          <button className="modal-fechar" onClick={() => onFechar(false)}>✕</button>
        </div>

        <div className="modal-body">
          {tipo === 'fisicas' ? (
            <>
              <div className="grid-2">
                <Campo label="Nome completo *" value={form.nome||''} onChange={v=>set('nome',v)} />
                {/* CampoCPF aplica máscara, valida algoritmo e verifica duplicata no banco */}
                <CampoCPF
                  value={form.cpf||''}
                  onChange={v=>set('cpf',v)}
                  pessoaIdAtual={pessoa?.id || null}
                  onAbrirEdicao={onAbrirEdicao}
                />
              </div>
              <div className="grid-3">
                <Campo label="RG" value={form.rg||''} onChange={v=>set('rg',v)} />
                <Campo label="Data de nascimento" type="date" value={form.data_nascimento?.split('T')[0]||''} onChange={v=>set('data_nascimento',v)} />
                <Select label="Gênero" value={form.genero_id||''} onChange={v=>set('genero_id',v)} opcoes={auxiliares.generos} />
              </div>
              <div className="grid-2">
                <Select label="Estado civil" value={form.estado_civil_id||''} onChange={v=>set('estado_civil_id',v)} opcoes={auxiliares.estados_civis} />
                <Select label="Profissão" value={form.profissao_id||''} onChange={v=>set('profissao_id',v)} opcoes={auxiliares.profissoes} />
              </div>
            </>
          ) : (
            <>
              <div className="grid-2">
                <Campo label="Razão Social *" value={form.razao_social||''} onChange={v=>set('razao_social',v)} />
                <Campo label="Nome Fantasia" value={form.nome_fantasia||''} onChange={v=>set('nome_fantasia',v)} />
              </div>
              <div className="grid-2">
                <Campo label="CNPJ" value={form.cnpj||''} onChange={v=>set('cnpj',v)} placeholder="00.000.000/0000-00" />
                <Campo label="Representante Legal" value={form.representante_legal||''} onChange={v=>set('representante_legal',v)} />
              </div>
            </>
          )}

          {/* Endereço */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Endereço</h4>
          <div className="grid-3">
            <Campo label="CEP" value={form.cep||''} onChange={v=>set('cep',v)} />
            <Campo label="Logradouro" value={form.logradouro||''} onChange={v=>set('logradouro',v)} />
            <Campo label="Número" value={form.numero||''} onChange={v=>set('numero',v)} />
          </div>
          <div className="grid-3">
            <Campo label="Bairro" value={form.bairro||''} onChange={v=>set('bairro',v)} />
            <Campo label="Cidade" value={form.cidade||''} onChange={v=>set('cidade',v)} />
            <Campo label="Estado" value={form.estado||''} onChange={v=>set('estado',v)} placeholder="SP" />
          </div>

          {/* Telefones */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Telefones</h4>
          {telefones.map((tel, i) => (
            <div key={i} style={{display:'flex',gap:'8px',marginBottom:'8px',alignItems:'center'}}>
              <input className="form-control" style={{flex:2}} placeholder="(11) 99999-9999"
                value={tel.numero} onChange={e => setTelefones(t => t.map((x,j) => j===i ? {...x,numero:e.target.value} : x))} />
              <select className="form-control" style={{flex:1}}
                value={tel.tipo} onChange={e => setTelefones(t => t.map((x,j) => j===i ? {...x,tipo:e.target.value} : x))}>
                <option value="celular">Celular</option>
                <option value="residencial">Residencial</option>
                <option value="comercial">Comercial</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
              {i > 0 && <button className="btn btn-danger" style={{padding:'6px 10px'}} onClick={() => setTelefones(t=>t.filter((_,j)=>j!==i))}>✕</button>}
            </div>
          ))}
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setTelefones(t=>[...t,{numero:'',tipo:'celular',principal:false}])}>
            + Adicionar telefone
          </button>

          {/* E-mails */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>E-mails</h4>
          {emails.map((em, i) => (
            <div key={i} style={{display:'flex',gap:'8px',marginBottom:'8px',alignItems:'center'}}>
              <input className="form-control" style={{flex:1}} placeholder="email@exemplo.com"
                value={em.email} onChange={e => setEmails(t => t.map((x,j) => j===i ? {...x,email:e.target.value} : x))} />
              {i > 0 && <button className="btn btn-danger" style={{padding:'6px 10px'}} onClick={() => setEmails(t=>t.filter((_,j)=>j!==i))}>✕</button>}
            </div>
          ))}
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setEmails(e=>[...e,{email:'',principal:false}])}>
            + Adicionar e-mail
          </button>

          {/* Observações */}
          <div className="form-group" style={{marginTop:'16px'}}>
            <label className="form-label">Observações</label>
            <textarea className="form-control" rows={3} value={form.observacoes||''} onChange={e=>set('observacoes',e.target.value)} />
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={() => onFechar(false)}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// CAMPO CPF — máscara automática + validação + duplicata
// pessoaIdAtual: id da pessoa em edição (evita alertar sobre ela mesma)
// onAbrirEdicao: callback chamado com { id, nome, cpf } quando usuário quer editar a duplicata
// ============================================================
function CampoCPF({ value, onChange, pessoaIdAtual = null, onAbrirEdicao = null }) {
  const [erroCpf, setErroCpf]       = useState('');
  const [verificando, setVerificando] = useState(false);
  const [duplicata, setDuplicata]   = useState(null); // { id, nome, cpf } se já existe no banco

  // Aplica máscara enquanto o usuário digita
  function handleChange(e) {
    const mascarado = mascaraCPF(e.target.value);
    setErroCpf('');
    setDuplicata(null);
    onChange(mascarado);
  }

  // Ao sair do campo: valida algoritmo e consulta o banco
  async function handleBlur() {
    const limpo = (value || '').replace(/\D/g, '');

    // Campo vazio — sem mensagem de erro
    if (!limpo) { setErroCpf(''); return; }

    // CPF incompleto
    if (limpo.length < 11) { setErroCpf('CPF incompleto'); return; }

    // Algoritmo dos dígitos verificadores
    if (!validarCPF(limpo)) { setErroCpf('CPF inválido'); return; }

    // CPF matematicamente válido — verifica se já existe no banco
    setErroCpf('');
    setVerificando(true);
    try {
      const { data } = await pessoasAPI.verificarCPF(limpo);
      if (data.ok && data.dados.existe) {
        const encontrado = data.dados.pessoa;
        // Ignora se for a própria pessoa que está sendo editada
        if (pessoaIdAtual && encontrado.id === pessoaIdAtual) return;
        setDuplicata(encontrado);
      }
    } catch {
      // Falha silenciosa — não bloqueia o cadastro se a verificação der erro
    } finally {
      setVerificando(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">CPF</label>
      <input
        type="text"
        className={`form-control ${erroCpf ? 'is-invalid' : ''}`}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="000.000.000-00"
        maxLength={14}
      />
      {/* Exibe feedback abaixo do campo */}
      {verificando && (
        <small style={{ color: '#888', fontSize: '12px' }}>⏳ Verificando CPF...</small>
      )}
      {erroCpf && (
        <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroCpf}</small>
      )}
      {/* Alerta de CPF duplicado com opção de abrir edição */}
      {duplicata && (
        <div style={{
          marginTop: '6px', padding: '10px 12px',
          background: '#fff3cd', border: '1px solid #ffc107',
          borderRadius: '4px', fontSize: '13px', lineHeight: '1.5'
        }}>
          <strong>⚠️ CPF já cadastrado</strong> para <strong>{duplicata.nome}</strong>.
          {onAbrirEdicao ? (
            <>
              <br />Deseja abrir o cadastro para edição?
              <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ fontSize: '12px', padding: '4px 14px' }}
                  onClick={() => { setDuplicata(null); onAbrirEdicao(duplicata); }}
                >
                  Sim, editar
                </button>
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: '12px', padding: '4px 14px' }}
                  onClick={() => setDuplicata(null)}
                >
                  Não
                </button>
              </div>
            </>
          ) : (
            <span> Use o botão <em>Editar</em> na lista para alterar.</span>
          )}
        </div>
      )}
    </div>
  );
}

// Componentes auxiliares para o formulário
function Campo({ label, value, onChange, type='text', placeholder='' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input type={type} className="form-control" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
function Select({ label, value, onChange, opcoes=[] }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <select className="form-control" value={value} onChange={e=>onChange(e.target.value)}>
        <option value="">— Selecione —</option>
        {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
      </select>
    </div>
  );
}
