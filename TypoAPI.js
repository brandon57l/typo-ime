/**
 * TypoAPI.js
 * A lightweight in-browser IME for Pinyin-to-Hanzi conversion.
 * Uses a Web Worker (bundled or remote) for fuzzy + bigram search.
 */

export class TypoAPI {
  /**
   * @private
   * @param {Worker} worker
   */
  constructor(worker) {
    this.pendingSearches = new Map();
    this.searchIdCounter = 0;
    this.worker = worker;

    // IME state
    this.inputEl = null;
    this.suggestionsEl = null;
    this.onCommit = () => {};
    this.conversationHistory = [];
    this.currentPinyinQuery = '';
    this.currentSuggestions = [];
    this.suggestionLimit = 15;
    this.suggestionBtnClass = 'btn btn-outline-secondary suggestion-btn';

    this.worker.addEventListener('message', this._handleInitMessage.bind(this));
  }

  /**
   * Create a TypoAPI instance, loading the worker script
   * Supports CORS by fetching and creating a Blob URL.
   * @param {object} [options]
   * @param {string} [options.workerPath] - URL or local path to TypoSM.js
   * @returns {Promise<TypoAPI>}
   */
  static async create({ workerPath = './TypoSM.js' } = {}) {
    let worker;
    try {
      // Fetch the worker script (allow remote URLs)
      const resp = await fetch(workerPath);
      const code = await resp.text();
      const blob = new Blob([code], { type: 'application/javascript' });
      const blobUrl = URL.createObjectURL(blob);
      worker = new Worker(blobUrl, { type: 'module' });
    } catch (e) {
      // Fallback: direct workerPath (may 404 or CORS)
      worker = new Worker(workerPath, { type: 'module' });
    }
    const api = new TypoAPI(worker);
    return new Promise((resolve, reject) => {
      api._initResolve = resolve;
      api._initReject = reject;
      // send init message
      worker.postMessage({ type: 'init' });
    });
  }

  /** @private Handle 'init_success' or 'init_error' */
  _handleInitMessage(event) {
    const { type, error } = event.data;
    if (type === 'init_success') {
      this.worker.removeEventListener('message', this._handleInitMessage);
      this.worker.addEventListener('message', this._handleSearchResult.bind(this));
      this._initResolve(this);
    } else if (type === 'init_error') {
      this._initReject(new Error(error));
    }
  }

  /** Attach IME behavior */
  attach({ inputEl, suggestionsEl, onCommit, suggestionLimit, suggestionBtnClass }) {
    if (!inputEl || !suggestionsEl) throw new Error("'inputEl' and 'suggestionsEl' are required.");
    this.inputEl = inputEl;
    this.suggestionsEl = suggestionsEl;
    if (onCommit) this.onCommit = onCommit;
    if (suggestionLimit !== undefined) this.suggestionLimit = suggestionLimit;
    if (suggestionBtnClass) this.suggestionBtnClass = suggestionBtnClass;
    inputEl.addEventListener('input', this._handleInput.bind(this));
    suggestionsEl.addEventListener('click', this._handleSuggestionClick.bind(this));
    if (inputEl.form) inputEl.form.addEventListener('submit', this._handleFormSubmit.bind(this));
  }

  /** Send search request */
  search(query, options, previousWordHanzi = null) {
    return new Promise(resolve => {
      const id = this.searchIdCounter++;
      this.pendingSearches.set(id, resolve);
      this.worker.postMessage({ type: 'search', payload: { query, options, previousWordHanzi }, searchId: id });
    });
  }

  /** Terminate worker */
  terminate() { this.worker.terminate(); }

  /** @private Receive search results */
  _handleSearchResult(event) {
    const { type, results, searchId } = event.data;
    if (type === 'search_results') {
      const cb = this.pendingSearches.get(searchId);
      if (cb) { cb(results); this.pendingSearches.delete(searchId); }
    }
  }

  /** @private Handle input */
  async _handleInput(e) {
    const val = e.target.value;
    const m = val.match(/[\w']+$/i);
    if (!m) { this._clearSuggestions(); return; }
    const q = m[0].toLowerCase();
    this.currentPinyinQuery = q;
    const pre = val.slice(0, -q.length);
    const ctx = pre ? pre.slice(-1) : this.conversationHistory.at(-1);
    const opts = { key: 'pinyin', threshold: 0.2 };
    const res = await this.search(q, opts, ctx);
    if (this.inputEl.value.endsWith(q)) this._displaySuggestions(res);
  }

  /** @private Display suggestions */
  _displaySuggestions(results) {
    this.suggestionsEl.innerHTML = '';
    this.currentSuggestions = results.slice(0, this.suggestionLimit);
    if (!this.currentSuggestions.length) {
      this.suggestionsEl.innerHTML = '<i>No suggestions.</i>';
      return;
    }
    this.currentSuggestions.forEach(({ item }) => {
      const b = document.createElement('button');
      b.className = `suggestion-btn ${this.suggestionBtnClass}`;
      b.textContent = item.hanzi;
      b.dataset.hanzi = item.hanzi;
      this.suggestionsEl.append(b);
    });
  }

  /** @private Suggestion click */
  _handleSuggestionClick(e) {
    if (e.target.matches('.suggestion-btn')) {
      const h = e.target.dataset.hanzi;
      const base = this.inputEl.value.slice(0, -this.currentPinyinQuery.length);
      this.inputEl.value = base + h;
      this._clearSuggestions();
      this.inputEl.focus();
    }
  }

  /** @private Form submit */
  _handleFormSubmit(e) {
    e.preventDefault();
    let txt = this.inputEl.value.trim();
    if (this.currentPinyinQuery && this.currentSuggestions.length) {
      txt = txt.slice(0, -this.currentPinyinQuery.length) + this.currentSuggestions[0].item.hanzi;
    }
    if (txt) { this.onCommit(txt); this.conversationHistory.push(...txt); this.inputEl.value = ''; this._clearSuggestions(); }
  }

  /** @private Clear */
  _clearSuggestions() { this.currentPinyinQuery=''; this.currentSuggestions=[]; this.suggestionsEl.innerHTML=''; }
}

