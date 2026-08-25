const assert = require('node:assert/strict');
const {parseMoney, normalizeMoneyText} = require('../features/money-input.js');

assert.equal(parseMoney('250'), 250);
assert.equal(parseMoney('250,00'), 250);
assert.equal(parseMoney('250.00'), 250);
assert.equal(parseMoney('1.250,50'), 1250.5);
assert.equal(parseMoney('R$ 284,91'), 284.91);
assert.equal(parseMoney(''), 0);
assert.equal(parseMoney('-10'), 0);
assert.equal(normalizeMoneyText('250'), '250,00');
assert.equal(normalizeMoneyText('250,5'), '250,50');

console.log('money-input tests passed');
