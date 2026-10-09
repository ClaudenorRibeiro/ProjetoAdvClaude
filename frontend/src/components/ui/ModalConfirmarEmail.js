// ============================================================
// JANELA DE CONFIRMAÇÃO DE E-MAIL — mostra o(s) e-mail(s) COMO SERÃO ENVIADOS (para quem, assunto e mensagem completa)
// antes de qualquer envio feito com um clique. Só o botão "Enviar" dispara; Cancelar, Esc e clicar fora não enviam nada.
//
// Uso:
//   <ModalConfirmarEmail titulo="Comunicar cliente"
//     emails={[{ nome: 'João', para: 'joao@x.com', assunto: '...', html: '<p>...</p>' }]}   // `html` (mostrado isolado, sem executar nada) OU `texto` (texto simples)
//     avisos={['Sem e-mail cadastrado: Maria']}          // observações em destaque (opcional)
//     acao={async () => { await api.enviar(); }}         // chamada ao clicar em Enviar; se der erro, mostra o motivo e a janela continua aberta
//     onCancelar={() => setJanela(null)} />              // sem `emails`, a janela só explica (avisos) e não oferece "Enviar"
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { toast } from 'react-toastify';

const rotulo = { fontSize: 12, fontWeight: 700, color: '#5b6472', textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: 2 };

export default function ModalConfirmarEmail({
  titulo = 'Confirmar envio de e-mail',
  emails = [],
  avisos = [],
  textoBotao = 'Enviar e-mail',
  acao,
  onCancelar,
}) {
  const [executando, setExecutando] = useState(false);
  const btnCancelarRef = useRef(null);
  const podeEnviar = emails.length > 0 && typeof acao === 'function';

  // Foca "Cancelar" ao abrir: um Enter sem querer não envia nada
  useEffect(() => { btnCancelarRef.current?.focus(); }, []);
  useEffect(() => {
    function aoTeclar(e) { if (e.key === 'Escape' && !executando) onCancelar(); }
    document.addEventListener('keydown', aoTeclar);
    return () => document.removeEventListener('keydown', aoTeclar);
  }, [onCancelar, executando]);

  async function enviar() {
    setExecutando(true);
    try {
      await acao();
      onCancelar();
    } catch (err) {
      toast.error(err?.response?.data?.mensagem || 'Não foi possível enviar o e-mail. Tente novamente.');
    } finally {
      setExecutando(false);
    }
  }

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }} onMouseDown={e => { if (e.target === e.currentTarget && !executando) onCancelar(); }}>
      <div className="modal-box" role="dialog" aria-modal="true" aria-label={titulo} style={{ maxWidth: 720, width: '95%' }}>
        <div className="modal-header">
          <h3>{titulo}</h3>
          <button type="button" className="modal-fechar" aria-label="Fechar" onClick={onCancelar} disabled={executando}>✕</button>
        </div>
        <div className="modal-body">
          {avisos.map((a, i) => (
            <div key={i} className="alerta alerta-aviso" style={{ marginBottom: 12 }}>{a}</div>
          ))}
          {podeEnviar && (
            <p style={{ margin: '0 0 12px', color: '#5b6472', fontSize: 13 }}>
              {emails.length === 1 ? 'Confira o e-mail abaixo. Ele só será enviado quando você clicar em Enviar.'
                : `Confira os ${emails.length} e-mails abaixo (um para cada destinatário). Eles só serão enviados quando você clicar em Enviar.`}
            </p>
          )}
          {emails.map((e, i) => (
            <div key={i} data-testid="email-a-enviar" style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 12, background: '#fff' }}>
              <div style={{ marginBottom: 8 }}>
                <div style={rotulo}>Para</div>
                <div>{e.nome ? <><strong>{e.nome}</strong> — </> : null}<span>{e.para}</span></div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <div style={rotulo}>Assunto</div>
                <div>{e.assunto}</div>
              </div>
              <div>
                <div style={rotulo}>Mensagem</div>
                {e.html != null ? (
                  // Corpo formatado do e-mail, mostrado isolado (sem scripts e sem acesso ao sistema), como o destinatário vai ver.
                  <iframe title={`Mensagem do e-mail${e.nome ? ` para ${e.nome}` : ''}`} sandbox="" srcDoc={e.html}
                    style={{ width: '100%', height: 340, border: '1px solid #e2e8f0', borderRadius: 6, background: '#fff' }} />
                ) : (
                  <div style={{ whiteSpace: 'pre-wrap', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 10, maxHeight: 340, overflowY: 'auto' }}>{e.texto}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="modal-footer">
          <button ref={btnCancelarRef} type="button" className="btn btn-secondary" onClick={onCancelar} disabled={executando}>{podeEnviar ? 'Cancelar' : 'Fechar'}</button>
          {podeEnviar && (
            <button type="button" className="btn btn-primary" onClick={enviar} disabled={executando}>{executando ? 'Enviando...' : textoBotao}</button>
          )}
        </div>
      </div>
    </div>
  );
}
