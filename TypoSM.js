/**
 * @module TypoSM
 * @description
 * Web Worker script implementing a high-performance fuzzy search engine
 * for Pinyin-to-Hanzi conversion with probabilistic bigram context scoring.
 */

const DICTIONARY_URL = 'https://spotqing.pythonanywhere.com/static/dict.json';
const BIGRAM_URL = 'https://spotqing.pythonanywhere.com/static/bigram_probabilities.json';

// --- Levenshtein distance utility (unchanged) ---
/**
 * Compute the Levenshtein edit distance between two strings.
 * @param {string} a - First string.
 * @param {string} b - Second string.
 * @returns {number} Edit distance.
 */
function levenshteinDistance(a, b) {
  // Small optimization: if length difference is large, score will be low.
  // For clarity, we keep the standard implementation.
  const matrix = Array(b.length + 1)
    .fill(null)
    .map(() => Array(a.length + 1).fill(null));
  for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
  for (let j = 0; j <= b.length; j++) matrix[j][0] = j;
  for (let j = 1; j <= b.length; j++) {
    for (let i = 1; i <= a.length; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[j][i] = Math.min(
        matrix[j][i - 1] + 1,
        matrix[j - 1][i] + 1,
        matrix[j - 1][i - 1] + cost
      );
    }
  }
  return matrix[b.length][a.length];
}

// --- Global worker state ---
/** @type {Array<object>} Original dictionary records. */
let dictionary = [];
/** @type {Object<string,Object<string,number>>} Bigram probability map. */
let bigramProbabilities = {};
// NEW: Search index for fast lookups by key and length
/**
 * Format: { pinyin: { length: [record, ...] }, hanzi: { length: [...] } }
 * @type {Object<string, Object<number, Array<object>>>}
 */
let searchIndex = {};

// --- Initialization: load and index data ---
/**
 * Fetches dictionary and bigram data, pre-processes strings,
 * and builds a length-based search index for each field.
 * @async
 * @throws {Error} If fetch responses are not OK.
 */
async function initialize() {
  console.log('[Worker] Loading data...');
  const [dictResponse, bigramResponse] = await Promise.all([
    fetch(DICTIONARY_URL),
    fetch(BIGRAM_URL)
  ]);

  if (!dictResponse.ok || !bigramResponse.ok) {
    throw new Error('Failed to fetch worker data.');
  }

  dictionary = await dictResponse.json();
  bigramProbabilities = await bigramResponse.json();

  console.log('[Worker] Pre-processing and indexing data...');
  searchIndex = { pinyin: {}, hanzi: {} };

  for (const record of dictionary) {
    const keysToProcess = ['pinyin', 'hanzi'];
    for (const key of keysToProcess) {
      const target = record[key];
      if (typeof target !== 'string' || !target) continue;

      // 1. Pre-calc: normalize once
      const searchableTarget = target.trim().replace(/[0-9]/g, '').toLowerCase();
      if (!searchableTarget) continue;
      record[`searchable_${key}`] = searchableTarget;

      // 2. Index by length
      const len = searchableTarget.length;
      if (!searchIndex[key][len]) searchIndex[key][len] = [];
      searchIndex[key][len].push(record);
    }
  }
  console.log('[Worker] Indexing complete.');
}

// --- Optimized search logic ---
/**
 * Perform a fuzzy search over indexed records using Levenshtein distance
 * and optional bigram context scoring.
 * @param {string} query - Lowercase search fragment.
 * @param {object} options - { key: 'pinyin'|'hanzi', threshold?: number, lengthTolerance?: number }
 * @param {string|null} previousWordHanzi - Optional bigram context.
 * @returns {Array<{ item: object, score: number, bigramScore: number }>} Sorted results.
 */
function performSearch(query, options, previousWordHanzi) {
  const key = options.key;
  const threshold = options.threshold ?? 0.6;
  const lengthTolerance = options.lengthTolerance ?? 2;
  if (!query || !key || !searchIndex[key]) return [];

  const normalizedQuery = query.toLowerCase();
  const queryLength = normalizedQuery.length;
  const hasBigramContext = !!(
    previousWordHanzi &&
    bigramProbabilities[previousWordHanzi]
  );
  const results = [];

  // Iterate only over relevant lengths
  for (
    let len = Math.max(1, queryLength - lengthTolerance);
    len <= queryLength + lengthTolerance;
    len++
  ) {
    const bucket = searchIndex[key][len];
    if (!bucket) continue;
    for (const record of bucket) {
      const hanzi = record.hanzi;
      if (!hanzi) continue;
      const target = record[`searchable_${key}`];
      const distance = levenshteinDistance(normalizedQuery, target);
      const score = 1 - distance / Math.max(queryLength, target.length);
      if (score >= threshold) {
        const bigramScore = hasBigramContext
          ? bigramProbabilities[previousWordHanzi]?.[hanzi] || 0
          : 0;
        results.push({ item: record, score, bigramScore });
      }
    }
  }

  return results.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.bigramScore - a.bigramScore;
  });
}

// --- Worker message handling ---
self.onmessage = async (event) => {
  const { type, payload, searchId } = event.data;
  switch (type) {
    case 'init':
      try {
        await initialize();
        self.postMessage({ type: 'init_success' });
      } catch (err) {
        console.error('[Worker] Init error:', err);
        self.postMessage({ type: 'init_error', error: err.message });
      }
      break;

    case 'search': {
      const { query, options, previousWordHanzi } = payload;
      const results = performSearch(query, options, previousWordHanzi);
      self.postMessage({ type: 'search_results', results, searchId });
      break;
    }
  }
};
