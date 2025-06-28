# typo-ime

> **In-browser Pinyin-to-Hanzi IME** with fuzzy search and bigram probabilistic suggestions.

---

## 🔍 Features

* **Lightweight**: No external dependencies, runs entirely in-browser.
* **High-performance**: Web Worker offloads fuzzy-search + bigram logic.
* **Configurable**: Set suggestion limits, button styles, custom commit callbacks.
* **Easy to integrate**: Simple API to attach IME behavior to any input.

---

## 💾 Installation

```bash
npm install typo-ime
# or
yarn add typo-ime
```

---

## 🚀 Basic Usage (JavaScript)

1. **Import and initialize** the IME:

```js
import { TypoAPI } from 'typo-ime';

// Create and initialize
TypoAPI.create().then((ime) => {
  // Attach to your input and suggestion container
  ime.attach({
    inputEl: document.getElementById('pinyinInput'),
    suggestionsEl: document.getElementById('suggestions'),
    onCommit: (text) => console.log('Committed:', text)
  });
});
```

2. **Type Pinyin** into the input, and watch fuzzy suggestions appear.

---

## 🛠️ Advanced Usage

A more detailed example showing **all available options**:

```js
import { TypoAPI } from 'typo-ime';

(async () => {
  // 1. Create instance and wait for worker initialization
  const ime = await TypoAPI.create();

  // 2. Configure options
  const config = {
    inputEl: document.querySelector('#pinyinInput'),    // HTMLInputElement
    suggestionsEl: document.querySelector('#suggestions'),// HTMLElement
    onCommit: (finalText) => {
      // Called when user commits text (via click or form submit)
      console.log('User committed:', finalText);
      // You could insert the text into your chat, editor, etc.
    },
    suggestionLimit: 10,     // Max number of suggestions to display
    suggestionBtnClass: 'my-custom-btn', // Custom CSS classes for buttons
  };

  // 3. Attach IME behavior
  ime.attach(config);

  // 4. (Optional) Manually perform searches
  const results = await ime.search('ni', { key: 'pinyin', threshold: 0.3 }, null);
  console.log('Manual search results:', results);

  // 5. Terminate worker when done
  // ime.terminate();
})();
```

**Option details**:

| Option               | Type                     | Default                                      | Description                                 |
| -------------------- | ------------------------ | -------------------------------------------- | ------------------------------------------- |
| `inputEl`            | `HTMLInputElement`       | —                                            | Text field where user types Pinyin.         |
| `suggestionsEl`      | `HTMLElement`            | —                                            | Container for suggestion buttons.           |
| `onCommit`           | `(text: string) => void` | `() => {}`                                   | Callback when a suggestion is committed.    |
| `suggestionLimit`    | `number`                 | `15`                                         | Maximum number of suggestions shown.        |
| `suggestionBtnClass` | `string`                 | `'btn btn-outline-secondary suggestion-btn'` | CSS classes for styling suggestion buttons. |

---

## 📖 API Reference

### `TypoAPI.create(): Promise<TypoAPI>`

Creates and initializes a new IME instance. Resolves once the Web Worker is ready.

### `instance.attach(options)`

Attach IME behavior to DOM elements.

* **`options.inputEl`** `(HTMLInputElement)`: Input element for Pinyin.
* **`options.suggestionsEl`** `(HTMLElement)`: Container where suggestion buttons will be rendered.
* **`options.onCommit`** `(text: string) => void`: Called when user commits a suggestion (click or form submit).
* **`options.suggestionLimit`** `(number, optional)`: Limit number of suggestions (default `15`).
* **`options.suggestionBtnClass`** `(string, optional)`: CSS classes for suggestion buttons.

### `instance.search(query, options, previousWordHanzi?): Promise<Array>`

Manually trigger a search. Returns an array of `{ item, score, bigramScore }`.

* **`query`** `(string)`: Pinyin fragment to search.
* **`options.key`** `('pinyin'|'hanzi')`: Field to search on.
* **`options.threshold`** `(number, optional)`: Minimum similarity score (0-1). Default `0.6`.
* **`options.lengthTolerance`** `(number, optional)`: Allowed length variance. Default `2`.
* **`previousWordHanzi`** `(string|null, optional)`: Previous character context for bigram scoring.

### `instance.terminate()`

Terminates the underlying Web Worker. Use when you no longer need the IME.

---

## 💡 Contributing

Pull requests and issues are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) for details.

---

## 📜 License

[MIT](LICENSE) © 2025 Brandon57l
