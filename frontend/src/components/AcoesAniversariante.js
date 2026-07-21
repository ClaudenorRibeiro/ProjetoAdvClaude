// ============================================================
// AÇÕES DE ANIVERSARIANTE (menu "⋮" compartilhado)
// Usado no Relatório de Aniversariantes e no card do Dashboard — sem duplicar lógica.
//   "Parabenizar Zap"   → abre o WhatsApp (wa.me) com a mensagem pronta e REGISTRA o envio.
//   "Parabenizar E-mail" → envia o e-mail pelo servidor e REGISTRA o envio.
// Se o cliente já foi parabenizado neste ano, pede confirmação (ModalConfirmar) antes de reenviar.
// Props: pessoa (registro do aniversariante) e onFeito() (recarrega a lista após registrar).
// ============================================================

import React, { useState } from 'react';
import MenuAcoes from './MenuAcoes';
import ModalConfirmar from './ui/ModalConfirmar';
import { pessoasAPI } from '../services/api';
import { linkWhatsApp } from '../utils/whatsapp';
import { toast } from 'react-toastify';

export default function AcoesAniversariante({ pessoa, onFeito }) {
  const [confirmar, setConfirmar] = useState(null);
  const primeiroNome = String(pessoa.nome || '').trim().split(/\s+/)[0] || pessoa.nome;

  // Executa de fato o parabéns (WhatsApp abre o wa.me e registra; E-mail envia e registra).
  async function executar(canal) {
    if (canal === 'whatsapp') {
      if (!pessoa.telefone) return toast.error('Este cliente não tem telefone cadastrado');
      const link = linkWhatsApp(pessoa.telefone, pessoa.mensagem);
      if (!link) return toast.error('Telefone inválido para o WhatsApp');
      window.open(link, '_blank', 'noopener');
      try {
        await pessoasAPI.parabenizar(pessoa.id, { canal: 'whatsapp' });
        toast.success('Registrado! Confira o WhatsApp aberto e clique em enviar.');
        onFeito && onFeito();
      } catch (err) {
        toast.error(err.response?.data?.mensagem || 'Erro ao registrar o parabéns');
      }
    } else {
      try {
        await pessoasAPI.parabenizar(pessoa.id, { canal: 'email' });
        toast.success('Parabéns enviado por e-mail!');
        onFeito && onFeito();
      } catch (err) {
        toast.error(err.response?.data?.mensagem || 'Erro ao enviar o e-mail');
      }
    }
  }

  // Se já foi parabenizado neste ano, abre o modal padrão de confirmação; senão, executa direto.
  function parabenizar(canal) {
    if (pessoa.ja_parabenizado && pessoa.parabens?.length) {
      const ult = pessoa.parabens[pessoa.parabens.length - 1];
      const canalTxt = ult.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail';
      let quando = '';
      try { quando = new Date(ult.enviado_em).toLocaleDateString('pt-BR'); } catch (_) { quando = ''; }
      setConfirmar({
        titulo: 'Já parabenizado',
        mensagem: `${primeiroNome} já foi parabenizado(a) por ${canalTxt}` +
          `${ult.usuario_nome ? ` (${ult.usuario_nome})` : ''}${quando ? ` em ${quando}` : ''}. ` +
          `Deseja enviar novamente?`,
        textoBotao: 'Enviar novamente',
        tipo: 'aviso',
        acao: () => executar(canal),
      });
    } else {
      executar(canal);
    }
  }

  return (
    <>
      <MenuAcoes itens={[
        { label: 'Parabenizar Zap',    icone: '🟢', onClick: () => parabenizar('whatsapp') },
        { label: 'Parabenizar E-mail', icone: '✉️', onClick: () => parabenizar('email') },
      ]} />
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
    </>
  );
}
