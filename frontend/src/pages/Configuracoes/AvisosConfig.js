// Configurações > Avisos aos clientes: para cada módulo, "mostrar antes de enviar" e quantos dias antes sai o lembrete.
// 0 dias = no mesmo dia. Perícia e audiência contam dias ÚTEIS; parabéns conta dias corridos.
import React from 'react';

const MODULOS = [
  { chave: 'pericia',   nome: 'Perícia',   campoMostrar: 'avisos_pericia_mostrar',   campoDias: 'dias_alerta_pericia',   padrao: 2, unidade: 'dias úteis', quando: 'a perícia' },
  { chave: 'audiencia', nome: 'Audiência', campoMostrar: 'avisos_audiencia_mostrar', campoDias: 'dias_alerta_audiencia', padrao: 3, unidade: 'dias úteis', quando: 'a audiência' },
  { chave: 'parabens',  nome: 'Parabéns de aniversário', campoMostrar: 'avisos_parabens_mostrar', campoDias: 'dias_aviso_parabens', padrao: 0, unidade: 'dias', quando: 'o aniversário' },
];

const ligado = (v) => v === null || v === undefined ? true : Number(v) === 1;

export default function AvisosConfig({ form, set }) {
  return (
    <div>
      <h4 style={{ margin: '20px 0 4px', fontSize: '13px', fontWeight: 600, color: '#555' }}>Avisos aos clientes</h4>
      <small style={{ color: '#5b6472', display: 'block', marginBottom: 10 }}>
        Com "mostrar antes de enviar" ligado, o aviso espera na tela <b>Avisos aos clientes</b> até alguém conferir e enviar.
        Desligado, sai sozinho por e-mail e SMS (WhatsApp nunca é automático). Quem vê a tela é definido em Permissões.
      </small>
      {MODULOS.map(m => (
        <div key={m.chave} className="grid-2" style={{ alignItems: 'end' }}>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
              <input type="checkbox" aria-label={`Mostrar avisos de ${m.nome} antes de enviar`} checked={ligado(form[m.campoMostrar])}
                onChange={e => set(m.campoMostrar, e.target.checked ? 1 : 0)} />
              <span>{m.nome}: mostrar antes de enviar</span>
            </label>
          </div>
          <div className="form-group">
            <label className="form-label" htmlFor={`dias-${m.chave}`}>Lembrete de {m.nome.toLowerCase()} — {m.unidade} antes de {m.quando}</label>
            <input id={`dias-${m.chave}`} type="number" min="0" max="365" className="form-control"
              value={form[m.campoDias] ?? m.padrao} onChange={e => set(m.campoDias, e.target.value)} />
            <small style={{ color: '#5b6472' }}>0 = no mesmo dia</small>
          </div>
        </div>
      ))}
    </div>
  );
}
