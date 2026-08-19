// ============================================================
// MINI-MODAL DE CADASTRO RÁPIDO DE PARTE (Física ou Jurídica)
// Fica aqui, e não dentro de uma tela, porque é usado em DOIS lugares:
//   - Processos: botão "…" ao lado de Autor/Réu/Perito;
//   - Pessoas:   botão "…" do Responsável legal.
// ============================================================
import React, { useState, useRef } from 'react';
import { pessoasAPI } from '../services/api';
import { toast } from 'react-toastify';
import { toTitleCase, mascaraCPF, validarCPF, mascaraCNPJ, validarCNPJ, formatarTelefone, limparEmail, limparEspacos } from '../utils/formatters';
import { LinhaFone, LinhaEmail } from './LinhasContato';
import useEscFechar from '../hooks/useEscFechar';

// Grava só o essencial (Física: nome + CPF; Jurídica: razão social + CNPJ) pela
// MESMA rota/transação do cadastro normal; o resto se completa depois em Pessoas.
// Devolve a pessoa criada ({ id, nome } ou { id, razao_social }).
export default function ModalCadastroRapidoParte({ tipo, onFechar, onSalvo }) {
  const ehFisica = tipo === 'fisica';
  const [form, setForm]         = useState({});
  const [salvando, setSalvando] = useState(false);
  const [telefones, setTelefones] = useState([{ numero: '', tipo: '', principal: true }]);
  const [emails, setEmails]       = useState([{ email: '', principal: true }]);
  const [avisoDup, setAvisoDup]   = useState(''); // faixa interna: TODOS os avisos deste modal (nunca a notificação do canto)
  const overlayRef = useEscFechar(onFechar); // ESC fecha esta janelinha (só quando é a de cima)
  // Referências dos campos: o aviso precisa devolver o foco ao campo que causou o erro
  const refNome   = useRef(null);
  const refCpf    = useRef(null);
  const refRazao  = useRef(null);
  const refCnpj   = useRef(null);
  const refsTel   = useRef([]);   // uma por linha de telefone
  const refsEmail = useRef([]);   // uma por linha de e-mail
  const refFaixa  = useRef(null); // a própria faixa de aviso
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Mostra o aviso DENTRO do modal e põe o cursor no campo que originou o erro.
  // Sem campo (erro vindo do servidor), rola até a faixa para o aviso não passar batido.
  function avisar(mensagem, campo) {
    setAvisoDup(mensagem);
    setTimeout(() => {
      if (campo) campo.focus();
      else refFaixa.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 0);
  }

  async function salvar() {
    setAvisoDup('');
    if (ehFisica) {
      if (!form.nome?.trim())  { avisar('O nome é obrigatório.', refNome.current); return; }
      const cpfLimpo = form.cpf?.replace(/\D/g, '') || '';
      if (cpfLimpo && !validarCPF(cpfLimpo)) { avisar('CPF inválido. Confira os números digitados.', refCpf.current); return; }
    } else {
      if (!form.razao_social?.trim()) { avisar('A razão social é obrigatória.', refRazao.current); return; }
      const cnpjLimpo = form.cnpj?.replace(/\D/g, '') || '';
      if (cnpjLimpo && !validarCNPJ(cnpjLimpo)) { avisar('CNPJ inválido. Confira os números digitados.', refCnpj.current); return; }
    }

    // ── Formato do e-mail + bloqueio de telefone/e-mail repetido no MESMO cadastro ──
    // Telefone compara só os dígitos; e-mail em minúsculas. Linhas em branco não contam.
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    for (let i = 0; i < emails.length; i++) {
      const valor = limparEmail(emails[i].email || '');
      if (valor && !emailRegex.test(valor)) {
        avisar(`E-mail inválido: "${valor}". Corrija antes de cadastrar.`, refsEmail.current[i]);
        return;
      }
    }
    // As listas abaixo NÃO são filtradas: a posição precisa bater com a linha da tela para o foco cair no lugar certo
    const telsDigitos = telefones.map(t => (t.numero || '').replace(/\D/g, ''));
    const iTelRepetido = telsDigitos.findIndex((n, i) => n && telsDigitos.indexOf(n) !== i);
    if (iTelRepetido >= 0) {
      avisar(`O telefone ${formatarTelefone(telsDigitos[iTelRepetido])} está repetido. Cada telefone só pode aparecer uma vez neste cadastro — remova o duplicado.`, refsTel.current[iTelRepetido]);
      return;
    }
    const emailsNorm = emails.map(e => limparEmail(e.email || ''));
    const iEmailRepetido = emailsNorm.findIndex((e, i) => e && emailsNorm.indexOf(e) !== i);
    if (iEmailRepetido >= 0) {
      avisar(`O e-mail ${emailsNorm[iEmailRepetido]} está repetido. Cada e-mail só pode aparecer uma vez neste cadastro — remova o duplicado.`, refsEmail.current[iEmailRepetido]);
      return;
    }

    // Limpeza final antes de gravar: não depende de o campo ter perdido o foco.
    // Nome/descrição do telefone sem espaço sobrando; e-mail sem espaço nenhum e minúsculo.
    const nomeLimpo      = limparEspacos(form.nome || '');
    const razaoLimpa     = limparEspacos(form.razao_social || '');
    const telefonesLimpos = telefones.map(t => ({ ...t, tipo: limparEspacos(t.tipo || '') }));
    const emailsLimpos    = emails.map(e => ({ ...e, email: limparEmail(e.email || '') }));

    setSalvando(true);
    try {
      if (ehFisica) {
        const { data } = await pessoasAPI.criarFisica({ nome: nomeLimpo, cpf: form.cpf || null, telefones: telefonesLimpos, emails: emailsLimpos });
        if (data.ok) {
          toast.success('Pessoa física cadastrada!');
          onSalvo({ id: data.dados.id, nome: nomeLimpo });
        }
      } else {
        const { data } = await pessoasAPI.criarJuridica({ razao_social: razaoLimpa, cnpj: form.cnpj || null, telefones: telefonesLimpos, emails: emailsLimpos });
        if (data.ok) {
          toast.success('Pessoa jurídica cadastrada!');
          onSalvo({ id: data.dados.id, razao_social: razaoLimpa });
        }
      }
    } catch (err) {
      avisar(err.response?.data?.mensagem || 'Não foi possível cadastrar. Tente novamente.', null);
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} ref={overlayRef}>
      <div className="modal-box" style={{ maxWidth: '460px' }}>
        <div className="modal-header">
          <h3>{ehFisica ? 'Cadastrar Pessoa Física' : 'Cadastrar Pessoa Jurídica'}</h3>
          <button className="modal-fechar" onClick={onFechar}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: '13px', color: '#6b7280', marginBottom: '14px' }}>
            Cadastro rápido — os demais dados podem ser completados depois em <strong>Pessoas</strong>.
          </p>

          {/* Faixa de aviso do próprio sistema (no lugar da notificação do canto) */}
          {avisoDup && (
            <div ref={refFaixa} style={{ background:'#fef2f2', border:'1px solid #fecaca', color:'#b91c1c',
              borderRadius:'6px', padding:'8px 10px', marginBottom:'12px', fontSize:'13px',
              display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:'8px' }}>
              <span>⚠️ {avisoDup}</span>
              <button type="button" onClick={() => setAvisoDup('')}
                style={{ background:'none', border:'none', color:'#b91c1c', cursor:'pointer', fontSize:'15px', lineHeight:1 }}
                title="Fechar">✕</button>
            </div>
          )}

          {ehFisica ? (
            <>
              <div className="form-group">
                <label className="form-label">Nome completo *</label>
                <input className="form-control" autoFocus ref={refNome}
                  value={form.nome || ''} onChange={e => { setAvisoDup(''); set('nome', e.target.value); }}
                  onBlur={() => set('nome', toTitleCase(form.nome))} />
              </div>
              <div className="form-group">
                <label className="form-label">CPF</label>
                <input className="form-control" placeholder="000.000.000-00" ref={refCpf}
                  value={form.cpf || ''} onChange={e => { setAvisoDup(''); set('cpf', mascaraCPF(e.target.value)); }} />
              </div>
            </>
          ) : (
            <>
              <div className="form-group">
                <label className="form-label">Razão social *</label>
                <input className="form-control" autoFocus ref={refRazao}
                  value={form.razao_social || ''} onChange={e => { setAvisoDup(''); set('razao_social', e.target.value); }}
                  onBlur={() => set('razao_social', toTitleCase(form.razao_social))} />
              </div>
              <div className="form-group">
                <label className="form-label">CNPJ</label>
                <input className="form-control" placeholder="00.000.000/0000-00" ref={refCnpj}
                  value={form.cnpj || ''} onChange={e => { setAvisoDup(''); set('cnpj', mascaraCNPJ(e.target.value)); }} />
              </div>
            </>
          )}

          {/* Telefones */}
          <h4 style={{margin:'16px 0 8px',color:'#555',fontSize:'13px',fontWeight:600}}>Telefones</h4>
          {telefones.map((tel, i) => (
            <LinhaFone
              key={i}
              tel={tel}
              index={i}
              refNumero={el => { refsTel.current[i] = el; }}
              onChange={v => { setAvisoDup(''); setTelefones(t => t.map((x,j) => j===i ? v : x)); }}
              onRemove={() => { setAvisoDup(''); setTelefones(t => t.filter((_,j) => j!==i)); }}
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
              refEmail={el => { refsEmail.current[i] = el; }}
              onChange={v => { setAvisoDup(''); setEmails(t => t.map((x,j) => j===i ? {...x, email: v} : x)); }}
              onRemove={() => { setAvisoDup(''); setEmails(t => t.filter((_,j) => j!==i)); }}
            />
          ))}
          <button className="btn btn-outline" style={{fontSize:'12px'}} onClick={() => setEmails(e=>[...e,{email:'',principal:false}])}>
            + Adicionar e-mail
          </button>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onFechar} disabled={salvando}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando...' : 'Cadastrar'}
          </button>
        </div>
      </div>
    </div>
  );
}
