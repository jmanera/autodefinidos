// Carga el diccionario y el generador en Node.
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '../app/assets');
global.window = {};
for (const f of fs.readdirSync(path.join(dir, 'dict')).sort()) eval(fs.readFileSync(path.join(dir, 'dict', f), 'utf8'));
const G = require(path.join(dir, 'gen.js'));
const dict = G.parseDict(window.ADDict);
module.exports = { G, dict, gen: new G.Generator(dict) };
