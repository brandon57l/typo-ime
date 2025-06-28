// File: TypoAPI.js (version améliorée)

/**
 * @module TypoAPI
 * @description
 * A lightweight in-browser IME (Input Method Editor) for Pinyin-to-Hanzi conversion.
 * Provides fuzzy search suggestions with probabilistic bigram context support via Web Worker.
 */
export class TypoAPI {
  /**
   * @private
   * @param {Worker} worker - The Web Worker instance.
   */
  constructor(worker) {
    /** @private @type {Map<number, Function>} */
    this.pendingSearches = new Map();
    /** @private @type {number} */
    this.searchIdCounter = 0;
    /** @private @type {Worker} */
    this.worker = worker; 

    // --- IME internal state ---
    /** @private @type {HTMLInputElement|null} */ this.inputEl = null;
    /** @private @type {HTMLElement|null} */     this.suggestionsEl = null;
    /** @private @type {function(string): void} */ this.onCommit = () => {};
    /** @private @type {string[]} */            this.conversationHistory = [];
    /** @private @type {string} */              this.currentPinyinQuery = '';
    /** @private @type {Array} */               this.currentSuggestions = [];

    // --- Configuration options with defaults ---
    /** @type {number} */ this.suggestionLimit = 15;
    /** @type {string} */ this.suggestionBtnClass = 'btn btn-outline-secondary suggestion-btn';
  }

  /**
   * Static factory to create and initialize the IME.
   * @param {object} [options] - Options for creation.
   * @param {string} [options.workerPath='./TypoSM.js'] - URL for the worker script.
   * @returns {Promise<TypoAPI>} Resolves when the worker is ready.
   */
  static create({ workerPath = './TypoSM.js' } = {}) { 
    return new Promise((resolve, reject) => {
      // Crée le worker avec l'URL fournie
      const worker = new Worker(workerPath, { type: 'module' });
      const instance = new TypoAPI(worker);

      const initHandler = (event) => {
        const { type, error } = event.data;
        if (type === 'init_success') {
          console.info('Worker initialized successfully.');
          instance.worker.removeEventListener('message', initHandler);
          instance.worker.addEventListener('message', instance._handleSearchResult.bind(instance));
          resolve(instance);
        } else if (type === 'init_error') {
          console.error('Worker failed to initialize:', error);
          reject(new Error(error));
        }
      };
      instance.worker.addEventListener('message', initHandler);
      instance.worker.postMessage({ type: 'init' });
    });
  }

  // ... (le reste de la classe est inchangé) ...
  // ... (le reste de la classe est inchangé) ...

  /**
   * Attach IME behavior to DOM elements.
   * @param {object} options
   * @param {HTMLInputElement} options.inputEl - Pinyin input field.
   * @param {HTMLElement} options.suggestionsEl - Container for suggestion buttons.
   * @param {function(string): void} options.onCommit - Callback when text is committed.
   * @param {number} [options.suggestionLimit] - Max number of suggestions.
   * @param {string} [options.suggestionBtnClass] - CSS class(es) for suggestion buttons.
   */
  attach({ inputEl, suggestionsEl, onCommit, suggestionLimit, suggestionBtnClass }) {
    if (!inputEl || !suggestionsEl) {
      throw new Error("Both 'inputEl' and 'suggestionsEl' are required.");
    }
    this.inputEl = inputEl;
    this.suggestionsEl = suggestionsEl;
    if (onCommit) this.onCommit = onCommit;

    // Apply custom config if provided
    if (suggestionLimit !== undefined) this.suggestionLimit = suggestionLimit;
    if (suggestionBtnClass) this.suggestionBtnClass = suggestionBtnClass;

    // Event listeners
    this.inputEl.addEventListener('input', this._handleInput.bind(this));
    this.suggestionsEl.addEventListener('click', this._handleSuggestionClick.bind(this));
    if (this.inputEl.form) {
      this.inputEl.form.addEventListener('submit', this._handleFormSubmit.bind(this));
    }
  }

  /**
   * Send a search request to the worker.
   * @param {string} query - Current pinyin query fragment.
   * @param {object} options - Search options (e.g., key, threshold).
   * @param {string|null} [previousWordHanzi] - Context for bigram scoring.
   * @returns {Promise<Array>} Resolves with an array of suggestion objects.
   */
  search(query, options, previousWordHanzi = null) {
    return new Promise((resolve) => {
      const searchId = this.searchIdCounter++;
      this.pendingSearches.set(searchId, resolve);
      this.worker.postMessage({ type: 'search', payload: { query, options, previousWordHanzi }, searchId });
    });
  }

  /**
   * Terminate the underlying Web Worker.
   */
  terminate() {
    this.worker.terminate();
  }

  /** @private */
  _handleSearchResult(event) {
    const { type, results, searchId } = event.data;
    if (type === 'search_results') {
      const callback = this.pendingSearches.get(searchId);
      if (callback) {
        callback(results);
        this.pendingSearches.delete(searchId);
      }
    }
  }

  /** @private */
  async _handleInput(event) {
    const fullInput = event.target.value;
    const match = fullInput.match(/[a-z0-9']+$/i);
    if (!match) {
      this._clearSuggestions();
      return;
    }
    const query = match[0].toLowerCase();
    this.currentPinyinQuery = query;
    const pretext = fullInput.slice(0, -query.length);
    const contextChar = pretext ? pretext.slice(-1) : this.conversationHistory.at(-1);
    const options = { key: 'pinyin', threshold: 0.2 };
    const results = await this.search(query, options, contextChar);
    if (this.inputEl.value.endsWith(query)) {
      this._displaySuggestions(results);
    }
  }

  /** @private */
  _handleSuggestionClick(event) {
    if (event.target.matches('.suggestion-btn')) {
      const hanzi = event.target.dataset.hanzi;
      const base = this.inputEl.value.slice(0, -this.currentPinyinQuery.length);
      this.inputEl.value = base + hanzi;
      this._clearSuggestions();
      this.inputEl.focus();
    }
  }

  /** @private */
  _handleFormSubmit(event) {
    event.preventDefault();
    let text = this.inputEl.value.trim();
    if (this.currentPinyinQuery && this.currentSuggestions.length) {
      const fallback = this.currentSuggestions[0].item.hanzi;
      text = text.slice(0, -this.currentPinyinQuery.length) + fallback;
    }
    if (text) {
      this.onCommit(text);
      this.conversationHistory.push(...text.split(''));
      this.inputEl.value = '';
      this._clearSuggestions();
    }
  }

  /** @private */
  _displaySuggestions(results) {
    this.suggestionsEl.innerHTML = '';
    this.currentSuggestions = results.slice(0, this.suggestionLimit);
    if (this.currentSuggestions.length === 0) {
      this.suggestionsEl.innerHTML = '<span class="text-muted fst-italic">No suggestions.</span>';
      return;
    }
    this.currentSuggestions.forEach(({ item }) => {
      const button = document.createElement('button');
      button.className = `suggestion-btn ${this.suggestionBtnClass}`;
      button.textContent = item.hanzi;
      button.dataset.hanzi = item.hanzi;
      button.type = 'button';
      this.suggestionsEl.appendChild(button);
    });
  }

  /** @private */
  _clearSuggestions() {
    this.currentPinyinQuery = '';
    this.currentSuggestions = [];
    this.suggestionsEl.innerHTML = '';
  }
}