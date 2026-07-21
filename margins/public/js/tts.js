// Read-aloud engine built on the Web Speech API. Speaks sentence-by-sentence
// (which also sidesteps Chrome's long-utterance cutoff) and reports the active
// sentence so the reader can highlight and scroll to it.

export function splitSentences(text) {
  // Produce [{text, start, end}] over the source string. Offsets are exact so
  // the reader can anchor the active sentence without searching.
  const sentences = [];
  const re = /[^.!?…\n]+[.!?…]*[\s"”’)\]]*/g;
  let m;
  while ((m = re.exec(text))) {
    const raw = m[0];
    const trimmedStart = raw.length - raw.trimStart().length;
    const trimmedEnd = raw.length - raw.trimEnd().length;
    const s = m.index + trimmedStart;
    const e = m.index + raw.length - trimmedEnd;
    if (e - s < 2) continue;
    const chunk = text.slice(s, e);
    // Very long "sentences" (lists, code) get chunked so speech stays responsive.
    if (chunk.length > 400) {
      for (let i = s; i < e; i += 300) {
        sentences.push({ text: text.slice(i, Math.min(i + 300, e)), start: i, end: Math.min(i + 300, e) });
      }
    } else {
      sentences.push({ text: chunk, start: s, end: e });
    }
  }
  return sentences;
}

export class ReadAloud {
  constructor({ onSentence, onStateChange }) {
    this.sentences = [];
    this.index = 0;
    this.playing = false;
    this.rate = Number(localStorage.getItem('margins_tts_rate') || 1);
    this.voiceName = localStorage.getItem('margins_tts_voice') || '';
    this.onSentence = onSentence || (() => {});
    this.onStateChange = onStateChange || (() => {});
    this._utterance = null;
  }

  load(sentences, startIndex = 0) {
    this.stop();
    this.sentences = sentences;
    this.index = Math.min(startIndex, Math.max(0, sentences.length - 1));
  }

  voices() {
    return speechSynthesis.getVoices().filter((v) => v.lang.startsWith('en') || v.default)
      .concat(speechSynthesis.getVoices().filter((v) => !v.lang.startsWith('en') && !v.default));
  }

  setRate(rate) {
    this.rate = rate;
    localStorage.setItem('margins_tts_rate', String(rate));
    if (this.playing) { this._speakCurrent(); }
  }

  setVoice(name) {
    this.voiceName = name;
    localStorage.setItem('margins_tts_voice', name);
    if (this.playing) { this._speakCurrent(); }
  }

  play() {
    if (!this.sentences.length) return;
    this.playing = true;
    this.onStateChange(true);
    this._speakCurrent();
  }

  pause() {
    this.playing = false;
    speechSynthesis.cancel();
    this.onStateChange(false);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  stop() {
    this.playing = false;
    speechSynthesis.cancel();
    this.onStateChange(false);
  }

  skip(delta) {
    this.index = Math.max(0, Math.min(this.sentences.length - 1, this.index + delta));
    if (this.playing) this._speakCurrent();
    else this.onSentence(this.sentences[this.index], this.index);
  }

  jumpTo(index) {
    this.index = Math.max(0, Math.min(this.sentences.length - 1, index));
    if (this.playing) this._speakCurrent();
  }

  _speakCurrent() {
    speechSynthesis.cancel();
    const sentence = this.sentences[this.index];
    if (!sentence) { this.pause(); return; }
    this.onSentence(sentence, this.index);

    const u = new SpeechSynthesisUtterance(sentence.text);
    u.rate = this.rate;
    const voice = speechSynthesis.getVoices().find((v) => v.name === this.voiceName);
    if (voice) u.voice = voice;
    u.onend = () => {
      if (!this.playing || u !== this._utterance) return;
      if (this.index < this.sentences.length - 1) {
        this.index += 1;
        this._speakCurrent();
      } else {
        this.pause();
      }
    };
    u.onerror = (e) => {
      // "interrupted"/"canceled" fire on our own cancel() calls — ignore those.
      if (e.error === 'interrupted' || e.error === 'canceled') return;
      this.pause();
    };
    this._utterance = u;
    speechSynthesis.speak(u);
  }
}
