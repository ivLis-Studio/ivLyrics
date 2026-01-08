// Furigana Converter Module for ivLyrics
// This module converts Japanese kanji to furigana using Kuromoji tokenizer

const FuriganaConverter = (() => {
	let kuromojiInstance = null;
	let isInitializing = false;
	let initPromise = null;
	const conversionCache = new Map(); // Cache for converted text

	/**
	 * Initialize Kuromoji tokenizer
	 * @returns {Promise<void>}
	 */
	const init = async () => {
		console.log('[FuriganaConverter] init() called');

		if (kuromojiInstance) {
			console.log('[FuriganaConverter] ✓ Already initialized');
			return Promise.resolve();
		}

		if (isInitializing) {
			console.log('[FuriganaConverter] ⏳ Already initializing, waiting...');
			return initPromise;
		}

		console.log('[FuriganaConverter] 🔄 Starting initialization...');
		isInitializing = true;
		initPromise = new Promise((resolve, reject) => {
			// Kuromoji는 전역 window.kuromoji로 로드됩니다
			if (typeof window.kuromoji === 'undefined') {
				console.error('[FuriganaConverter] ❌ Kuromoji library not found in window');
				reject(new Error('Kuromoji library not loaded'));
				return;
			}

			console.log('[FuriganaConverter] ✓ Kuromoji library found, building...');

			window.kuromoji.builder({
				dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict'
			}).build((err, tokenizer) => {
				if (err) {
					console.error('[FuriganaConverter] ❌ Build failed:', err);
					isInitializing = false;
					reject(err);
					return;
				}

				kuromojiInstance = tokenizer;
				isInitializing = false;
				console.log('[FuriganaConverter] ✅ Initialization complete!');
				resolve();
			});
		});

		return initPromise;
	};

	/**
	 * Check if text contains Japanese kanji
	 * @param {string} text
	 * @returns {boolean}
	 */
	const containsKanji = (text) => {
		// Kanji unicode range: 4E00-9FAF, 3400-4DBF
		const kanjiRegex = /[\u4E00-\u9FAF\u3400-\u4DBF]/;
		return kanjiRegex.test(text);
	};

	/**
	 * Convert text with kanji to furigana HTML
	 * @param {string} text - Japanese text to convert
	 * @returns {string} HTML string with ruby tags
	 */
	const convertToFurigana = (text) => {
		console.log('[FuriganaConverter] convertToFurigana called');
		console.log('[FuriganaConverter] text sample:', text?.substring(0, 50));

		if (!text || typeof text !== 'string') {
			console.log('[FuriganaConverter] ❌ Invalid text type');
			return text;
		}

		// Skip if no kanji present
		if (!containsKanji(text)) {
			console.log('[FuriganaConverter] ℹ️ No kanji in text');
			return text;
		}

		console.log('[FuriganaConverter] ✓ Text contains kanji');

		// Check cache
		if (conversionCache.has(text)) {
			console.log('[FuriganaConverter] ✓ Found in cache');
			return conversionCache.get(text);
		}

		// If not initialized, return original text
		if (!kuromojiInstance) {
			console.log('[FuriganaConverter] ❌ Kuromoji not initialized yet');
			return text;
		}

		console.log('[FuriganaConverter] ✓ Kuromoji is ready, tokenizing...');

		try {
			// Tokenize the text
			const morphemes = kuromojiInstance.tokenize(text);
			console.log('[FuriganaConverter] ✓ Tokenized into', morphemes.length, 'morphemes');
			let result = '';

			for (const morpheme of morphemes) {
				const surface = morpheme.surface_form; // 表層形 (actual text)
				const reading = morpheme.reading || morpheme.pronunciation; // 読み (reading in katakana), fallback to pronunciation

				// Debug logging for morphemes without reading
				if (containsKanji(surface) && !reading) {
					console.log('[FuriganaConverter] ⚠️ No reading for kanji:', surface, 'morpheme:', morpheme);
				}

				// If morpheme has kanji and reading is available
				if (reading && containsKanji(surface)) {
					// Convert katakana reading to hiragana
					const hiragana = katakanaToHiragana(reading);

					// Create ruby tag for furigana
					result += `<ruby>${surface}<rt>${hiragana}</rt></ruby>`;
					console.log(`[FuriganaConverter] ✓ ${surface} → ${hiragana}`);
				} else {
					// No furigana needed
					result += surface;
				}
			}

			// Cache the result (limit cache size)
			if (conversionCache.size > 1000) {
				const firstKey = conversionCache.keys().next().value;
				conversionCache.delete(firstKey);
			}
			conversionCache.set(text, result);

			console.log('[FuriganaConverter] ✓ Conversion complete. Result sample:', result.substring(0, 100));
			return result;
		} catch (error) {
			console.error('[FuriganaConverter] ❌ Conversion error:', error);
			return text; // Return original text on error
		}
	};

	/**
	 * Convert katakana to hiragana
	 * @param {string} katakana
	 * @returns {string}
	 */
	const katakanaToHiragana = (katakana) => {
		if (!katakana) return '';

		return katakana.split('').map(char => {
			const code = char.charCodeAt(0);
			// Katakana range: 30A1-30F6
			// Hiragana range: 3041-3096
			// Difference: 96 (0x60)
			if (code >= 0x30A1 && code <= 0x30F6) {
				return String.fromCharCode(code - 0x60);
			}
			return char;
		}).join('');
	};

	/**
	 * Check if furigana conversion is available
	 * @returns {boolean}
	 */
	const isAvailable = () => {
		return kuromojiInstance !== null;
	};

	/**
	 * Clear conversion cache
	 */
	const clearCache = () => {
		conversionCache.clear();
	};

	return {
		init,
		convertToFurigana,
		containsKanji,
		isAvailable,
		clearCache
	};
})();

// Make it globally available
window.FuriganaConverter = FuriganaConverter;
