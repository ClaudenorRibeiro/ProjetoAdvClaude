// "há 3 dias" ao lado de quem está fazendo o prazo. Só aparece para o administrador, para quem está fazendo
// e para o responsável pelo prazo (os demais veem só o nome, como antes).
import React from 'react';
import { useAuth } from '../context/AuthContext';
import { haQuantoTempo } from '../utils/formatters';

export default function TempoFazendo({ prazo }) {
  const { usuario, ehAdmin } = useAuth();
  if (!prazo?.fazendo_por || !prazo.fazendo_desde) return null;
  const pode = ehAdmin || prazo.fazendo_por === usuario?.id || (prazo.delegado_para != null && prazo.delegado_para === usuario?.id);
  if (!pode) return null;
  const texto = haQuantoTempo(prazo.fazendo_desde);
  if (!texto) return null;
  return <span data-testid="tempo-fazendo" style={{ display: 'block', fontSize: '11px', color: '#5b6472', marginTop: '2px', whiteSpace: 'nowrap' }}>{texto}</span>;
}
