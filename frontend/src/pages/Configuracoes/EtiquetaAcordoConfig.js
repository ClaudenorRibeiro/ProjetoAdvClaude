import React, { useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import { etiquetasAPI } from '../../services/api';
import EtiquetaAcordo, { COR_ACORDO_PADRAO, esquecerCorAcordo, estiloFundoAcordo } from '../../components/EtiquetaAcordo';

// Configurações > Etiquetas do escritório > Processos: linha "Acordo (automática)". Não é uma das 5 etiquetas manuais:
// o processo que tem acordo (não cancelado) ganha SOZINHO a etiqueta "Acordo" e um fundo, os dois nesta cor.
export default function EtiquetaAcordoConfig() {
  const [cor, setCor] = useState(COR_ACORDO_PADRAO);
  const [salva, setSalva] = useState(COR_ACORDO_PADRAO);
  const [personalizada, setPersonalizada] = useState(false);
  const [configuravel, setConfiguravel] = useState(true);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    etiquetasAPI.corAcordo().then(({ data }) => {
      if (!data?.ok) return;
      setCor(data.dados.cor); setSalva(data.dados.cor);
      setPersonalizada(!!data.dados.personalizada); setConfiguravel(data.dados.configuravel !== false);
    }).catch(() => {});
  }, []);

  async function gravar(nova) {
    setSalvando(true);
    try {
      const { data } = await etiquetasAPI.salvarCorAcordo(nova);
      if (data.ok) {
        esquecerCorAcordo();
        setCor(data.dados.cor); setSalva(data.dados.cor); setPersonalizada(!!data.dados.personalizada);
        toast.success(nova ? 'Cor da etiqueta Acordo salva!' : 'Cor padrão da etiqueta Acordo restaurada!');
      } else toast.error(data.mensagem || 'Não foi possível salvar a cor.');
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Não foi possível salvar a cor.');
    } finally { setSalvando(false); }
  }

  return (
    <div className="card" style={{ marginTop: 16 }} data-testid="config-etiqueta-acordo">
      <h3 style={{ margin: '0 0 6px' }}>Acordo (automática)</h3>
      <p style={{ color: '#5b6472', fontSize: 13, margin: '0 0 14px' }}>
        Todo processo que tiver um <strong>acordo</strong> cadastrado (alvará e acordo cancelado não contam) ganha sozinho a etiqueta
        <strong> "Acordo"</strong> e um fundo colorido, na lista de Processos, no alto da pasta e na aba Processos da pasta.
        A etiqueta e o fundo usam a mesma cor, que você escolhe aqui. Ela não ocupa nenhuma das 5 etiquetas acima.
      </p>
      {!configuravel && (
        <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', color: '#92400e', padding: '8px 12px', borderRadius: 6, fontSize: 13, marginBottom: 12 }}>
          Para escolher a cor, o banco precisa ser atualizado: rode o script <strong>sql_cor_etiqueta_acordo_para_heidi.sql</strong> no HeidiSQL.
          Enquanto isso vale a cor padrão.
        </div>
      )}
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="cor-etiqueta-acordo" className="form-label" style={{ margin: 0 }}>Cor</label>
        <input id="cor-etiqueta-acordo" type="color" aria-label="Cor da etiqueta Acordo" value={cor} disabled={!configuravel || salvando}
          onChange={e => setCor(e.target.value)} style={{ width: 56, height: 36, padding: 2, cursor: configuravel ? 'pointer' : 'not-allowed' }} />
        <span style={{ color: '#5b6472', fontSize: 13 }}>{personalizada ? cor.toUpperCase() : 'Cor padrão do sistema'}</span>
        <div className="tabela-wrapper" style={{ minWidth: 260 }}>
          <table className="tabela" aria-label="Exemplo de processo com acordo">
            <tbody><tr className="linha-acordo" style={estiloFundoAcordo(cor)}>
              <td>Exemplo do processo <EtiquetaAcordo cor={cor} style={{ marginLeft: 8 }} /></td>
            </tr></tbody>
          </table>
        </div>
      </div>
      <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
        <button className="btn btn-primary" onClick={() => gravar(cor)} disabled={!configuravel || salvando || cor === salva}>
          {salvando ? 'Salvando...' : 'Salvar cor do Acordo'}
        </button>
        <button className="btn btn-outline" onClick={() => gravar('')} disabled={!configuravel || salvando || !personalizada}>
          Voltar à cor padrão
        </button>
      </div>
    </div>
  );
}
