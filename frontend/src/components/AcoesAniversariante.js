// ============================================================
// AÇÕES DE ANIVERSARIANTE (menu "⋮" compartilhado)
// Usado no Relatório de Aniversariantes e no card do Dashboard — sem duplicar lógica.
//   "Parabenizar Zap"   → abre o WhatsApp (wa.me) com a mensagem pronta e REGISTRA o envio.
//   "Parabenizar E-mail" → abre a janela de confirmação com Para, Assunto e Mensagem; só "Enviar" manda o e-mail pelo servidor e REGISTRA o envio.
// Se o cliente já foi parabenizado neste ano, a janela do e-mail avisa (e o WhatsApp pede confirmação com ModalConfirmar) antes de reenviar.
// Props: pessoa (registro do aniversariante) e onFeito() (recarrega a lista após registrar).
//   Em vez de `pessoa`, pode vir buscarPessoa() (async): busca os dados só quando a pessoa clica numa ação
//   (usado nos relatórios, cujas linhas só têm o identificador).
// ============================================================

import React, { useRef, useState } from 'react';
import MenuAcoes from './MenuAcoes';
import ModalConfirmar from './ui/ModalConfirmar';
import ModalConfirmarEmail from './ui/ModalConfirmarEmail';
import { pessoasAPI } from '../services/api';
import { linkWhatsApp } from '../utils/whatsapp';
import { toast } from 'react-toastify';
import { formatarDataHora } from '../utils/formatters';

export default function AcoesAniversariante({ pessoa: pessoaInicial, buscarPessoa, onFeito }) {
  const [confirmar, setConfirmar] = useState(null);
  const [janelaEmail, setJanelaEmail] = useState(null);   // { pessoa } — janela de confirmação do e-mail de parabéns
  const carregada = useRef(null);   // dados buscados no clique no "⋮" (antes da escolha), para o WhatsApp não ser barrado como pop-up

  function antecipar() {
    if (pessoaInicial || !buscarPessoa || carregada.current) return;
    const p = buscarPessoa();
    p.catch(() => { carregada.current = null; });
    carregada.current = p;
  }

  // Executa de fato o parabéns por WhatsApp (abre o wa.me e registra). O e-mail passa pela janela de confirmação (enviarEmail).
  async function executar(pessoa) {
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
  }

  // Só chamado pelo botão "Enviar" da janela de confirmação do e-mail.
  async function enviarEmail(pessoa) {
    await pessoasAPI.parabenizar(pessoa.id, { canal: 'email' });
    toast.success('Parabéns enviado por e-mail!');
    onFeito && onFeito();
  }

  // Texto do aviso "já parabenizado neste ano" (usado na janela do e-mail e na confirmação do WhatsApp).
  function textoJaParabenizado(pessoa) {
    const primeiroNome = String(pessoa.nome || '').trim().split(/\s+/)[0] || pessoa.nome;
    const ult = pessoa.parabens[pessoa.parabens.length - 1];
    const canalTxt = ult.canal === 'whatsapp' ? 'WhatsApp' : 'e-mail';
    let quando = formatarDataHora(ult.enviado_em).split(' ')[0];
    if (quando === '—') quando = '';
    return `${primeiroNome} já foi parabenizado(a) por ${canalTxt}${ult.usuario_nome ? ` (${ult.usuario_nome})` : ''}${quando ? ` em ${quando}` : ''}.`;
  }

  // E-mail: SEMPRE abre a janela de confirmação (Para, Assunto, Mensagem). WhatsApp: se já foi parabenizado neste ano, pede
  // confirmação; senão abre o WhatsApp (o envio é feito pela própria pessoa lá).
  async function parabenizar(canal) {
    let pessoa = pessoaInicial;
    if (!pessoa && buscarPessoa) {
      try { pessoa = await (carregada.current || buscarPessoa()); }
      catch (err) { return toast.error(err.response?.data?.mensagem || 'Não foi possível carregar os dados do cliente'); }
    }
    if (!pessoa) return undefined;
    carregada.current = null;   // depois de parabenizar, a próxima vez busca de novo (o "já parabenizado" muda)
    const jaParabenizado = !!(pessoa.ja_parabenizado && pessoa.parabens?.length);
    if (canal === 'email') {
      setJanelaEmail({ pessoa });
    } else if (jaParabenizado) {
      setConfirmar({
        titulo: 'Já parabenizado',
        mensagem: `${textoJaParabenizado(pessoa)} Deseja enviar novamente?`,
        textoBotao: 'Enviar novamente',
        tipo: 'aviso',
        acao: () => executar(pessoa),
      });
    } else {
      executar(pessoa);
    }
    return undefined;
  }

  return (
    <>
      <span onClickCapture={antecipar} style={{ display: 'inline-block' }}>
        <MenuAcoes itens={[
          { label: 'Parabenizar Zap',    icone: '🟢', onClick: () => parabenizar('whatsapp') },
          { label: 'Parabenizar E-mail', icone: '✉️', onClick: () => parabenizar('email') },
        ]} />
      </span>
      {confirmar && <ModalConfirmar {...confirmar} onCancelar={() => setConfirmar(null)} />}
      {janelaEmail && (() => {
        const { pessoa } = janelaEmail;
        const avisos = [];
        if (pessoa.ja_parabenizado && pessoa.parabens?.length) avisos.push(`${textoJaParabenizado(pessoa)} Confira antes de enviar novamente.`);
        if (!pessoa.email) avisos.push('Este cliente não tem e-mail cadastrado. Cadastre um e-mail na ficha da pessoa para enviar o parabéns por e-mail.');
        return (
          <ModalConfirmarEmail titulo="Parabenizar por e-mail" textoBotao="Enviar parabéns" avisos={avisos}
            emails={pessoa.email ? [{ nome: pessoa.nome, para: pessoa.email, assunto: pessoa.assunto_email, texto: pessoa.mensagem }] : []}
            acao={() => enviarEmail(pessoa)} onCancelar={() => setJanelaEmail(null)} />
        );
      })()}
    </>
  );
}
