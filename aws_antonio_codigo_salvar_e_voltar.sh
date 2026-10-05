#!/bin/bash
# IMPORTANTE — NÃO APAGAR. Guarda uma cópia do CÓDIGO do sistema (Antônio) ANTES de atualizar, e devolve essa cópia se a atualização der problema.
# Quem roda: o usuário, no SSH da instância Lightsail (AWS-Antônio), COMO USUÁRIO ubuntu (NÃO use sudo antes do comando).
# Este script NÃO mexe no banco de dados. Para voltar o banco, use o backup do HeidiSQL feito na MESMA hora do backup do código.
# ============================================================================================================
# COMO USAR (sempre dentro da pasta onde o arquivo foi colocado, normalmente /home/ubuntu):
#   1) ANTES de atualizar o código:      bash aws_antonio_codigo_salvar_e_voltar.sh salvar
#   2) Ver as cópias guardadas:          bash aws_antonio_codigo_salvar_e_voltar.sh listar
#   3) SÓ SE a atualização deu problema: bash aws_antonio_codigo_salvar_e_voltar.sh voltar
#        (usa a cópia mais recente; para escolher outra: ... voltar NOME-DO-ARQUIVO.tar.gz)
#      Depois do "voltar", restaure TAMBÉM o banco pelo HeidiSQL (backup da mesma hora): o código antigo não funciona com o banco novo.
# ----------------------------------------------------------------------------------------------------------
# O QUE FAZ
#   salvar: descobre sozinho a pasta do sistema (pelo PM2), confere se é a instância certa (nome do banco no .env), confere o espaço em disco
#           e cria UM arquivo compactado com o código inteiro (inclusive o .env, o .git e o frontend já compilado), SEM a pasta node_modules.
#           Fica em ~/backups_codigo/. Nunca apaga nem sobrescreve nada.
#   voltar: pede confirmação; para o sistema no PM2; MOVE a pasta atual para o lado (nada é apagado: fica como "...antes_da_volta_DATA");
#           descompacta a cópia no lugar; devolve a pasta node_modules; instala as dependências; liga o sistema no PM2 e confere se subiu.
#   Se qualquer verificação falhar, o script PARA e avisa sem alterar nada (antes do passo de mover a pasta).
# ============================================================================================================

set -u

INSTANCIA="Antônio"
PREFIXO="antonio"   # só letras minúsculas, para o nome dos arquivos
BANCO_ESPERADO="sistema_advocacia"
PASTA_COPIAS="${HOME}/backups_codigo"
NOME_PM2_PADRAO="advocacia-backend"

ALTEROU=0
erro()  { echo ""; echo "ERRO: $1"; [ "$ALTEROU" -eq 0 ] && echo "Nada foi alterado."; echo ""; exit 1; }
aviso() { echo "  - $1"; }
passo() { echo ""; echo "==> $1"; }

[ "$(id -u)" -eq 0 ] && erro "rode como usuário ubuntu, SEM sudo antes (o PM2 do usuário ubuntu é o que cuida do sistema)."
SUDO="sudo"
command -v sudo >/dev/null 2>&1 || SUDO=""
for prog in tar node pm2; do command -v "$prog" >/dev/null 2>&1 || erro "o programa '$prog' não foi encontrado neste servidor."; done

ACAO="${1:-}"
case "$ACAO" in salvar|voltar|listar) ;; *) echo "Uso: bash $0 salvar | listar | voltar [arquivo]"; exit 1;; esac

# ---------------------------------------------------------------- listar (não precisa descobrir nada)
if [ "$ACAO" = "listar" ]; then
  echo "Cópias do código guardadas em $PASTA_COPIAS (a mais recente por último):"
  ls -1 "$PASTA_COPIAS"/*.tar.gz 2>/dev/null | while read -r f; do echo "  $(basename "$f")  ($(du -h "$f" | cut -f1))"; done
  [ -e "$(ls -1 "$PASTA_COPIAS"/*.tar.gz 2>/dev/null | head -1)" ] || echo "  (nenhuma)"
  exit 0
fi

# ---------------------------------------------------------------- descobrir a pasta do sistema (PM2) e o nome do processo
passo "Procurando o sistema no PM2..."
ACHADO="$(pm2 jlist 2>/dev/null | node -e '
  let t=""; process.stdin.on("data",d=>t+=d).on("end",()=>{
    const ini=t.indexOf("["); let lista=[]; try{ lista=JSON.parse(t.slice(ini)); }catch(e){}
    const alvo=lista.filter(p=>{ const e=(p.pm2_env&&p.pm2_env.pm_exec_path)||""; return p.name==="'"$NOME_PM2_PADRAO"'" || /\/backend\/(src\/)?server\.js$/.test(e); });
    console.log(alvo.map(p=>p.name+"|"+((p.pm2_env&&p.pm2_env.pm_cwd)||"")+"|"+((p.pm2_env&&p.pm2_env.pm_exec_path)||"")).join("\n"));
  });' 2>/dev/null)"
QTD="$(printf '%s' "$ACHADO" | grep -c .)"
[ "$QTD" -eq 1 ] || erro "esperava achar 1 processo do sistema no PM2 e achei $QTD. Mande a saída do comando 'pm2 list' para a IA."
NOME_PM2="${ACHADO%%|*}"; RESTO="${ACHADO#*|}"; CWD_PM2="${RESTO%%|*}"; EXEC_PM2="${RESTO#*|}"
case "$CWD_PM2" in
  */backend) PASTA_BACKEND="$CWD_PM2";;
  *) case "$EXEC_PM2" in
       */backend/src/server.js) PASTA_BACKEND="${EXEC_PM2%/src/server.js}";;
       */backend/server.js)     PASTA_BACKEND="${EXEC_PM2%/server.js}";;
       *) erro "não consegui descobrir a pasta do backend pelo PM2 (pasta: '$CWD_PM2', arquivo: '$EXEC_PM2'). Mande a saída de 'pm2 list' para a IA.";;
     esac;;
