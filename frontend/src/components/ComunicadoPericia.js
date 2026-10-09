// ============================================================
// COMUNICADO DA PERÍCIA AO CLIENTE (e-mail) com CONFIRMAÇÃO
// Usado na tela Perícias e na aba Perícias da pasta do processo: o clique em "Comunicar cliente" / "Reenviar comunicado"
// NÃO envia na hora. Busca a prévia no servidor (mesma montagem do envio) e abre a janela com Para, Assunto e Mensagem;
// só o botão "Enviar" dispara o e-mail.
// Uso: const { pedirComunicado, janelaComunicado } = useComunicadoPericia(() => recarregar());
//      onClick: () => pedirComunicado(p.id, p.comunicado_enviado)      e, no return:  {janelaComunicado}
// ============================================================

import React, { useState } from 'react';
import { toast } from 'react-toastify';
import { periciasAPI } from '../services/api';
import ModalConfirmarEmail from './ui/ModalConfirmarEmail';

export default function useComunicadoPericia(aoEnviar) {
  const [janela, setJanela] = useState(null);

  async function pedirComunicado(id, reenviar = false) {
    try {
      const { data } = await periciasAPI.previaComunicado(id);
      const { mensagens = [], semEmail = [] } = data.dados || {};
      setJanela({
        id,
        titulo: reenviar ? 'Reenviar comunicado ao cliente' : 'Comunicar cliente',
        emails: mensagens.map(m => ({ nome: m.nome, para: m.para, assunto: m.assunto, html: m.html })),
        avisos: semEmail.length ? [`Sem e-mail cadastrado, não receberão: ${semEmail.join(', ')}.`] : [],
      });
    } catch (err) {
      toast.error(err.response?.data?.mensagem || 'Não foi possível montar o comunicado');
    }
  }

  async function enviar() {
    const { data } = await periciasAPI.enviarComunicado(janela.id);
    toast.success(data.mensagem || 'Comunicado enviado ao cliente');
    if (aoEnviar) aoEnviar();
  }

  const janelaComunicado = janela && (
    <ModalConfirmarEmail titulo={janela.titulo} emails={janela.emails} avisos={janela.avisos}
      textoBotao="Enviar comunicado" acao={enviar} onCancelar={() => setJanela(null)} />
  );
  return { pedirComunicado, janelaComunicado };
}
