// ============================================================
// PÁGINA DE PESSOAS — Lista e cadastro de PF e PJ
// ============================================================

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  const [telefones, setTelefones] = useState(pessoa?.telefones || [{ numero: '', tipo: '', principal: true }]);
  const [emails, setEmails]       = useState(pessoa?.emails || [{ email: '', principal: true }]);
  // Ref do campo Número — recebe o foco automaticamente após o CEP ser preenchido
  const refNumero = useRef(null);

  useEffect(() => {
    pessoasAPI.auxiliares().then(r => setAux(r.data.dados));
    // Se editando, busca dados completos
    if (pessoa?.id && tipo === 'fisicas') {
      pessoasAPI.buscarFisica(pessoa.id).then(r => {
        if (r.data.ok) {
          setForm(r.data.dados);
          const tels = r.data.dados.telefones || [];
          setTelefones(tels.length ? tels : [{ numero: '', tipo: '', principal: true }]);
          setEmails(r.data.dados.emails || [{ email: '', principal: true }]);
        }
      });
    }
  }, []);

  function set(campo, valor) { setForm(f => ({...f, [campo]: valor})); }

  // Chamado pelo SelectComAdicao quando o usuário cadastra um novo item auxiliar
  // Adiciona o novo item na lista local já ordenado e auto-seleciona no form
  function handleNovoAuxiliar(tipo, novoItem) {
    const campoPorTipo = {
      generos:       'genero_id',
      estados_civis: 'estado_civil_id',
      profissoes:    'profissao_id',
    };
    // Insere na lista do tipo correto, mantendo ordem alfabética
    setAux(a => ({
      ...a,
      [tipo]: [...a[tipo], novoItem].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR')),
    }));
    // Auto-seleciona o item recém-criado
    set(campoPorTipo[tipo], String(novoItem.id));
  }

  // Chamado pelo CampoCEP após buscar o endereço na ViaCEP
  // Preenche logradouro, bairro, cidade e estado — e move o cursor para Número
  function handleCEPAutoFill(dados) {
    setForm(f => ({
      ...f,
      logradouro: dados.logradouro || f.logradouro || '',
      bairro:     dados.bairro     || f.bairro     || '',
      cidade:     dados.cidade     || f.cidade     || '',
      estado:     dados.estado     || f.estado     || '',
    }));
    // Pequeno delay para o React renderizar os campos antes de focar
    setTimeout(() => refNumero.current?.focus(), 100);
  }

  async function salvar() {
    if (tipo === 'fisicas') {
      // ── Campos obrigatórios de Pessoa Física ──────────────────────────
      if (!form.nome?.trim()) return toast.error('Nome é obrigatório');
      const partes = form.nome.trim().split(/\s+/).filter(Boolean);
      if (partes.length < 2)  return toast.error('Informe o nome completo (nome e sobrenome)');

      if (!form.cpf?.replace(/\D/g, ''))
        return toast.error('CPF é obrigatório');
      if (!form.data_nascimento)
        return toast.error('Data de nascimento é obrigatória');
      if (!form.genero_id)
        return toast.error('Gênero é obrigatório');
      if (!form.estado_civil_id)
        return toast.error('Estado civil é obrigatório');
      if (!form.profissao_id)
        return toast.error('Profissão é obrigatória');

      // Primeiro telefone obrigatório
      if (!telefones[0]?.numero?.replace(/\D/g, ''))
        return toast.error('Pelo menos um telefone é obrigatório');

      // Valida formato dos e-mails preenchidos
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      for (const em of emails) {
        if (em.email && !emailRegex.test(em.email.trim())) {
          return toast.error(`E-mail inválido: "${em.email}"`);
        }
      }

      // Valida data de nascimento — não pode ser futura
      const hoje = new Date().toISOString().split('T')[0];
      if (form.data_nascimento > hoje)
        return toast.error('Data de nascimento não pode ser uma data futura');
    }

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
                {/* CampoNome exige ao menos duas palavras ao sair do campo */}
                <CampoNomeCompleto value={form.nome||''} onChange={v=>set('nome',v)} />
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
                {/* CampoData bloqueia datas futuras — ninguém nasce amanhã */}
                <CampoDataNascimento value={form.data_nascimento?.split('T')[0]||''} onChange={v=>set('data_nascimento',v)} />
                <SelectComAdicao
                  label="Gênero" value={form.genero_id||''} onChange={v=>set('genero_id',v)}
                  opcoes={auxiliares.generos} tipo="generos"
                  onNovoItem={item => handleNovoAuxiliar('generos', item)}
                />
              </div>
              <div className="grid-2">
                <SelectComAdicao
                  label="Estado civil" value={form.estado_civil_id||''} onChange={v=>set('estado_civil_id',v)}
                  opcoes={auxiliares.estados_civis} tipo="estados_civis"
                  onNovoItem={item => handleNovoAuxiliar('estados_civis', item)}
                />
                <SelectComAdicao
                  label="Profissão" value={form.profissao_id||''} onChange={v=>set('profissao_id',v)}
                  opcoes={auxiliares.profissoes} tipo="profissoes"
                  onNovoItem={item => handleNovoAuxiliar('profissoes', item)}
                />
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
          {/* Linha 1: CEP (busca automática) + Logradouro */}
          <div className="grid-2">
            <CampoCEP value={form.cep||''} onChange={v=>set('cep',v)} onAutoFill={handleCEPAutoFill} />
            <Campo label="Logradouro" value={form.logradouro||''} onChange={v=>set('logradouro',v)} />
          </div>
          {/* Linha 2: Número (recebe foco do CEP) + Complemento + Bairro */}
          <div className="grid-3">
            <Campo label="Número" value={form.numero||''} onChange={v=>set('numero',v)} ref={refNumero} />
            <Campo label="Complemento" value={form.complemento||''} onChange={v=>set('complemento',v)} placeholder="Apto, sala, bloco..." />
            <Campo label="Bairro" value={form.bairro||''} onChange={v=>set('bairro',v)} />
          </div>
          {/* Linha 3: Cidade + Estado */}
          <div className="grid-2">
            <Campo label="Cidade" value={form.cidade||''} onChange={v=>set('cidade',v)} />
            <Campo label="Estado" value={form.estado||''} onChange={v=>set('estado',v)} placeholder="SP" />
          </div>

          {/* Telefones */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Telefones</h4>
          {telefones.map((tel, i) => (
            <LinhaFone
              key={i}
              tel={tel}
              index={i}
              onChange={v => setTelefones(t => t.map((x,j) => j===i ? v : x))}
              onRemove={() => setTelefones(t => t.filter((_,j) => j!==i))}
            />
          ))}
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setTelefones(t=>[...t,{numero:'',tipo:'',principal:false}])}>
            + Adicionar telefone
          </button>

          {/* E-mails */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>E-mails</h4>
          {emails.map((em, i) => (
            <LinhaEmail
              key={i}
              email={em.email}
              index={i}
              onChange={v => setEmails(t => t.map((x,j) => j===i ? {...x, email: v} : x))}
              onRemove={() => setEmails(t => t.filter((_,j) => j!==i))}
            />
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

// ============================================================
// CAMPO DATA NASCIMENTO — impede datas futuras
// ============================================================
function CampoDataNascimento({ value, onChange }) {
  const [erroData, setErroData] = useState('');
  // Calcula "hoje" no formato YYYY-MM-DD para o atributo max
  const hoje = new Date().toISOString().split('T')[0];

  function handleChange(v) {
    if (v && v > hoje) {
      setErroData('Data de nascimento não pode ser futura');
    } else {
      setErroData('');
    }
    onChange(v);
  }

  return (
    <div className="form-group">
      <label className="form-label">Data de nascimento</label>
      <input
        type="date"
        className={`form-control ${erroData ? 'is-invalid' : ''}`}
        value={value}
        max={hoje}
        onChange={e => handleChange(e.target.value)}
      />
      {erroData && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroData}</small>}
    </div>
  );
}

// ============================================================
// SELECT COM ADIÇÃO — select normal + botão "..." para cadastrar
// novo item diretamente na tela, sem abrir outra página
// tipo: 'generos' | 'estados_civis' | 'profissoes'
// onNovoItem: callback chamado com { id, nome } após salvar
// ============================================================
function SelectComAdicao({ label, value, onChange, opcoes = [], tipo, onNovoItem }) {
  const [miniFormAberto, setMiniFormAberto] = useState(false);
  const [novoNome, setNovoNome]             = useState('');
  const [salvando, setSalvando]             = useState(false);

  // Fecha o mini form e limpa o estado — sem sujeira
  function fecharMiniForm() {
    setMiniFormAberto(false);
    setNovoNome('');
  }

  async function salvarNovo() {
    if (!novoNome.trim()) return toast.error('Digite um nome para cadastrar');
    setSalvando(true);
    try {
      const { data } = await pessoasAPI.criarAuxiliar(tipo, { nome: novoNome.trim() });
      if (data.ok) {
        toast.success(`"${data.dados.nome}" cadastrado com sucesso!`);
        onNovoItem(data.dados); // atualiza lista e auto-seleciona no form pai
        fecharMiniForm();
      }
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Erro ao cadastrar');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
        <select
          className="form-control"
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ flex: 1 }}
        >
          <option value="">— Selecione —</option>
          {opcoes.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
        </select>
        {/* Botão "..." abre mini formulário para cadastrar novo item */}
        <button
          type="button"
          title={`Cadastrar novo(a) ${label} que não está na lista`}
          className="btn btn-outline"
          style={{ padding: '6px 10px', fontSize: '15px', flexShrink: 0, lineHeight: 1 }}
          onClick={() => setMiniFormAberto(v => !v)}
        >
          …
        </button>
      </div>

      {/* Mini formulário inline — aparece abaixo do select quando "..." é clicado */}
      {miniFormAberto && (
        <div style={{
          marginTop: '8px', padding: '10px 12px',
          background: '#f0f4ff', border: '1px solid #c5d0e6',
          borderRadius: '4px'
        }}>
          <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '6px', color: '#444' }}>
            Novo(a) {label}
          </div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input
              autoFocus
              className="form-control"
              placeholder={`Ex.: ${label === 'Profissão' ? 'Pedreiro' : label === 'Gênero' ? 'Não binário' : 'Viúvo(a)'}`}
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') salvarNovo(); if (e.key === 'Escape') fecharMiniForm(); }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              className="btn btn-primary"
              style={{ fontSize: '12px', padding: '6px 14px', flexShrink: 0 }}
              onClick={salvarNovo}
              disabled={salvando}
            >
              {salvando ? '...' : 'Salvar'}
            </button>
            <button
              type="button"
              className="btn btn-outline"
              style={{ fontSize: '12px', padding: '6px 10px', flexShrink: 0 }}
              onClick={fecharMiniForm}
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// CAMPO NOME COMPLETO — exige pelo menos duas palavras (nome + sobrenome)
// Avisa ao sair do campo, bloqueia no Salvar também
// ============================================================
function CampoNomeCompleto({ value, onChange }) {
  const [erroNome, setErroNome] = useState('');

  function handleBlur() {
    const partes = (value || '').trim().split(/\s+/).filter(Boolean);
    if (partes.length === 1) {
      setErroNome('Informe o nome completo (nome e sobrenome)');
    } else {
      setErroNome('');
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">Nome completo *</label>
      <input
        type="text"
        className={`form-control ${erroNome ? 'is-invalid' : ''}`}
        value={value}
        onChange={e => { setErroNome(''); onChange(e.target.value); }}
        onBlur={handleBlur}
        placeholder="Nome e Sobrenome"
      />
      {erroNome && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroNome}</small>}
    </div>
  );
}

// ============================================================
// LINHA FONE — número com máscara + campo de texto livre para descrição
// O usuário digita o que quiser: "Celular", "esposa Edna", "WhatsApp trabalho", etc.
// ============================================================
function LinhaFone({ tel, index, onChange, onRemove }) {
  // Máscara adaptativa: fixo (xx) xxxx-xxxx ou celular (xx) xxxxx-xxxx
  function mascaraTelefone(value) {
    const limpo = value.replace(/\D/g, '').slice(0, 11);
    if (!limpo) return '';
    if (limpo.length <= 2)  return `(${limpo}`;
    if (limpo.length <= 6)  return `(${limpo.slice(0,2)}) ${limpo.slice(2)}`;
    if (limpo.length <= 10) return `(${limpo.slice(0,2)}) ${limpo.slice(2,6)}-${limpo.slice(6)}`;
    return                         `(${limpo.slice(0,2)}) ${limpo.slice(2,7)}-${limpo.slice(7)}`;
  }

  return (
    <div style={{ display: 'flex', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
      {/* Número com máscara automática */}
      <input
        className="form-control"
        style={{ flex: 2 }}
        placeholder="(11) 99999-9999"
        value={tel.numero}
        maxLength={15}
        onChange={e => onChange({ ...tel, numero: mascaraTelefone(e.target.value) })}
      />
      {/* Descrição livre: Celular, Comercial, esposa Edna, recado... */}
      <input
        className="form-control"
        style={{ flex: 1 }}
        placeholder="Descrição do Telefone"
        value={tel.tipo || ''}
        onChange={e => onChange({ ...tel, tipo: e.target.value })}
      />
      {/* Botão remover — só aparece a partir da segunda linha */}
      {index > 0 && (
        <button
          type="button"
          className="btn btn-danger"
          style={{ padding: '6px 10px', flexShrink: 0 }}
          onClick={onRemove}
        >✕</button>
      )}
    </div>
  );
}

// ============================================================
// LINHA EMAIL — campo de e-mail com validação de formato no blur
// ============================================================
function LinhaEmail({ email, index, onChange, onRemove }) {
  const [erroEmail, setErroEmail] = useState('');
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function handleBlur() {
    if (email && !emailRegex.test(email.trim())) {
      setErroEmail('E-mail inválido');
    } else {
      setErroEmail('');
    }
  }

  return (
    <div style={{ marginBottom: erroEmail ? '4px' : '8px' }}>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        <input
          className={`form-control ${erroEmail ? 'is-invalid' : ''}`}
          style={{ flex: 1 }}
          placeholder="email@exemplo.com"
          value={email}
          onChange={e => { setErroEmail(''); onChange(e.target.value); }}
          onBlur={handleBlur}
        />
        {index > 0 && (
          <button
            type="button"
            className="btn btn-danger"
            style={{ padding: '6px 10px', flexShrink: 0 }}
            onClick={onRemove}
          >✕</button>
        )}
      </div>
      {erroEmail && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroEmail}</small>}
    </div>
  );
}

// ============================================================
// CAMPO CEP — máscara xxxxx-xxx + busca automática via ViaCEP
// onAutoFill: chamado com { logradouro, bairro, cidade, estado }
// após busca bem-sucedida
// ============================================================
function CampoCEP({ value, onChange, onAutoFill }) {
  const [buscando, setBuscando] = useState(false);
  const [erroCep, setErroCep]   = useState('');

  // Aplica máscara xxxxx-xxx durante a digitação
  function mascaraCEP(v) {
    const limpo = v.replace(/\D/g, '').slice(0, 8);
    return limpo.replace(/(\d{5})(\d)/, '$1-$2');
  }

  function handleChange(e) {
    setErroCep('');
    onChange(mascaraCEP(e.target.value));
  }

  // Ao sair do campo: busca endereço na API ViaCEP (gratuita, sem autenticação)
  async function handleBlur() {
    const limpo = (value || '').replace(/\D/g, '');
    if (!limpo) return;
    if (limpo.length < 8) { setErroCep('CEP incompleto'); return; }

    setBuscando(true);
    setErroCep('');
    try {
      const resp = await fetch(`https://viacep.com.br/ws/${limpo}/json/`);
      const dados = await resp.json();

      if (dados.erro) {
        setErroCep('CEP não encontrado');
        return;
      }

      // Repassa os dados para o formulário pai preencher os campos
      onAutoFill({
        logradouro: dados.logradouro || '',
        bairro:     dados.bairro     || '',
        cidade:     dados.localidade || '',
        estado:     dados.uf         || '',
      });
    } catch {
      setErroCep('Erro ao consultar CEP — verifique a conexão');
    } finally {
      setBuscando(false);
    }
  }

  return (
    <div className="form-group">
      <label className="form-label">CEP</label>
      <input
        type="text"
        className={`form-control ${erroCep ? 'is-invalid' : ''}`}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder="00000-000"
        maxLength={9}
      />
      {buscando && <small style={{ color: '#888', fontSize: '12px' }}>🔍 Buscando endereço...</small>}
      {erroCep  && <small style={{ color: '#e74c3c', fontSize: '12px' }}>⚠️ {erroCep}</small>}
    </div>
  );
}

// ============================================================
// COMPONENTES AUXILIARES BÁSICOS
// Campo usa forwardRef para permitir que o pai passe um ref
// (usado pelo CampoCEP para mover o cursor para o campo Número)
// ============================================================
const Campo = React.forwardRef(function Campo({ label, value, onChange, type='text', placeholder='' }, ref) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input ref={ref} type={type} className="form-control" value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
});
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
