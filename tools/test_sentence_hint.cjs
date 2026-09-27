// Execute the actual compiled widget renderer with inert UI primitives.
// No browser storage, study session, answer submission or learning progress.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '..', 'main.dart.js'), 'utf8').replace(/\r\n/g, '\n');
const start = source.indexOf('A.a_X.prototype={\nE(a5){');
const end = source.indexOf('\nA.IM.prototype=', start);
assert.ok(start >= 0 && end > start, 'Expected the supported exercise widget');
const widgetSource = source.slice(start, end);
const hintLabel = JSON.parse(source.match(/B\.a0X=new A\.b0\(("(?:\\.|[^"\\])*")/)[1]);

function fixture(translation = 'Мой муж работает врачом (в больнице).') {
  const style = new Proxy({}, {get: () => null});
  const B = new Proxy({b: {F: (a, b) => a.push(...b)}, c: {cr: s => s.trim()}, a0X: hintLabel},
    {get: (target, name) => name in target ? target[name] : name});
  const A = {
    a_X: function () {}, I: () => ({ok: style, ax: {b: 'blue'}}),
    M: text => ({text}), b: array => array, aX: children => ({children}),
    cb: (value, pattern, replacement) => value.replace(pattern, replacement),
    lg: (_icon, label, click) => ({label, click}), lp: (_style, children) => ({children}),
    dG: function (_a, _b, _c, children) { this.children = children; },
  };
  const context = {A, B, t: {p: 'widgets'}, u: {N: 'Подсказка использована'},
    $: {aPz: () => /\s*\((.+)\)\s*$/}};
  vm.runInNewContext(widgetSource, context);
  const controller = {
    go: false, id: false,
    at: {b: B.e2, a: {d: 'мужчина, муж', e: null}, c: {b: 'Mein ___ arbeitet als Arzt.', e: translation}, d: null, w: ''},
    gaGR() { return () => { this.go = true; }; },
  };
  const widget = {c: controller, d: false};
  return {controller, widget, render: () => A.a_X.prototype.E.call(widget, {})};
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
  const first = fixture(); first.controller.go = true; first.render();
  const next = fixture('У мужчины есть машина.');
  assert.ok(!flatten(next.render()).some(n => n.text === 'У мужчины есть машина.'));
  next.controller.go = true;
  assert.ok(flatten(next.render()).some(n => n.text === 'У мужчины есть машина.'));
});

test('the post-answer word meaning keeps its previous behaviour', () => {
  const f = fixture(); f.widget.d = true;
  assert.ok(flatten(f.render()).some(n => n.text === 'мужчина, муж'));
});
