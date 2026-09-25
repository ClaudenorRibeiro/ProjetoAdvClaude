# Bateria profissional do NovoJud

Esta bateria acompanha o código no Git. Ela não acessa o banco real e recusa nomes de banco sem o sufixo `_test`, usuários `root`/`admin` e hosts remotos.

## Preparação única no computador

1. No HeidiSQL local, abra `quality/sql/CRIAR_BANCO_TESTE_HEIDISQL.sql`.
2. Troque `TROQUE_ESTA_SENHA` por uma senha exclusiva e execute o arquivo.
3. Copie `backend/.env.test.example` para `backend/.env.test` e informe a mesma senha.
4. Em `frontend`, execute uma vez `npx playwright install chromium firefox webkit`.

O arquivo `backend/.env.test` fica fora do Git. Nunca reutilize nele a senha do banco real.

## Execução

- `TESTAR-SISTEMA.bat` — rápida: regras, contratos, proteção das 293 rotas e build.
- `TESTAR-SISTEMA.bat completo` — rápida + MySQL isolado + fluxo crítico no navegador.
- `TESTAR-SISTEMA.bat profundo` — todos os navegadores, tamanhos de tela, cobertura, mutação e auditoria de dependências.

O perfil rápido deve ser executado em cada manutenção. O completo deve ser executado antes do push. O profundo deve ser executado em mudanças grandes e revisões periódicas.

## O que uma aprovação significa

- Teste unitário aprovado: a regra isolada devolveu o resultado esperado.
- Teste de API aprovado: autenticação, permissão, transação e persistência funcionaram no MySQL descartável.
- Teste de navegador aprovado: o usuário conseguiu completar o fluxo pela interface.
- Build aprovado: o frontend compilou; isto aparece separado porque build não é teste.
- Mutação aprovada: alterações erradas introduzidas de propósito foram detectadas pelos testes.

Falha no preparo, teste ignorado, quantidade inesperada de rotas/tabelas ou banco inseguro faz a bateria terminar com erro. As etapas independentes continuam quando isso é seguro, para o relatório mostrar todas as falhas encontradas na mesma execução.

## Serviços externos

A bateria normal não envia e-mail, SMS, convites, arquivos para S3 nem chamadas pagas. As configurações de integração permanecem desativadas nos dados de teste. A disponibilidade real de fornecedores deve ser verificada por um teste operacional separado e conscientemente autorizado.
