const fs = require('node:fs');
const path = require('node:path');

const raiz = path.resolve(__dirname, '..', 'backend', 'src');
const pastas = ['controllers', 'middleware', 'services', 'utils'];
let total = 0;
for (const pasta of pastas) {
  for (const arquivo of fs.readdirSync(path.join(raiz, pasta)).filter(a => a.endsWith('.js'))) {
    require(path.join(raiz, pasta, arquivo));
    total += 1;
  }
}
require(path.join(raiz, 'routes', 'index.js'));
console.log(`${total + 1} arquivos do backend carregados sem erro de importação.`);
