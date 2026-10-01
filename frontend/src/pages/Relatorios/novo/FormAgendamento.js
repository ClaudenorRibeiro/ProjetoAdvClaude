// ============================================================
// RELATÓRIOS — formulário de um envio agendado (quando, formato e para quem).
// Só aparecem para marcar os usuários ATIVOS com e-mail e acesso ao assunto; os demais ficam desabilitados com o motivo.
// ============================================================
import React, { useState } from 'react';

const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

export function descreverQuando(a) {
  const hora = `às ${a.hora}`;
  if (a.frequencia === 'diaria') return `Todo dia ${hora}`;
  if (a.frequencia === 'semanal') return `Toda ${DIAS[a.dia_semana]} ${hora}`;
  return `Todo dia ${a.dia_mes} do mês ${hora}`;
}

export default function FormAgendamento({ inicial, candidatos, salvando, onSalvar, onCancelar }) {
  const [f, setF] = useState({ frequencia: 'diaria', dia_semana: 1, dia_mes: 1, hora: '08:00', formato: 'pdf', ...inicial });
  const [marcados, setMarcados] = useState(new Set((inicial?.destinatarios || []).map(d => d.id)));
  const muda = (campo) => (e) => setF(x => ({ ...x, [campo]: e.target.value }));
  const alternar = (id) => setMarcados(s => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const elegiveis = new Set(candidatos.filter(c => c.pode).map(c => c.id));
  const validos = [...marcados].filter(id => elegiveis.has(id));

  const enviar = () => onSalvar({
    frequencia: f.frequencia, hora: f.hora, formato: f.formato, destinatarios: validos,
    ...(f.frequencia === 'semanal' ? { dia_semana: Number(f.dia_semana) } : {}),
    ...(f.frequencia === 'mensal' ? { dia_mes: Number(f.dia_mes) } : {}),
  });

  return (
    <div style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: 12, marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <label>Frequência<br />
          <select className="form-control" value={f.frequencia} onChange={muda('frequencia')}>
            <option value="diaria">Todo dia</option><option value="semanal">Toda semana</option><option value="mensal">Todo mês</option>
          </select>
        </label>
        {f.frequencia === 'semanal' && (
          <label>Dia da semana<br />
            <select className="form-control" value={f.dia_semana} onChange={muda('dia_semana')}>{DIAS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select>
          </label>
        )}
        {f.frequencia === 'mensal' && (
          <label>Dia do mês<br />
            <input className="form-control" type="number" min="1" max="31" value={f.dia_mes} onChange={muda('dia_mes')} style={{ width: 90 }} />
          </label>
        )}
        <label>Horário<br /><input className="form-control" type="time" value={f.hora} onChange={muda('hora')} /></label>
        <label>Formato<br />
          <select className="form-control" value={f.formato} onChange={muda('formato')}>
            <option value="pdf">PDF</option><option value="docx">Word</option><option value="xlsx">Excel</option>
          </select>
        </label>
      </div>
      {f.frequencia === 'mensal' && Number(f.dia_mes) > 28 && <p style={{ fontSize: 12, color: '#92400e', margin: '6px 0 0' }}>Em meses mais curtos, o envio sai no último dia do mês.</p>}

      <p style={{ margin: '12px 0 4px', fontWeight: 600 }}>Quem recebe</p>
      <div style={{ maxHeight: 160, overflow: 'auto' }}>
        {candidatos.map(c => (
          <label key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '2px 0', opacity: c.pode ? 1 : 0.6, cursor: c.pode ? 'pointer' : 'not-allowed' }}>
            <input type="checkbox" disabled={!c.pode} checked={marcados.has(c.id)} onChange={() => alternar(c.id)} />
            <span>{c.nome}{!c.pode && <small style={{ color: '#92400e' }}> — {c.motivo}</small>}</span>
          </label>
        ))}
      </div>
      <p role="note" style={{ fontSize: 12, color: '#374151', marginBottom: 8 }}>
        O relatório é gerado <strong>com as suas permissões</strong>, então o anexo mostra o que <strong>você</strong> pode ver. Só usuários do sistema recebem.
        Se alguém perder o acesso, deixa de receber; após 3 falhas seguidas o envio é pausado e você é avisado.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button className="btn btn-secondary" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" disabled={salvando || !validos.length} onClick={enviar}>{salvando ? 'Salvando...' : 'Salvar envio'}</button>
      </div>
    </div>
  );
}
