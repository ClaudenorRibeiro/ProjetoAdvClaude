// ============================================================
// NOVIDADES DOS PROCESSOS: os andamentos do DataJud que chegaram nos últimos dias, nos processos que a pessoa acompanha
// (o escopo que o administrador escolheu para ela: os meus ou todos). É para onde o sino leva o resumo da manhã.
// ============================================================
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { andamentosAvisosAPI } from '../../services/api';
import { formatarData } from '../../utils/formatters';

const pasta = (n) => String(n).padStart(4, '0');

export default function NovidadesProcessos() {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    let vivo = true;
    andamentosAvisosAPI.novidades().then(({ data }) => { if (vivo) setDados(data.dados); })
      .catch(() => { if (vivo) setErro('Não foi possível carregar as novidades.'); });
    return () => { vivo = false; };
  }, []);

  if (erro) return <div className="card"><div role="alert" style={{ color: '#b91c1c' }}>{erro}</div></div>;
  if (!dados) return <div className="loading">Carregando...</div>;

  return (
    <div className="card">
      <h2 style={{ margin: '0 0 6px', fontSize: 18 }}>Novidades dos processos</h2>
      <p style={{ color: '#5b6472', marginTop: 0 }}>
        Andamentos do DataJud que chegaram nos últimos {dados.dias} dias nos processos que você acompanha.
      </p>
      {dados.processos.length === 0 ? (
        <p>Nenhum andamento novo nos últimos {dados.dias} dias.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {dados.processos.map(p => (
            <li key={p.processo_id} style={{ padding: '10px 0', borderBottom: '1px solid #e5e7eb' }}>
              <Link to={`/processos/pasta/${p.pasta_id}?aba=andamentos`} style={{ color: '#1e40af' }}>
                <strong>Pasta {pasta(p.numPasta)}</strong> · {p.numero || 'sem número'}
              </Link>
              {p.titulo && <div style={{ color: '#5b6472' }}>{p.titulo}</div>}
              <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {p.andamentos.map(a => <li key={a.id}>{formatarData(a.data)} — {a.descricao}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