esac
PASTA_SISTEMA="$(dirname "$PASTA_BACKEND")"
[ -d "$PASTA_SISTEMA/backend" ] && [ -d "$PASTA_SISTEMA/frontend" ] || erro "a pasta encontrada ($PASTA_SISTEMA) não parece ser a do sistema (faltam as pastas backend/frontend)."
aviso "processo PM2: $NOME_PM2"
aviso "pasta do sistema: $PASTA_SISTEMA"

# ---------------------------------------------------------------- é a instância certa? (nome do banco no .env)
ENV_ARQ="$PASTA_BACKEND/.env"
[ -f "$ENV_ARQ" ] || erro "não achei o arquivo $ENV_ARQ."
BANCO_REAL="$(grep -E '^[[:space:]]*DB_NAME=' "$ENV_ARQ" | tail -1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
[ -n "$BANCO_REAL" ] || erro "não achei DB_NAME no .env."
[ "$BANCO_REAL" = "$BANCO_ESPERADO" ] || erro "este servidor usa o banco '$BANCO_REAL', mas este script é o da instância Antônio (banco '$BANCO_ESPERADO'). Você abriu o SSH da instância errada? Use o script da outra instância."
aviso "banco do sistema: $BANCO_REAL (confere com a instância $INSTANCIA)"

mkdir -p "$PASTA_COPIAS" || erro "não consegui criar $PASTA_COPIAS."
chmod 700 "$PASTA_COPIAS"   # a cópia leva o .env (senhas): só o usuário ubuntu lê
NOME_PASTA="$(basename "$PASTA_SISTEMA")"
PAI="$(dirname "$PASTA_SISTEMA")"

# ================================================================ SALVAR
if [ "$ACAO" = "salvar" ]; then
  passo "Conferindo o espaço em disco..."
  USADO_KB="$(du -sk --exclude=node_modules "$PASTA_SISTEMA" 2>/dev/null | cut -f1)"
  LIVRE_KB="$(df -Pk "$PASTA_COPIAS" | awk 'NR==2{print $4}')"
  aviso "código a copiar: ~$((USADO_KB/1024)) MB; espaço livre: ~$((LIVRE_KB/1024)) MB"
  [ "$LIVRE_KB" -gt $((USADO_KB*2 + 204800)) ] || erro "pouco espaço livre no disco para a cópia (precisa do dobro do tamanho do código + 200 MB)."
  ARQ="$PASTA_COPIAS/${PREFIXO}_$(date +%Y%m%d-%H%M%S).tar.gz"
  passo "Criando a cópia: $ARQ"
  $SUDO tar --exclude='node_modules' -czpf "$ARQ" -C "$PAI" "$NOME_PASTA" || { rm -f "$ARQ"; erro "a compactação falhou (a cópia incompleta foi descartada)."; }
  $SUDO chown "$(id -u):$(id -g)" "$ARQ"
  chmod 600 "$ARQ"
  tar -tzf "$ARQ" >/dev/null 2>&1 || { rm -f "$ARQ"; erro "a cópia criada está com defeito (foi descartada). Tente de novo."; }
  tar -tzf "$ARQ" | grep -q "^$NOME_PASTA/backend/server.js\|^$NOME_PASTA/backend/src/" || { rm -f "$ARQ"; erro "a cópia não contém o código do backend (foi descartada)."; }
  echo ""
  echo "PRONTO. Cópia do código guardada:"
  echo "  $ARQ   ($(du -h "$ARQ" | cut -f1))"
  echo "Agora você já pode atualizar o código. Se algo der errado: bash $0 voltar"
  exit 0
fi

