import React, { useEffect, useRef, useState } from 'react';
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { dataParaIsoLocal } from '../../utils/formatters';

function paraData(iso) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(iso || '')) ? new Date(`${iso}T12:00:00`) : null;
}

export default function SeletorData({ value, onChange, disabled = false, ariaLabel = 'Selecionar data', destaque = false }) {
  const selecionada = paraData(value);
  const [aberto, setAberto] = useState(false);
  const [mes, setMes] = useState(new Date());
  const ref = useRef(null);

  useEffect(() => {
    function fora(event) { if (ref.current && !ref.current.contains(event.target)) setAberto(false); }
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, []);

  const inicio = startOfWeek(startOfMonth(mes), { weekStartsOn: 0 });
  const fim = endOfWeek(endOfMonth(mes), { weekStartsOn: 0 });
  const dias = eachDayOfInterval({ start: inicio, end: fim });
  function escolher(dia) { onChange(dataParaIsoLocal(dia)); setAberto(false); }
  function hoje() { const data = new Date(); setMes(data); onChange(dataParaIsoLocal(data)); setAberto(false); }

  return (
    <div ref={ref} style={{ position: 'relative', width: '100%' }}>
      <button type="button" className="form-control" disabled={disabled} aria-label={ariaLabel}
        onClick={() => setAberto(a => { if (!a) setMes(new Date()); return !a; })}
        style={{ display:'flex', alignItems:'center', justifyContent:'space-between', textAlign:'left', cursor: disabled ? 'not-allowed' : 'pointer', background:'#fff', fontFamily:'inherit', fontSize:'14px', fontWeight:400 }}>
        <span style={{ color: value ? '#111827' : '#6b7280', fontFamily:'inherit', fontSize:'14px', fontWeight: destaque && value ? 700 : 400 }}>{selecionada ? format(selecionada, 'dd/MM/yyyy') : 'dd/mm/aaaa'}</span>
        <span aria-hidden="true" style={{ display:'inline-flex', color:'#374151' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </span>
      </button>
      {aberto && !disabled && (
        <div onWheel={e => { e.preventDefault(); setMes(m => addMonths(m, e.deltaY > 0 ? 1 : -1)); }}
          style={{ position:'absolute', zIndex:200, top:'calc(100% + 4px)', left:0, width:'280px', padding:'10px', background:'#fff', border:'1px solid #cbd5e1', borderRadius:'7px', boxShadow:'0 8px 20px rgba(0,0,0,.18)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
            <button type="button" onClick={() => setMes(m => addMonths(m, -1))} style={{border:0,background:'none',cursor:'pointer',fontSize:'20px'}}>‹</button>
            <strong style={{fontSize:'13px'}}>{format(mes, 'MMMM yyyy', { locale: ptBR })}</strong>
            <button type="button" onClick={() => setMes(m => addMonths(m, 1))} style={{border:0,background:'none',cursor:'pointer',fontSize:'20px'}}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7, 1fr)',textAlign:'center',gap:'2px'}}>
            {'DSTQQSS'.split('').map((d,i) => <span key={`${d}-${i}`} style={{fontSize:'11px',fontWeight:700,color:'#475569',padding:'4px'}}>{d}</span>)}
            {dias.map(dia => {
              const ativa = selecionada && isSameDay(dia, selecionada);
              const ehHoje = isToday(dia);
              return <button type="button" key={dia.toISOString()} onClick={() => escolher(dia)}
                style={{ border: 0, borderRadius: '4px', padding: '6px 2px', cursor: 'pointer',
                  // Hoje tem prioridade visual: permanece verde até quando também está selecionado.
                  background: ehHoje ? '#16a34a' : ativa ? '#2563eb' : 'transparent',
                  color: ehHoje || ativa ? '#fff' : !isSameMonth(dia, mes) ? '#94a3b8' : '#111827',
                  fontWeight: ehHoje ? 700 : 400 }}>
                {format(dia, 'd')}
              </button>;
            })}
          </div>
          <div style={{display:'flex',justifyContent:'space-between',marginTop:'8px'}}><button type="button" onClick={() => { onChange(''); setAberto(false); }} style={{border:0,background:'none',color:'#2563eb',cursor:'pointer'}}>Limpar</button><button type="button" onClick={hoje} style={{border:0,background:'none',color:'#2563eb',cursor:'pointer'}}>Hoje</button></div>
        </div>
      )}
    </div>
  );
}
