const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('listagem de prazos entrega a pasta para abrir o processo pelo CNJ', () => {
  const controller = fs.readFileSync(path.join(__dirname, '../../src/controllers/prazosController.js'), 'utf8');
  assert.match(controller, /pa\.id AS pasta_id/);
});