# ================================================================ VOLTAR
passo "Escolhendo a cópia..."
if [ -n "${2:-}" ]; then ARQ="$PASTA_COPIAS/$(basename "$2")"; else ARQ="$(ls -1 "$PASTA_COPIAS"/${PREFIXO}_*.tar.gz 2>/dev/null | sort | tail -1)"; fi
[ -n "$ARQ" ] && [ -f "$ARQ" ] || erro "não achei cópia do código em $PASTA_COPIAS (use 'listar' para ver). Sem cópia não há como voltar."
tar -tzf "$ARQ" >/dev/null 2>&1 || erro "a cópia $ARQ está com defeito."
tar -tzf "$ARQ" | grep -q "^$NOME_PASTA/backend/" || erro "a cópia $ARQ não é da pasta '$NOME_PASTA' deste servidor."
aviso "cópia escolhida: $(basename "$ARQ")  ($(du -h "$ARQ" | cut -f1), feita em $(date -r "$ARQ" '+%d/%m/%Y %H:%M'))"
echo ""
echo "ATENÇÃO: o sistema vai ser PARADO e o código volta ao estado dessa cópia."
echo "A pasta atual NÃO é apagada: fica guardada ao lado, como ${NOME_PASTA}.antes_da_volta_DATA."
echo "Lembre de restaurar TAMBÉM o banco pelo HeidiSQL (backup da mesma hora)."
printf "Digite SIM (em maiúsculas) para continuar: "
read -r RESP
[ "$RESP" = "SIM" ] || erro "não confirmado."

DATA="$(date +%Y%m%d-%H%M%S)"
LADO="${PASTA_SISTEMA}.antes_da_volta_${DATA}"
[ -e "$LADO" ] && erro "já existe $LADO."

ALTEROU=1
passo "Parando o sistema..."
pm2 stop "$NOME_PM2" >/dev/null 2>&1 || erro "não consegui parar o processo '$NOME_PM2' no PM2."

passo "Guardando a pasta atual ao lado e descompactando a cópia..."
if ! $SUDO mv "$PASTA_SISTEMA" "$LADO"; then pm2 start "$NOME_PM2" >/dev/null 2>&1; erro "não consegui mover a pasta atual (o sistema foi religado como estava)."; fi
if ! $SUDO tar -xzpf "$ARQ" -C "$PAI"; then
  $SUDO rm -rf "$PASTA_SISTEMA" 2>/dev/null
  $SUDO mv "$LADO" "$PASTA_SISTEMA" && pm2 start "$NOME_PM2" >/dev/null 2>&1
  erro "a descompactação falhou; a pasta atual foi devolvida ao lugar e o sistema religado."
fi

passo "Devolvendo as bibliotecas (node_modules) e instalando as dependências..."
for sub in backend frontend; do
  if [ -d "$LADO/$sub/node_modules" ] && [ ! -e "$PASTA_SISTEMA/$sub/node_modules" ]; then $SUDO mv "$LADO/$sub/node_modules" "$PASTA_SISTEMA/$sub/node_modules"; fi
done
( cd "$PASTA_BACKEND" && npm install --omit=dev --no-audit --no-fund --loglevel=error ) || aviso "o npm install do backend deu erro: veja a mensagem acima."

passo "Ligando o sistema..."
pm2 restart "$NOME_PM2" --update-env >/dev/null 2>&1 || pm2 start "$NOME_PM2" >/dev/null 2>&1
sleep 6
SITUACAO="$(pm2 jlist 2>/dev/null | node -e 'let t="";process.stdin.on("data",d=>t+=d).on("end",()=>{try{const l=JSON.parse(t.slice(t.indexOf("[")));const p=l.find(x=>x.name==="'"$NOME_PM2"'");console.log(p?p.pm2_env.status:"nao-encontrado")}catch(e){console.log("desconhecido")}})')"
PORTA="$(grep -E '^[[:space:]]*PORT=' "$PASTA_BACKEND/.env" | tail -1 | cut -d= -f2- | tr -d '\r"'"'"' ')"
RESP_HTTP="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${PORTA:-3001}/api/public/info" 2>/dev/null)"
echo ""
echo "Situação no PM2: $SITUACAO   |   resposta do sistema (/api/public/info): ${RESP_HTTP:-sem resposta}"
if [ "$SITUACAO" = "online" ] && [ "$RESP_HTTP" = "200" ]; then
  echo "PRONTO. O código voltou para a cópia $(basename "$ARQ") e o sistema está no ar."
else
  echo "ATENÇÃO: o sistema não confirmou que está no ar. Veja o log: pm2 logs $NOME_PM2 --lines 50   (e confira se o banco também foi restaurado)."
fi
echo "A pasta que estava em uso ficou guardada em: $LADO  (pode apagar depois que tudo estiver certo)."
echo "NÃO ESQUEÇA: restaure o banco pelo HeidiSQL com o backup da mesma hora."
