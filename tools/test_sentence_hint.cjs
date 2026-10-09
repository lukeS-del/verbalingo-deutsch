// Execute the actual compiled widget renderer with inert UI primitives.
// No browser storage, study session, answer submission or learning progress.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'main.dart.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('A.a0E.prototype={\nE(a9){');
const end = source.indexOf('\nA.', start);
assert.ok(start >= 0 && end > start, 'Expected the supported exercise widget');
const widgetSource = source.slice(start, end);
const hintLabel = JSON.parse(source.match(/B\.a3C=new A\.ag\(("(?:\\.|[^"\\])*")/)[1]);

function fixture(translation = 'Мой муж работает врачом (в больнице).', sense = null, step = 'ei') {
  const style = new Proxy({}, {get: () => null});
  const B = new Proxy({b: {C: (a, b) => a.push(...b)}, c: {c0: s => s.trim()}, a3C: hintLabel, a31: 'Подсказка — первые буквы', a2h: 'Подсказка — перевод определения'},
    {get: (target, name) => name in target ? target[name] : name});
  const A = {
    a0E: function () {}, Nb: () => false, F: () => ({ok: style, ax: {b: 'blue'}}),
    w: text => ({text}), b: array => array, aV: children => ({children}),
    bo: (value, pattern, replacement) => value.replace(pattern, replacement),
    iA: (_icon, label, click) => ({label, click}), jr: (_style, children) => ({children}),
    dM: function (_a, _b, _c, children) { this.children = children; },
  };
  const context = {A, B, t: {p: 'widgets'}, u: {N: 'Подсказка использована'},
    $: {aRR: () => /\s*\((.+)\)\s*$/}};
  vm.runInNewContext(widgetSource, context);
  const controller = {
    id: false, k2: false,
    ax: {b: B[step], a: {d: 'мужчина, муж', e: sense}, c: {b: 'Mein ___ arbeitet als Arzt.', e: translation}, d: null, w: 'Ma'},
    ga6u() { return () => { this.id = true; }; },
    gQE() { return () => { this.k2 = true; }; },
  };
  const widget = {c: controller, d: false};
  return {controller, widget, render: () => A.a0E.prototype.E.call(widget, {})};
}
function flatten(tree) {
  if (Array.isArray(tree)) return tree.flatMap(flatten);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...flatten(tree.children)];
}

test('hint initially hides the sentence translation and uses a clear button label', () => {
  const f = fixture(); const nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === 'Mein ___ arbeitet als Arzt.'));
  assert.ok(nodes.some(n => n.label === 'Подсказка — перевод предложения'));
  assert.ok(!nodes.some(n => n.text?.includes('Мой муж')));
});

test('clicking the existing hint reveals the full current sentence, including parentheses', () => {
  const f = fixture(); flatten(f.render()).find(n => n.label === hintLabel).click();
  const nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === 'Мой муж работает врачом (в больнице).'));
  assert.ok(!nodes.some(n => n.text === 'мужчина, муж'));
  assert.ok(!nodes.some(n => n.label === hintLabel));
});

test('the next exercise begins with its own translation hidden', () => {
  const first = fixture(); first.controller.id = true; first.render();
  const next = fixture('У мужчины есть машина.');
  assert.ok(!flatten(next.render()).some(n => n.text === 'У мужчины есть машина.'));
  next.controller.id = true;
  assert.ok(flatten(next.render()).some(n => n.text === 'У мужчины есть машина.'));
});

test('the post-answer word meaning keeps its previous behaviour', () => {
  const f = fixture(); f.widget.d = true;
  assert.ok(flatten(f.render()).some(n => n.text === 'мужчина, муж'));
});

test('contextual task shows the German definition before an answer', () => {
  const definition = 'Ein erwachsener männlicher Mensch.';
  const f = fixture('Мой муж работает врачом.', definition, 'ej');
  const nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === definition));
  assert.ok(!nodes.some(n => n.text === 'Мой муж работает врачом.'));
  assert.equal(f.controller.id, false);
});

test('cued recall shows its definition immediately and reveals letters only on request', () => {
  const definition = 'Ein erwachsener männlicher Mensch.';
  const f = fixture('Мой муж работает врачом.', definition);
  let nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === definition));
  assert.ok(!nodes.some(n => n.text?.startsWith('первые буквы:')));
  assert.ok(!nodes.some(n => n.text === 'Подсказка использована'));
  nodes.find(n => n.label === 'Подсказка — первые буквы').click();
  nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === definition));
  assert.ok(nodes.some(n => n.text === 'первые буквы: Ma…'));
  assert.ok(nodes.some(n => n.text === 'Подсказка использована'));
  assert.ok(!nodes.some(n => n.label === 'Подсказка — первые буквы'));
  assert.ok(nodes.some(n => n.label === hintLabel));
});

test('definition recall uses only the German definition until the translation hint is clicked', () => {
  const definition = 'Ein erwachsener männlicher Mensch.';
  const russian = 'Взрослый человек мужского пола.';
  const f = fixture(null, definition, 'cu');
  f.controller.ax.a.f = russian;
  let nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === definition));
  assert.ok(!nodes.some(n => n.text === russian || n.text === 'мужчина, муж'));
  assert.ok(!nodes.some(n => n.text === 'Mein ___ arbeitet als Arzt.'));
  nodes.find(n => n.label === 'Подсказка — перевод определения').click();
  nodes = flatten(f.render());
  assert.equal(f.controller.id, true);
  assert.ok(nodes.some(n => n.text === russian));
  assert.ok(!nodes.some(n => n.text === 'мужчина, муж'));
});
