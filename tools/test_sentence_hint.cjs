// Execute the actual compiled widget renderer with inert UI primitives.
// No browser storage, study session, answer submission or learning progress.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'main.dart.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('A.a1m.prototype={\nD(a5){');
const end = source.indexOf('\nA.', start);
assert.ok(start >= 0 && end > start, 'Expected the supported exercise widget');
const widgetSource = source.slice(start, end);
const hintLabel = JSON.parse(source.match(/B\.a4p=new A\.aq\(("(?:\\.|[^"\\])*")/)[1]);

function fixture(translation = 'Мой муж работает врачом (в больнице).', sense = null, step = 'ek') {
  const style = new Proxy({}, {get: () => null});
  const B = new Proxy({b: {E: (a, b) => a.push(...b)}, c: {bz: s => s.trim()}, a4p: hintLabel, a3T: 'Подсказка — первые буквы', a4g: 'Подсказка — первая буква'},
    {get: (target, name) => name in target ? target[name] : name});
  const A = {
    a1m: function () {}, vz: () => false, G: () => ({ok: style, ax: {b: 'blue'}}),
    y: text => ({text}), b: array => array, aS: children => ({children}),
    bI: (value, pattern, replacement) => value.replace(pattern, replacement),
    ko: (_icon, label, click) => ({label, click}), lR: (_style, children) => ({children}),
    dw: function (_a, _b, _c, children) { this.children = children; },
  };
  const context = {A, B, t: {p: 'widgets'}, u: {N: 'Подсказка использована'},
    $: {aST: () => /\s*\((.+)\)\s*$/}};
  vm.runInNewContext(widgetSource, context);
  const controller = {
    k2: false, k4: false,
    ax: {b: B[step], a: {d: 'мужчина, муж', e: sense}, c: {b: 'Mein ___ arbeitet als Arzt.', e: translation}, d: null, w: 'Ma'},
    gaIy() { return () => { this.k2 = true; }; },
    gHc() { return () => { this.k4 = true; }; },
  };
  const widget = {c: controller, d: false};
  return {controller, widget, render: () => A.a1m.prototype.D.call(widget, {})};
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
  const first = fixture(); first.controller.k2 = true; first.render();
  const next = fixture('У мужчины есть машина.');
  assert.ok(!flatten(next.render()).some(n => n.text === 'У мужчины есть машина.'));
  next.controller.k2 = true;
  assert.ok(flatten(next.render()).some(n => n.text === 'У мужчины есть машина.'));
});

test('the post-answer word meaning keeps its previous behaviour', () => {
  const f = fixture(); f.widget.d = true;
  assert.ok(flatten(f.render()).some(n => n.text === 'мужчина, муж'));
});

test('contextual task never shows a definition', () => {
  const definition = 'Ein erwachsener männlicher Mensch.';
  const f = fixture('Мой муж работает врачом.', definition, 'fu');
  const nodes = flatten(f.render());
  assert.ok(!nodes.some(n => n.text === definition));
  assert.ok(!nodes.some(n => n.text === 'Мой муж работает врачом.'));
  assert.equal(f.controller.k2, false);
});

test('cued recall has no definition and reveals letters only on request', () => {
  const definition = 'Ein erwachsener männlicher Mensch.';
  const f = fixture('Мой муж работает врачом.', definition);
  let nodes = flatten(f.render());
  assert.ok(!nodes.some(n => n.text === definition));
  assert.ok(!nodes.some(n => n.text?.startsWith('первые буквы:')));
  assert.ok(!nodes.some(n => n.text === 'Подсказка использована'));
  nodes.find(n => n.label === 'Подсказка — первые буквы').click();
  nodes = flatten(f.render());
  assert.ok(!nodes.some(n => n.text === definition));
  assert.ok(nodes.some(n => n.text === 'первые буквы: Ma…'));
  assert.ok(nodes.some(n => n.text === 'Подсказка использована'));
  assert.ok(!nodes.some(n => n.label === 'Подсказка — первые буквы'));
  assert.ok(nodes.some(n => n.label === hintLabel));
});

test('everyday cloze shows translation and reveals only the first letter on request', () => {
  const f = fixture('Мой муж работает врачом.', 'old definition', 'du');
  f.controller.ax.w = 'M';
  let nodes = flatten(f.render());
  assert.ok(nodes.some(n => n.text === 'Мой муж работает врачом.'));
  assert.ok(nodes.some(n => n.text === 'Mein ___ arbeitet als Arzt.'));
  assert.ok(!nodes.some(n => n.text === 'old definition'));
  nodes.find(n => n.label === 'Подсказка — первая буква').click();
  nodes = flatten(f.render());
  assert.equal(f.controller.k4, true);
  assert.ok(nodes.some(n => n.text === 'Первая буква: M'));
});
