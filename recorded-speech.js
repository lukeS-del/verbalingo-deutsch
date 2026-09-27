/* Adapter for this Flutter build's TTS calls. Browser speech remains untouched. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.verbalingoSpeech = factory({
    native: root.speechSynthesis,
    index: root.verbalingoAudioIndex || {},
    baseURL: document.baseURI,
    createAudio(url) {
      const audio = document.createElement('audio');
      audio.dataset.verbalingoAudio = '';
      audio.hidden = true;
      audio.preload = 'auto';
      audio.src = url;
      document.body.append(audio);
      return audio;
    },
    notify(utterance, type, detail) {
      let event;
      try {
        const Constructor = type === 'error' ? root.SpeechSynthesisErrorEvent : root.SpeechSynthesisEvent;
        event = new Constructor(type, { utterance, ...detail });
      } catch (_) {
        event = new Event(type);
        for (const [key, value] of Object.entries({ utterance, ...detail })) {
          Object.defineProperty(event, key, { value });
        }
      }
      utterance.dispatchEvent(event);
    },
  });
})(typeof window === 'undefined' ? globalThis : window, function createRecordedSpeech(options) {
  'use strict';
  const { native, index, baseURL, createAudio, notify } = options;
  let active = null;
  const normalize = text => String(text || '').normalize('NFC').trim().replace(/\s+/gu, ' ');
  const hasRecordings = Object.keys(index).length > 0;

  function signal(job, type, extra = {}) {
    notify(job.utterance, type, {
      charIndex: type === 'end' ? job.text.length : 0,
      elapsedTime: Number.isFinite(job.audio.currentTime) ? job.audio.currentTime : 0,
      name: '', ...extra,
    });
  }

  function release(job) {
    job.audio.onplaying = job.audio.onended = job.audio.onerror = null;
    job.audio.pause();
    job.audio.removeAttribute('src');
    job.audio.load();
    job.audio.remove();
  }

  function finish(job, type = 'end', extra = {}) {
    if (active !== job) return;
    active = null;
    // Dispatch before releasing so elapsedTime is still available.
    signal(job, type, extra);
    release(job);
  }

  function fallback(job) {
    if (active !== job) return; // Ignore failures from a cancelled/replaced request.
    active = null;
    if (job.started) signal(job, 'end');
    release(job);
    if (native) native.speak(job.utterance);
    else notify(job.utterance, 'error', { error: 'audio-unavailable', charIndex: 0, elapsedTime: 0 });
  }

  function play(job) {
    const request = ++job.playRequest;
    try {
      const promise = job.audio.play();
      if (promise) promise.catch(() => {
        if (request === job.playRequest) fallback(job);
      });
    } catch (_) { fallback(job); }
  }

  return {
    hasRecordings,
    speak(utterance) {
      const text = normalize(utterance.text);
      const file = Object.prototype.hasOwnProperty.call(index, text) ? index[text] : null;
      const german = !utterance.lang || /^de(?:[-_]|$)/i.test(utterance.lang);
      // Match the app's existing stop-before-speak behaviour: latest request wins.
      this.cancel();
      if (!file || !german) {
        if (native) native.speak(utterance);
        else notify(utterance, 'error', { error: 'language-unavailable', charIndex: 0, elapsedTime: 0 });
        return;
      }
      const audio = createAudio(new URL(file, baseURL).href);
      audio.volume = Math.min(1, Math.max(0, Number(utterance.volume ?? 1)));
      // This Flutter app uses 0.4 as its normal speech rate.
      audio.playbackRate = Math.min(2, Math.max(0.5, Number(utterance.rate || 0.4) / 0.4));
      audio.preservesPitch = true;
      const job = { audio, utterance, text, started: false, paused: false, playRequest: 0 };
      active = job;
      audio.onplaying = () => {
        if (active !== job || audio.paused) return;
        if (!job.started) { job.started = true; job.paused = false; signal(job, 'start'); }
        else if (job.paused) { job.paused = false; signal(job, 'resume'); }
      };
      audio.onended = () => finish(job);
      audio.onerror = () => fallback(job);
      play(job);
    },
    cancel() {
      if (active) finish(active, 'end', { charIndex: 0 });
      if (native) native.cancel();
    },
    pause() {
      if (!active) { if (native) native.pause(); return; }
      if (active.paused) return;
      active.paused = true;
      active.playRequest++;
      active.audio.pause();
      signal(active, 'pause');
    },
    resume() {
      if (!active) { if (native) native.resume(); return; }
      if (active.paused) play(active);
    },
    get speaking() { return !!active || !!native?.speaking; },
    get paused() { return active ? active.paused : !!native?.paused; },
  };
});
