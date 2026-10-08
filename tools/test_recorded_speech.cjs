const test = require('node:test');
const assert = require('node:assert/strict');
const createBridge = require('../recorded-speech.js');

function setup(index = {'Die Männer sind hier.': 'audio/de-DE/example.mp3'}) {
  const events = [], media = [], nativeCalls = [];
  const native = Object.fromEntries(['speak', 'cancel', 'pause', 'resume'].map(name =>
    [name, (...args) => nativeCalls.push([name, ...args])]));
  const bridge = createBridge({native, index, baseURL: 'https://example.test/verbalingo-deutsch/',
    notify: (utterance, type, detail) => events.push({utterance, type, detail}),
    createAudio(url) {
      const audio = {url, paused: true, currentTime: 0, removed: false,
        play() { this.paused = false; return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); },
        pause() { this.paused = true; }, removeAttribute() {}, load() {}, remove() { this.removed = true; }};
      media.push(audio); return audio;
    }});
  const say = (text = 'Die Männer sind hier.', lang = 'de-DE') => ({text, lang, rate: 0.4, volume: 0.7});
  return {bridge, events, media, native, nativeCalls, say};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('recording resolves under the GitHub Pages base and emits Flutter start/end', () => {
  const s = setup(), utterance = s.say('  Die   Männer sind hier.\n');
  s.bridge.speak(utterance);
  const audio = s.media[0];
  assert.equal(audio.url, 'https://example.test/verbalingo-deutsch/audio/de-DE/example.mp3');
  assert.equal(audio.playbackRate, 1); assert.equal(audio.volume, 0.7);
  audio.onplaying(); audio.currentTime = 2; audio.onended();
  assert.deepEqual(s.events.map(e => e.type), ['start', 'end']);
  assert.equal(s.events[1].detail.elapsedTime, 2);
  assert.equal(s.bridge.speaking, false); assert.equal(audio.removed, true);
  assert.equal(s.nativeCalls.filter(c => c[0] === 'speak').length, 0);
});

test('pause and resume keep the same MP3 and forward playback state', () => {
  const s = setup(); s.bridge.speak(s.say()); const a = s.media[0]; a.onplaying();
  s.bridge.pause(); assert.equal(s.bridge.paused, true);
  s.bridge.resume(); a.onplaying();
  assert.deepEqual(s.events.map(e => e.type), ['start', 'pause', 'resume']);
  assert.equal(s.bridge.paused, false); assert.equal(s.media.length, 1);
});

test('rapid next/replay cancels old audio and ignores its late rejection', async () => {
  const s = setup(); s.bridge.speak(s.say()); const old = s.media[0];
  s.bridge.speak(s.say()); old.reject(new Error('Aborted')); await flush();
  assert.equal(old.removed, true); assert.equal(old.onended, null);
  assert.equal(s.media.length, 2); assert.equal(s.bridge.speaking, true);
  assert.equal(s.nativeCalls.filter(c => c[0] === 'speak').length, 0);
  s.bridge.cancel(); assert.equal(s.bridge.speaking, false);
});

test('a pending play interrupted by pause does not incorrectly trigger browser TTS', async () => {
  const s = setup(); s.bridge.speak(s.say()); const a = s.media[0], reject = a.reject;
  s.bridge.pause(); s.bridge.resume(); reject(new Error('Aborted')); await flush();
  a.onplaying();
  assert.equal(s.bridge.paused, false);
  assert.equal(s.nativeCalls.filter(c => c[0] === 'speak').length, 0);
});

test('a missing or blocked MP3 falls back exactly once', async () => {
  const s = setup(), u = s.say(); s.bridge.speak(u); const a = s.media[0];
  a.onerror(); a.reject(new Error('404')); await flush();
  assert.equal(a.removed, true);
  assert.deepEqual(s.nativeCalls.filter(c => c[0] === 'speak'), [['speak', u]]);
});

test('unrecorded words and other languages keep the original speech engine', () => {
  const s = setup(), word = s.say('Mann'), english = s.say('Die Männer sind hier.', 'en-US');
  s.bridge.speak(word); s.bridge.speak(english); s.bridge.pause(); s.bridge.resume();
  assert.equal(s.media.length, 0);
  assert.deepEqual(s.nativeCalls.filter(c => c[0] === 'speak'), [['speak', word], ['speak', english]]);
});

test('an unavailable index preserves browser TTS and language detection', () => {
  const s = setup({}); assert.equal(s.bridge.hasRecordings, false);
  s.bridge.speak(s.say()); assert.equal(s.media.length, 0);
});

test('a prototype property is never treated as an audio filename', () => {
  const s = setup(); s.bridge.speak(s.say('constructor')); assert.equal(s.media.length, 0);
});

test('the compiled Flutter keep-alive calls pause/resume without ASI call chaining', () => {
  const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.dart.js'), 'utf8');
  const start = source.indexOf('A.acC.prototype={');
  const end = source.indexOf('A.acE.prototype=', start);
  const calls = [], A = {acC: function () {}};
  const context = {A, B: {on: 1}, v: {G: {verbalingoSpeech: {
    pause: () => calls.push('pause'), resume: () => calls.push('resume'),
  }}}};
  vm.runInNewContext(source.slice(start, end), context);
  A.acC.prototype.$1.call({a: {b: 1}}, {});
  assert.deepEqual(calls, ['pause', 'resume']);
});
