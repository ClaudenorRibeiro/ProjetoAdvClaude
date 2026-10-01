const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('perícias preserva assistente freelancer na criação, edição, consulta e remarcação', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../../src/controllers/periciasController.js'), 'utf8');
  assert.match(controller, /function parsarAssistente/);
  assert.match(controller, /assistente_tecnico_freela_id/);
  assert.match(controller, /COALESCE\(u\.nome, CONCAT\(af\.nome, ' \(freelancer\)'\)\)/);
  assert.match(controller, /o\.assistente_tecnico_freela_id/);
});
