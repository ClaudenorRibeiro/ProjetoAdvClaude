// ============================================================
// Configurações > Integrações: AVISO DIÁRIO DE ANDAMENTOS (DataJud). O administrador escolhe quando o resumo sai, se traz
// todos os andamentos novos ou só os tipos importantes e, por pessoa, como recebe (sino/e-mail) e de quais processos.
// Tem o próprio botão Salvar (não mexe no "Salvar configurações DataJud" do quadro de cima).
// ============================================================
import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { andamentosAvisosAPI } from '../../services/api';
import AvisoAndamentosPessoas from './AvisoAndamentosPessoas';
import AvisoAndamentosTipos from './AvisoAndamentosTipos';

const doServidor = (c) => ({
  modo: c.modo,
  horario: c.horario,
  importantes: new Set(c.tipos.filter(t => t.importante).map(t => t.codigo)),
  pessoas: c.usuarios,
});

export default function AvisoAndamentosConfig({ datajudAtivo }) {
  const [servidor, setServidor] = useState(null);
  const [r, setR] = useState(null);
  const [erroAoLer, setErroAoLer] = useState('');
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    let vivo = true;
    andamentosAvisosAPI.ler().then(({ data }) => {
      if (!vivo) return;
      setServidor(data.dados);
      setR(doServidor(data.dados));
    }).catch(() => { if (vivo) setErroAoLer('Não foi possível carregar o aviso de andamentos.'); });
    return () => { vivo = false; };
  }, []);

  if (erroAoLer) return <div className="card"><div role="alert" style={{ color: '#b91c1c' }}>{erroAoLer}</div></div>;
  if (!servidor || !r) return null;

  const mudarPessoa = (id, m) => setR({ ...r, pessoas: r.pessoas.map(p => (p.id === id ? { ...p, ...m } : p)) });
  const mudarTipo = (codigo, marcado) => {
    const novos = new Set(r.importantes);
    if (marcado) novos.add(codigo); else novos.delete(codigo);
    setR({ ...r, importantes: novos });
  };

  async function salvar() {
    setSalvando(true);
    const alteradas = r.pessoas
      .filter(p => {
        const antes = servidor.usuarios.find(x => x.id === p.id);
        return !antes || antes.canal !== p.canal || antes.escopo !== p.escopo;
      })
      .map(p => ({ id: p.id, canal: p.canal, escopo: p.escopo }));
    try {
      const { data } = await andamentosAvisosAPI.salvar({
        modo: r.modo,
        horario: r.horario,
        ...(servidor.tipos.length > 0 ? { tipos_importantes: [...r.importantes] } : {}),
        ...(alteradas.length > 0 ? { usuarios: alteradas } : {}),
      });
      setServidor(data.dados);
      setR(doServidor(data.dados));
      toast.success('Aviso de andamentos salvo!');
    } catch (err) {
      toast.error(err?.response?.data?.mensagem || 'Erro ao salvar o aviso de andamentos');
    } finally { setSalvando(false); }
  }

  return (
    <div className="card" role="group" aria-label="Aviso diário de andamentos">
      <h3 style={{ margin: '0 0 12px', fontSize: '15px', color: '#1e2a3a' }}>Aviso diário de andamentos (DataJud)</h3>
      <div style={{ background: '#eef2ff', border: '1px solid #c7d2fe', color: '#3730a3', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
        Toda noite o sistema consulta o DataJud dos processos ativos (os arquivados não entram) e, de manhã, cada pessoa recebe <b>um resumo</b> só
        com os andamentos que chegaram. A primeira noite apenas registra a situação de cada processo, sem avisar ninguém. O sistema guarda os
        andamentos do DataJud dos <b>últimos 6 meses</b>.
        {!datajudAtivo && <> <b>Ative a integração do DataJud acima</b> para o aviso funcionar.</>}
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label className="form-label" htmlFor="horario-aviso-andamentos">Horário do resumo (Brasília)</label>
          <input id="horario-aviso-andamentos" type="time" className="form-control" value={r.horario}
            onChange={e => setR({ ...r, horario: e.target.value })} />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="modo-aviso-andamentos">O resumo traz</label>
          <select id="modo-aviso-andamentos" className="form-control" value={r.modo}
            onChange={e => setR({ ...r, modo: e.target.value })}>
            <option value="todos">Todos os andamentos novos</option>
            <option value="importantes">Só os tipos marcados como importantes</option>
          </select>
        </div>
      </div>
      {r.modo === 'importantes' && <AvisoAndamentosTipos tipos={servidor.tipos} importantes={r.importantes} aoMudar={mudarTipo} />}

      <h4 style={{ margin: '16px 0 8px', fontSize: 13, color: '#555' }}>Quem recebe</h4>
      <AvisoAndamentosPessoas pessoas={r.pessoas} aoMudar={mudarPessoa} />

      <button className="btn btn-primary" disabled={salvando} onClick={salvar} style={{ marginTop: 16 }}>
        {salvando ? 'Salvando...' : 'Salvar aviso de andamentos'}
      </button>
    </div>
  );
}
