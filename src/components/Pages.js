// CreditFooter removed - debug info is now available in Settings > Debug tab
const CreditFooter = react.memo(() => null);

// Optimized IdlingIndicator with memoization and performance improvements
const IdlingIndicator = react.memo(({ isActive = false, progress = 0, delay = 0 }) => {
	const className = useMemo(() =>
		`lyrics-idling-indicator ${!isActive ? "lyrics-idling-indicator-hidden" : ""} lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active`,
		[isActive]
	);

	const style = useMemo(() => ({
		"--position-index": 0,
		"--animation-index": 1,
		"--indicator-delay": `${delay}ms`,
	}), [delay]);

	// Memoize circle states to avoid unnecessary re-renders
	const circleStates = useMemo(() => [
		progress >= 0.05 ? "active" : "",
		progress >= 0.33 ? "active" : "",
		progress >= 0.66 ? "active" : ""
	], [progress]);

	return react.createElement(
		"div",
		{ className, style },
		react.createElement("div", { className: `lyrics-idling-indicator__circle ${circleStates[0]}` }),
		react.createElement("div", { className: `lyrics-idling-indicator__circle ${circleStates[1]}` }),
		react.createElement("div", { className: `lyrics-idling-indicator__circle ${circleStates[2]}` })
	);
});

const emptyLine = {
	startTime: 0,
	endTime: 0,
	text: [],
};

// Safe text renderer that handles objects, null, and undefined
const safeRenderText = (value) => {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		// Handle React elements
		if (value && typeof value === 'object' && value.$$typeof) {
			return value; // React element, return as-is
		}
		// Handle line objects for karaoke
		if (value.text) return value.text;
		if (value.syllables) return value;
		if (value.vocals) return value;
		// Fallback: return empty string for other objects
		return "";
	}
	return String(value);
};

// Unified function to handle lyrics display mode logic
const getLyricsDisplayMode = (isKara, line, text, originalText, text2) => {
	const displayMode = CONFIG.visual["translate:display-mode"];
	const showTranslatedBelow = displayMode === "below";
	const replaceOriginal = displayMode === "replace";

	let mainText, subText, subText2;

	if (isKara) {
		// For karaoke mode, safely handle the line object
		mainText = line; // Keep as object for KaraokeLine component
		subText = text ? safeRenderText(text) : null;
		subText2 = safeRenderText(text2);
	} else {
		// Default: show original text
		// originalText is the actual original lyrics
		// text is the first translation (can be null)
		// text2 is the second translation (can be null)

		if (showTranslatedBelow) {
			// Show original as main, translations below
			// Apply furigana to original text if enabled
			const processedOriginalText = safeRenderText(originalText);
			mainText = typeof processedOriginalText === 'string' ?
				Utils.applyFuriganaIfEnabled(processedOriginalText) : processedOriginalText;
			subText = text ? safeRenderText(text) : null;
			subText2 = text2 ? safeRenderText(text2) : null;
		} else if (replaceOriginal && text) {
			// Replace original with translation (only if translation exists)
			mainText = safeRenderText(text);
			subText = text2 ? safeRenderText(text2) : null;
			subText2 = null;
		} else {
			// Default: just show original with furigana if enabled
			const processedOriginalText = safeRenderText(originalText);
			mainText = typeof processedOriginalText === 'string' ?
				Utils.applyFuriganaIfEnabled(processedOriginalText) : processedOriginalText;
			subText = null;
			subText2 = null;
		}
	}

	return { mainText, subText, subText2 };
};

// Global animation manager to prevent multiple instances
const AnimationManager = {
	active: false,
	frameId: null,
	callbacks: new Set(),
	lastTime: 0,
	targetFPS: 60,

	start() {
		if (this.active) return;
		this.active = true;
		this.frameInterval = 1000 / this.targetFPS;
		this.animate();
	},

	stop() {
		if (this.frameId) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		this.active = false;
	},

	addCallback(callback) {
		this.callbacks.add(callback);
		this.start();
	},

	removeCallback(callback) {
		this.callbacks.delete(callback);
		if (this.callbacks.size === 0) {
			this.stop();
		}
	},

	animate() {
		if (!this.active) return;

		this.frameId = requestAnimationFrame((currentTime) => {
			if (currentTime - this.lastTime >= this.frameInterval) {
				this.callbacks.forEach(callback => {
					try {
						callback();
					} catch (error) {
						// Error ignored
					}
				});
				this.lastTime = currentTime;
			}
			this.animate();
		});
	}
};

// Enhanced visibility change manager to prevent duplicate listeners (최적화 #8 - 메모리 누수 수정)
const VisibilityManager = {
	listeners: new Set(),
	isListening: false,
	boundHandler: null,

	init() {
		// bind()로 생성된 함수 참조를 저장하여 제거 가능하게 함
		this.boundHandler = this.handleVisibilityChange.bind(this);
	},

	addListener(callback) {
		if (!this.boundHandler) this.init();

		this.listeners.add(callback);
		if (!this.isListening) {
			document.addEventListener('visibilitychange', this.boundHandler);
			this.isListening = true;
		}
	},

	removeListener(callback) {
		this.listeners.delete(callback);
		if (this.listeners.size === 0 && this.isListening) {
			document.removeEventListener('visibilitychange', this.boundHandler);
			this.isListening = false;
		}
	},

	handleVisibilityChange() {
		const isVisible = !document.hidden;
		this.listeners.forEach(callback => {
			try {
				callback(isVisible);
			} catch (error) {
				// Error ignored
			}
		});
	}
};

// Expose managers globally for performance monitoring
if (typeof window !== 'undefined') {
	window.AnimationManager = AnimationManager;
	window.VisibilityManager = VisibilityManager;
}

const useTrackPosition = (callback) => {
	const callbackRef = useRef();
	const mountedRef = useRef(true);
	const isActiveRef = useRef(true);

	callbackRef.current = callback;

	useEffect(() => {
		// Component mounted
		mountedRef.current = true;
		isActiveRef.current = true;

		const wrappedCallback = () => {
			if (mountedRef.current && isActiveRef.current && callbackRef.current) {
				callbackRef.current();
			}
		};

		// Add to global animation manager
		AnimationManager.addCallback(wrappedCallback);

		// Add visibility listener
		const visibilityCallback = (isVisible) => {
			if (mountedRef.current) {
				isActiveRef.current = isVisible;
			}
		};
		VisibilityManager.addListener(visibilityCallback);

		return () => {
			// Component unmounting
			mountedRef.current = false;
			isActiveRef.current = false;
			AnimationManager.removeCallback(wrappedCallback);
			VisibilityManager.removeListener(visibilityCallback);
		};
	}, []);
};

// 새로운 노래방 컴포넌트 - synced 모드 기반의 간단한 구조
const KaraokeLine = react.memo(({ line, position, isActive, globalCharOffset = 0, activeGlobalCharIndex = -1 }) => {
	if (!line || !line.syllables || !Array.isArray(line.syllables)) {
		return line?.text || "";
	}

	const elements = [];
	let localCharIndex = 0;

	// Build raw text and apply furigana if enabled
	const rawLineText = line.syllables.map(syllable => syllable?.text || "").join("");
	const processedText = Utils.applyFuriganaIfEnabled(rawLineText);
	const hasFurigana = processedText !== rawLineText && processedText.includes('<ruby>');

	// 전체 글자 정보를 먼저 수집
	const allChars = [];
	line.syllables.forEach((syllable, syllableIndex) => {
		if (!syllable || !syllable.text) return;

		const syllableStart = syllable.startTime || 0;
		const syllableEnd = syllable.endTime || syllableStart + 500;
		const syllableText = syllable.text || "";
		const charArray = Array.from(syllableText);

		charArray.forEach((char, charIndex) => {
			const charDuration = (syllableEnd - syllableStart) / charArray.length;
			const charStart = syllableStart + (charIndex * charDuration);
			const charEnd = charStart + charDuration;

			allChars.push({
				char,
				charStart,
				charEnd,
				syllableIndex,
				charIndex,
				localIndex: localCharIndex,
				globalIndex: globalCharOffset + localCharIndex
			});
			localCharIndex++;
		});
	});

	// 현재 활성 글자 찾기 (이 줄에서만)
	let activeLocalIndex = -1;
	if (isActive) {
		for (let i = 0; i < allChars.length; i++) {
			if (position >= allChars[i].charStart && position < allChars[i].charEnd) {
				activeLocalIndex = i;
				break;
			}
		}
	}

	const karaokeBounceEnabled = CONFIG.visual["karaoke-bounce"];

	const charRenderData = allChars.map((charInfo, index) => {
		const isCharActive = activeLocalIndex === index;
		const isCharSung = isActive && position > charInfo.charEnd;

		const currentGlobalIndex = charInfo.globalIndex;
		let waveOffset = 0;
		let waveScale = 1;
		let transitionDelay = 0;
		let shouldAnimate = false;

		if (karaokeBounceEnabled && activeGlobalCharIndex >= 0) {
			const distance = Math.abs(currentGlobalIndex - activeGlobalCharIndex);
			// Allow animation for chars within range OR recently passed chars (for smooth finish)
			if (distance <= 2 || (currentGlobalIndex < activeGlobalCharIndex && distance <= 5)) {
				shouldAnimate = true;
				if (distance <= 2) {
					transitionDelay = distance * 0.05;
					const normalizedDistance = distance / 2;
					const waveStrength = Math.max(0, 1 - normalizedDistance * normalizedDistance);
					waveOffset = -10 * waveStrength;
					waveScale = 1 + 0.12 * waveStrength;
				}
			}
		}

		let className = "lyrics-karaoke-char";
		if (isCharActive) {
			className += " active";
		} else if (isCharSung) {
			className += " sung";
		}

		const style = shouldAnimate ? {
			transform: `translateY(${waveOffset}px) scale(${waveScale})`,
			transition: `transform 0.6s cubic-bezier(0.25, 0.46, 0.45, 0.94) ${transitionDelay}s, color 0.2s ease-out`,
			transitionDelay: `${transitionDelay}s`
		} : {
			transition: "transform 0.3s ease-out, color 0.2s ease-out"
		};

		return {
			char: charInfo.char,
			className,
			style,
			key: `char-${charInfo.globalIndex}`,
			syllableIndex: charInfo.syllableIndex
		};
	});

	// Use the already built rawLineText from above
	const tokens = [];
	const whitespacePattern = /([\s\u00a0\u1680\u2000-\u200b\u202f\u205f\u3000]+)/gu;
	let lastIndex = 0;
	let match;

	// Build text from charRenderData to ensure exact matching
	const actualText = charRenderData.map(c => c.char).join('');

	// Reset regex state
	whitespacePattern.lastIndex = 0;
	while ((match = whitespacePattern.exec(actualText)) !== null) {
		if (match.index > lastIndex) {
			tokens.push({ type: "word", value: actualText.slice(lastIndex, match.index) });
		}
		tokens.push({ type: "space", value: match[0] });
		lastIndex = match.index + match[0].length;
	}

	if (lastIndex < actualText.length) {
		tokens.push({ type: "word", value: actualText.slice(lastIndex) });
	}

	const hasWhitespaceToken = tokens.some(token => token.type === "space");
	// Total character count including spaces
	const totalTokenChars = tokens.reduce((sum, token) => sum + Array.from(token.value).length, 0);
	const actualCharCount = charRenderData.length;

	// Parse furigana HTML to extract readings for each kanji with position tracking
	// Do this BEFORE word grouping so it's available for both paths
	const furiganaMap = new Map(); // position -> reading
	if (hasFurigana) {
		const rubyRegex = /<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g;

		// Build clean text from processedText (removing all HTML tags)
		const cleanText = processedText.replace(/<ruby>([^<]+)<rt>[^<]+<\/rt><\/ruby>/g, '$1');

		// Now parse the HTML and map positions
		let currentPos = 0;
		let lastMatchEnd = 0;
		let match;

		rubyRegex.lastIndex = 0;

		while ((match = rubyRegex.exec(processedText)) !== null) {
			const kanjiSequence = match[1];
			const reading = match[2];

			// Calculate position by counting plain text before this match
			const beforeMatch = processedText.substring(lastMatchEnd, match.index);
			const plainTextBefore = beforeMatch.replace(/<[^>]+>/g, '');
			currentPos += plainTextBefore.length;

			// Map each kanji to its reading
			if (kanjiSequence.length === 1) {
				furiganaMap.set(currentPos, reading);
			} else {
				// Multiple kanji - split the reading
				const kanjiChars = Array.from(kanjiSequence);
				const readingChars = Array.from(reading);
				const charsPerKanji = Math.floor(readingChars.length / kanjiChars.length);

				kanjiChars.forEach((kanji, idx) => {
					let kanjiReading;
					if (idx === kanjiChars.length - 1) {
						// Last kanji gets all remaining reading
						kanjiReading = readingChars.slice(idx * charsPerKanji).join('');
					} else {
						kanjiReading = readingChars.slice(idx * charsPerKanji, (idx + 1) * charsPerKanji).join('');
					}
					furiganaMap.set(currentPos + idx, kanjiReading);
				});
			}

			// Move position forward by the number of kanji
			currentPos += kanjiSequence.length;
			lastMatchEnd = match.index + match[0].length;
		}
	}

	// Word grouping works if we have spaces and total chars match
	let useWordGrouping = hasWhitespaceToken && totalTokenChars === actualCharCount;

	if (useWordGrouping) {
		let charCursor = 0;
		let mappingFailed = false;

		tokens.forEach((token, tokenIndex) => {
			if (mappingFailed) {
				return;
			}

			if (token.type === "word") {
				const wordChars = Array.from(token.value);
				const wordCharData = charRenderData.slice(charCursor, charCursor + wordChars.length);

				if (wordCharData.length !== wordChars.length) {
					mappingFailed = true;
					return;
				}

				// Apply furigana to each character in the word
				const wordChildren = wordCharData.map((charData, localIdx) => {
					const globalIdx = charCursor + localIdx;
					const char = charData.char;
					const reading = furiganaMap.get(globalIdx);

					if (reading) {
						// Has furigana
						return react.createElement(
							"span",
							{
								key: charData.key,
								className: charData.className,
								style: charData.style
							},
							react.createElement(
								"ruby",
								null,
								char,
								react.createElement("rt", null, reading)
							)
						);
					} else {
						// No furigana
						return react.createElement(
							"span",
							{
								key: charData.key,
								className: charData.className,
								style: charData.style
							},
							char
						);
					}
				});

				elements.push(
					react.createElement(
						"span",
						{
							key: `word-${tokenIndex}`,
							className: "lyrics-karaoke-word"
						},
						wordChildren
					)
				);

				charCursor += wordChars.length;
			} else {
				// Space token - render the space characters from charRenderData
				const spaceChars = Array.from(token.value);
				const spaceCharData = charRenderData.slice(charCursor, charCursor + spaceChars.length);

				if (spaceCharData.length !== spaceChars.length) {
					mappingFailed = true;
					return;
				}

				const spaceChildren = spaceCharData.map(charData =>
					react.createElement(
						"span",
						{
							key: charData.key,
							className: charData.className,
							style: charData.style
						},
						charData.char
					)
				);

				elements.push(
					react.createElement(
						"span",
						{
							key: `space-${tokenIndex}`,
							className: "lyrics-karaoke-word-space"
						},
						spaceChildren
					)
				);

				charCursor += spaceChars.length;
			}
		});

		if (mappingFailed || charCursor !== charRenderData.length) {
			useWordGrouping = false;
			elements.length = 0;
		}
	}

	if (!useWordGrouping) {
		// Furigana map is already built above, just use it
		charRenderData.forEach((charData, index) => {
			const char = charData.char;
			const reading = furiganaMap.get(index); // Use position index instead of character

			// If this character has a furigana reading, wrap in ruby tag
			if (reading) {
				// Wrap ruby in a span that handles the karaoke animation
				elements.push(
					react.createElement(
						"span",
						{
							key: charData.key,
							className: charData.className,
							style: charData.style
						},
						react.createElement(
							"ruby",
							null,
							char,
							react.createElement("rt", null, reading)
						)
					)
				);
			} else {
				elements.push(
					react.createElement(
						"span",
						{
							key: charData.key,
							className: charData.className,
							style: charData.style
						},
						char
					)
				);
			}

			// Only add syllable boundary space if the next character is actually a space
			const nextCharData = charRenderData[index + 1];
			if (nextCharData && nextCharData.syllableIndex !== charData.syllableIndex) {
				// Check if the next character is a whitespace character
				if (nextCharData.char && /\s/.test(nextCharData.char)) {
					// Skip - the space will be rendered as part of charRenderData
				} else {
					// No space in the actual text, don't add artificial space
					// This prevents "woul d" style splitting
				}
			}
		});
	}

	return react.createElement("span", { className: "lyrics-karaoke-line" }, elements);
});

const SyncedLyricsPage = react.memo(({ lyrics = [], provider, copyright, isKara }) => {
	// 유효성 검사를 Hook 호출 전에 수행하지 않음 - Hook은 항상 같은 순서로 호출되어야 함
	const [position, setPosition] = useState(0);
	const [trackOffset, setTrackOffset] = useState(0);
	const [isScrolling, setIsScrolling] = useState(false);
	const [containerReady, setContainerReady] = useState(false);
	const activeLineEle = useRef();
	const lyricContainerEle = useRef();
	const scrollTimeout = useRef(null);
	const lyricsId = useMemo(() => lyrics[0]?.text || "no-lyrics", [lyrics]);

	// ref callback to detect when container is mounted
	const containerRefCallback = useCallback((node) => {
		lyricContainerEle.current = node;
		if (node) {
			setContainerReady(true);
		}
	}, []);

	useEffect(() => {
		const container = lyricContainerEle.current;
		if (!container) return;

		const handleWheel = () => {
			setIsScrolling(true);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
			scrollTimeout.current = setTimeout(() => {
				setIsScrolling(false);
			}, 3000);
		};

		container.addEventListener("wheel", handleWheel, { passive: true });
		container.addEventListener("touchmove", handleWheel, { passive: true });

		return () => {
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("touchmove", handleWheel);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
		};
	}, [lyricsId, containerReady]);

	const handleContainerClick = () => {
		if (isScrolling) {
			setIsScrolling(false);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
		}
	};

	// Load track offset asynchronously
	useEffect(() => {
		const loadOffset = async () => {
			const trackUri = Spicetify.Player?.data?.item?.uri || "";
			if (trackUri) {
				const offset = (await Utils.getTrackSyncOffset(trackUri)) || 0;
				setTrackOffset(offset);
			}
		};

		loadOffset();

		// Listen for offset changes
		const handleOffsetChange = (event) => {
			const trackUri = Spicetify.Player?.data?.item?.uri || "";
			if (event.detail.trackUri === trackUri) {
				setTrackOffset(event.detail.offset);
			}
		};

		window.addEventListener('ivLyrics:offset-changed', handleOffsetChange);
		return () => {
			window.removeEventListener('ivLyrics:offset-changed', handleOffsetChange);
		};
	}, [Spicetify.Player?.data?.item?.uri]);

	useTrackPosition(() => {
		const newPos = Spicetify.Player.getProgress();
		const delay = CONFIG.visual.delay + trackOffset;
		// Always update position for smoother karaoke animation
		setPosition(newPos + delay);
	});

	// 전체 가사의 글로벌 캐릭터 인덱스와 현재 활성 글자 계산
	const { globalCharOffsets, activeGlobalCharIndex } = useMemo(() => {
		const offsets = [];
		let totalChars = 0;
		let activeCharIndex = -1;

		for (let i = 0; i < lyrics.length; i++) {
			const line = lyrics[i];
			offsets.push(totalChars);

			if (line?.syllables && Array.isArray(line.syllables)) {
				// 이 줄이 활성 상태인지 확인
				const isLineActive = position >= (line.startTime || 0) &&
					(i === lyrics.length - 1 || position < (lyrics[i + 1]?.startTime || Infinity));

				for (const syllable of line.syllables) {
					if (!syllable || !syllable.text) continue;

					const syllableText = syllable.text || "";
					const charArray = Array.from(syllableText);
					const syllableStart = syllable.startTime || 0;
					const syllableEnd = syllable.endTime || syllableStart + 500;

					for (let charIdx = 0; charIdx < charArray.length; charIdx++) {
						const charDuration = (syllableEnd - syllableStart) / charArray.length;
						const charStart = syllableStart + (charIdx * charDuration);
						const charEnd = charStart + charDuration;

						// 현재 재생 중인 글자 찾기
						if (isLineActive && position >= charStart && position < charEnd) {
							activeCharIndex = totalChars;
						}

						totalChars++;
					}
				}
			}
		}

		return { globalCharOffsets: offsets, activeGlobalCharIndex: activeCharIndex };
	}, [lyrics, position]);

	const lyricWithEmptyLines = useMemo(
		() =>
			[emptyLine, emptyLine, ...lyrics].map((line, i) => ({
				...line,
				lineNumber: i,
			})),
		[lyrics]
	);

	// Optimize active line calculation with memoization
	const activeLineIndex = useMemo(() => {
		for (let i = lyricWithEmptyLines.length - 1; i > 0; i--) {
			const line = lyricWithEmptyLines[i];
			if (line && position >= (line.startTime || 0)) {
				return i;
			}
		}
		return 0;
	}, [lyricWithEmptyLines, position]);

	const activeLines = useMemo(() => {
		if (isScrolling) return lyricWithEmptyLines;
		const startIndex = Math.max(activeLineIndex - CONFIG.visual["lines-before"], 0);
		const linesCount = CONFIG.visual["lines-before"] + CONFIG.visual["lines-after"] + 1;
		return lyricWithEmptyLines.slice(startIndex, startIndex + linesCount);
	}, [activeLineIndex, lyricWithEmptyLines, isScrolling]);

	// Emit current lyric index for fullscreen overlay
	useEffect(() => {
		// Subtract 2 for the empty lines at the beginning
		const actualIndex = Math.max(0, activeLineIndex - 2);
		window.dispatchEvent(new CustomEvent('ivLyrics:lyric-index-changed', {
			detail: { index: actualIndex, total: lyrics.length }
		}));
	}, [activeLineIndex, lyrics.length]);

	// 스크롤 모드 진입 시 한 번만 현재 줄로 이동
	const prevIsScrolling = useRef(false);
	useEffect(() => {
		// 스크롤 모드가 false -> true로 변경될 때만 scrollIntoView 호출
		if (isScrolling && !prevIsScrolling.current) {
			const node = activeLineEle.current;
			if (node) {
				const raf = typeof requestAnimationFrame === "function"
					? requestAnimationFrame
					: (cb) => setTimeout(cb, 0);
				raf(() => {
					node.scrollIntoView({
						block: "center",
						inline: "nearest",
					});
				});
			}
		}
		prevIsScrolling.current = isScrolling;
	}, [isScrolling]);

	// 유효성 검사는 Hook 호출 후에 수행
	if (!Array.isArray(lyrics) || lyrics.length === 0) {
		return react.createElement(
			"div",
			{ className: "lyrics-lyricsContainer-SyncedLyricsPage" },
			react.createElement(
				"div",
				{ className: "lyrics-lyricsContainer-LyricsUnavailablePage" },
				react.createElement(
					"span",
					{ className: "lyrics-lyricsContainer-LyricsUnavailableMessage" },
					"No lyrics available"
				)
			)
		);
	}

	let offset = lyricContainerEle.current ? lyricContainerEle.current.clientHeight / 2 : 0;
	if (activeLineEle.current) {
		offset += -(activeLineEle.current.offsetTop + activeLineEle.current.clientHeight / 2);
	}

	if (isScrolling) offset = 0;

	return react.createElement(
		"div",
		{
			className: `lyrics-lyricsContainer-SyncedLyricsPage ${isScrolling ? "scrolling-active" : ""}`,
			ref: containerRefCallback,
			onClick: handleContainerClick,
		},
		react.createElement(
			"div",
			{
				className: "lyrics-lyricsContainer-SyncedLyrics",
				style: {
					"--offset": `${offset}px`,
				},
				key: lyricsId,
			},
			...activeLines.map((line, i) => {
				const { text, lineNumber, startTime, originalText, text2 } = line;
				// Show IdlingIndicator on the second empty line (lineNumber === 1) when before first lyric starts
				// Check lineNumber instead of i to handle different lines-before configurations
				// lineNumber 0 = first emptyLine, lineNumber 1 = second emptyLine, lineNumber 2+ = actual lyrics
				if (lineNumber === 1 && activeLineIndex <= 2) {
					// Find first actual lyric line from lyrics array (not from activeLines which may be sliced)
					const firstLyricLine = lyrics[0];
					const firstLyricStartTime = firstLyricLine?.startTime || 1;
					// Only show indicator if we're before the first lyric
					if (position < firstLyricStartTime) {
						return react.createElement(IdlingIndicator, {
							key: `idling-indicator-${lineNumber}`,
							progress: position / firstLyricStartTime,
							delay: firstLyricStartTime / 3,
							isActive: true,
						});
					}
				}

				let className = "lyrics-lyricsContainer-LyricsLine";
				// 스크롤 모드일 때는 i가 곧 인덱스, 아닐 때는 상대적 인덱스 계산
				const activeElementIndex = isScrolling ? activeLineIndex : Math.min(activeLineIndex, CONFIG.visual["lines-before"]);
				let ref;

				if (lineNumber === activeLineIndex) {
					className += " lyrics-lyricsContainer-LyricsLine-active";
					ref = activeLineEle;
				}

				let animationIndex;
				if (isScrolling) {
					animationIndex = 0; // 스크롤 모드에서는 애니메이션 인덱스 무시
				} else if (activeLineIndex <= CONFIG.visual["lines-before"]) {
					animationIndex = i - activeLineIndex;
				} else {
					animationIndex = i - CONFIG.visual["lines-before"] - 1;
				}

				const paddingLine = !isScrolling && ((animationIndex < 0 && -animationIndex > CONFIG.visual["lines-before"]) || animationIndex > CONFIG.visual["lines-after"]);
				if (paddingLine) {
					className += " lyrics-lyricsContainer-LyricsLine-paddingLine";
				}
				const isActive = lineNumber === activeLineIndex;
				const { mainText, subText, subText2 } = getLyricsDisplayMode(isKara, line, text, originalText, text2);

				if (isActive) {
					ref = activeLineEle;
				}

				return react.createElement(
					"div",
					{
						className,
						style: {
							cursor: "pointer",
							"--position-index": animationIndex,
							// Lines moving down (animationIndex > 0) should not animate transform
							"--animation-index": animationIndex > 0 ? 0 : (animationIndex < 0 ? 0 : animationIndex) + 1,
							"--blur-index": Math.abs(animationIndex),
						},
						dir: "auto",
						ref,
						key: lineNumber,
						onClick: (event) => {
							if (startTime) {
								Spicetify.Player.seek(startTime);
							}
						},
					},
					react.createElement(
						"p",
						{
							onContextMenu: (event) => {
								event.preventDefault();
								const copyText = Utils.formatLyricLineToCopy(mainText, subText, subText2, originalText);
								if (copyText) {
									Spicetify.Platform.ClipboardAPI.copy(copyText)
										.then(() => Toast.success(I18n.t("notifications.lyricsCopied")))
										.catch(() => Toast.error(I18n.t("notifications.lyricsCopyFailed")));
								} else {
									Toast.error(I18n.t("notifications.lyricsCopyFailed"));
								}
							},
							// For Furigana/Hiragana HTML strings - React 310 방지를 위한 안전한 검증
							...(typeof mainText === "string" && !isKara && mainText ? { dangerouslySetInnerHTML: { __html: Utils.rubyTextToHTML(mainText) } } : {}),
						},
						// Safe rendering for main text
						(() => {
							if (isKara) {
								// 새로운 노래방 모드 - 전역 글자 인덱스 전달
								const currentLineIndex = lineNumber - 2; // emptyLine 2개 제외
								const globalOffset = currentLineIndex >= 0 && currentLineIndex < globalCharOffsets.length
									? globalCharOffsets[currentLineIndex]
									: 0;

								return react.createElement(KaraokeLine, {
									line,
									position,
									isActive: i === activeElementIndex,
									globalCharOffset: globalOffset,
									activeGlobalCharIndex: activeGlobalCharIndex
								});
							} else {
								// 비카라오케 모드에서는 문자열이면 dangerouslySetInnerHTML 사용
								if (typeof mainText === "string") {
									return null; // Content will be set via dangerouslySetInnerHTML
								} else {
									// 객체인 경우 안전한 렌더링
									return safeRenderText(mainText);
								}
							}
						})()
					),
					(() => {
						if (!subText) return null;
						const props = {
							className: "lyrics-lyricsContainer-LyricsLine-phonetic",
							style: { "--sub-lyric-color": CONFIG.visual["inactive-color"] },
						};
						// React 310 방지: 문자열이고 빈 문자열이 아닐 때만 dangerouslySetInnerHTML 사용
						if (typeof subText === "string" && subText) {
							props.dangerouslySetInnerHTML = { __html: Utils.rubyTextToHTML(subText) };
							return react.createElement("p", props);
						}
						return react.createElement("p", props, safeRenderText(subText));
					})(),
					(() => {
						if (!subText2) return null;
						const props2 = {
							className: "lyrics-lyricsContainer-LyricsLine-translation",
							style: { "--sub-lyric-color": CONFIG.visual["inactive-color"] },
						};
						// React 310 방지: 문자열이고 빈 문자열이 아닐 때만 dangerouslySetInnerHTML 사용
						if (typeof subText2 === "string" && subText2) {
							props2.dangerouslySetInnerHTML = { __html: Utils.rubyTextToHTML(subText2) };
							return react.createElement("p", props2);
						}
						return react.createElement("p", props2, safeRenderText(subText2));
					})()
				);
			})
		),
		react.createElement(CreditFooter, {
			provider,
			copyright,
		})
	);
});

// Global SearchBar manager to prevent duplicate instances
const SearchBarManager = {
	instance: null,
	bindings: new Set(),

	register(instance) {
		// Clean up previous instance
		if (this.instance) {
			this.cleanup();
		}
		this.instance = instance;
	},

	unregister(instance) {
		if (this.instance === instance) {
			this.cleanup();
			this.instance = null;
		}
	},

	bind(key, callback) {
		const bindingKey = `${key}-${callback.name}`;
		if (this.bindings.has(bindingKey)) {
			return; // Already bound
		}
		Spicetify.Mousetrap().bind(key, callback);
		this.bindings.add(bindingKey);
	},

	bindToContainer(container, key, callback) {
		const bindingKey = `container-${key}-${callback.name}`;
		if (this.bindings.has(bindingKey)) {
			return; // Already bound
		}
		Spicetify.Mousetrap(container).bind(key, callback);
		this.bindings.add(bindingKey);
	},

	cleanup() {
		this.bindings.forEach(bindingKey => {
			const [type, key] = bindingKey.split('-');
			if (type === 'container' && this.instance?.container) {
				try {
					Spicetify.Mousetrap(this.instance.container).unbind(key);
				} catch (e) {
					// Container might be null
				}
			} else {
				try {
					Spicetify.Mousetrap().unbind(key);
				} catch (e) {
					// Mousetrap might not be available
				}
			}
		});
		this.bindings.clear();
	}
};

class SearchBar extends react.Component {
	constructor() {
		super();
		this.state = {
			hidden: true,
			atNode: 0,
			foundNodes: [],
		};
		this.container = null;
		this.instanceId = `searchbar-${Date.now()}-${Math.random()}`;
	}

	componentDidMount() {
		// Register with global manager
		SearchBarManager.register(this);

		this.viewPort = document.querySelector(".main-view-container .os-viewport");
		this.mainViewOffsetTop = document.querySelector(".Root__main-view")?.offsetTop || 0;

		this.toggleCallback = () => {
			if (!(Spicetify.Platform.History.location.pathname === "/ivLyrics" && this.container)) return;

			if (this.state.hidden) {
				this.setState({ hidden: false });
				this.container.focus();
			} else {
				this.setState({ hidden: true });
				this.container.blur();
			}
		};
		this.unFocusCallback = () => {
			if (this.container) {
				this.container.blur();
				this.setState({ hidden: true });
			}
		};
		this.loopThroughCallback = (event) => {
			if (!this.state.foundNodes.length) {
				return;
			}

			if (event.key === "Enter") {
				const dir = event.shiftKey ? -1 : 1;
				let atNode = this.state.atNode + dir;
				if (atNode < 0) {
					atNode = this.state.foundNodes.length - 1;
				}
				atNode %= this.state.foundNodes.length;
				const rects = this.state.foundNodes[atNode].getBoundingClientRect();
				if (this.viewPort) {
					this.viewPort.scrollBy(0, rects.y - 100);
				}
				this.setState({ atNode });
			}
		};

		// Use SearchBarManager to prevent duplicate bindings
		SearchBarManager.bind("mod+shift+f", this.toggleCallback);
		if (this.container) {
			SearchBarManager.bindToContainer(this.container, "mod+shift+f", this.toggleCallback);
			SearchBarManager.bindToContainer(this.container, "enter", this.loopThroughCallback);
			SearchBarManager.bindToContainer(this.container, "shift+enter", this.loopThroughCallback);
			SearchBarManager.bindToContainer(this.container, "esc", this.unFocusCallback);
		}
	}

	componentWillUnmount() {
		// Unregister from global manager
		SearchBarManager.unregister(this);
	}

	getNodeFromInput(event) {
		const value = event.target.value.toLowerCase();
		if (!value) {
			this.setState({ foundNodes: [] });
			this.viewPort.scrollTo(0, 0);
			return;
		}

		const lyricsPage = document.querySelector(".lyrics-lyricsContainer-UnsyncedLyricsPage");
		const walker = document.createTreeWalker(
			lyricsPage,
			NodeFilter.SHOW_TEXT,
			(node) => {
				if (node.textContent.toLowerCase().includes(value)) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_REJECT;
			},
			false
		);

		const foundNodes = [];
		while (walker.nextNode()) {
			const range = document.createRange();
			range.selectNodeContents(walker.currentNode);
			foundNodes.push(range);
		}

		if (!foundNodes.length) {
			this.viewPort.scrollBy(0, 0);
		} else {
			const rects = foundNodes[0].getBoundingClientRect();
			this.viewPort.scrollBy(0, rects.y - 100);
		}

		this.setState({ foundNodes, atNode: 0 });
	}

	render() {
		let y = 0;
		let height = 0;
		if (this.state.foundNodes.length) {
			const node = this.state.foundNodes[this.state.atNode];
			const rects = node.getBoundingClientRect();
			y = rects.y + this.viewPort.scrollTop - this.mainViewOffsetTop;
			height = rects.height;
		}
		return react.createElement(
			"div",
			{
				className: `lyrics-Searchbar${this.state.hidden ? " hidden" : ""}`,
			},
			react.createElement("input", {
				ref: (c) => {
					this.container = c;
				},
				onChange: this.getNodeFromInput.bind(this),
			}),
			react.createElement("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "currentColor",
				dangerouslySetInnerHTML: {
					__html: Spicetify.SVGIcons.search,
				},
			}),
			react.createElement(
				"span",
				{
					hidden: this.state.foundNodes.length === 0,
				},
				`${this.state.atNode + 1}/${this.state.foundNodes.length}`
			),
			react.createElement("div", {
				className: "lyrics-Searchbar-highlight",
				style: {
					"--search-highlight-top": `${y}px`,
					"--search-highlight-height": `${height}px`,
				},
			})
		);
	}
}

function isInViewport(element) {
	const rect = element.getBoundingClientRect();
	return (
		rect.top >= 0 &&
		rect.left >= 0 &&
		rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
		rect.right <= (window.innerWidth || document.documentElement.clientWidth)
	);
}

const SyncedExpandedLyricsPage = react.memo(({ lyrics = [], provider, copyright, isKara }) => {
	// Hook은 항상 먼저 호출되어야 함 - React 130 방지
	const [position, setPosition] = useState(0);
	const [trackOffset, setTrackOffset] = useState(0);
	const [isScrolling, setIsScrolling] = useState(false);
	const activeLineRef = useRef(null);
	const pageRef = useRef(null);
	const scrollTimeout = useRef(null);

	useEffect(() => {
		const container = pageRef.current;
		if (!container) return;

		const handleWheel = () => {
			setIsScrolling(true);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
			scrollTimeout.current = setTimeout(() => {
				setIsScrolling(false);
			}, 3000);
		};

		container.addEventListener("wheel", handleWheel, { passive: true });
		container.addEventListener("touchmove", handleWheel, { passive: true });

		return () => {
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("touchmove", handleWheel);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
		};
	}, [lyricsId]);

	const handleContainerClick = () => {
		if (isScrolling) {
			setIsScrolling(false);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
		}
	};

	// Load track offset asynchronously
	useEffect(() => {
		const loadOffset = async () => {
			const trackUri = Spicetify.Player?.data?.item?.uri || "";
			if (trackUri) {
				const offset = (await Utils.getTrackSyncOffset(trackUri)) || 0;
				setTrackOffset(offset);
			}
		};

		loadOffset();

		// Listen for offset changes
		const handleOffsetChange = (event) => {
			const trackUri = Spicetify.Player?.data?.item?.uri || "";
			if (event.detail.trackUri === trackUri) {
				setTrackOffset(event.detail.offset);
			}
		};

		window.addEventListener('ivLyrics:offset-changed', handleOffsetChange);
		return () => {
			window.removeEventListener('ivLyrics:offset-changed', handleOffsetChange);
		};
	}, [Spicetify.Player?.data?.item?.uri]);

	useTrackPosition(() => {
		const newPos = Spicetify.Player.getProgress();
		const delay = CONFIG.visual.delay + trackOffset;
		// Always update position for smoother karaoke animation
		setPosition(newPos + delay);
	});

	const padded = useMemo(() => [emptyLine, ...lyrics], [lyrics]);

	const intialScroll = useMemo(() => [false], [lyrics]);

	const lyricsId = useMemo(() => lyrics[0]?.text || "no-lyrics", [lyrics]);

	// Optimize active line calculation with memoization
	const activeLineIndex = useMemo(() => {
		for (let i = padded.length - 1; i >= 0; i--) {
			const line = padded[i];
			if (line && position >= (line.startTime || 0)) {
				return i;
			}
		}
		return 0;
	}, [padded, position]);

	useEffect(() => {
		if (!isScrolling && activeLineRef.current && (!intialScroll[0] || isInViewport(activeLineRef.current))) {
			activeLineRef.current.scrollIntoView({
				behavior: "smooth",
				block: "center",
				inline: "nearest",
			});
			intialScroll[0] = true;
		}
	}, [activeLineRef.current, isScrolling]);

	// 스크롤 모드 진입 시 현재 가사 위치로 이동
	useEffect(() => {
		if (isScrolling && activeLineRef.current) {
			// 렌더링 후 위치를 잡기 위해 약간의 지연
			setTimeout(() => {
				if (activeLineRef.current) {
					activeLineRef.current.scrollIntoView({ block: "center", behavior: "auto" });
				}
			}, 0);
		}
	}, [isScrolling]);

	// 유효성 검사는 Hook 호출 후에 수행
	if (!Array.isArray(lyrics) || lyrics.length === 0) {
		return react.createElement(
			"div",
			{ className: "lyrics-lyricsContainer-UnsyncedLyricsPage" },
			react.createElement(
				"div",
				{ className: "lyrics-lyricsContainer-LyricsUnavailablePage" },
				react.createElement(
					"span",
					{ className: "lyrics-lyricsContainer-LyricsUnavailableMessage" },
					"No lyrics available"
				)
			)
		);
	}

	return react.createElement(
		"div",
		{
			className: "lyrics-lyricsContainer-UnsyncedLyricsPage",
			key: lyricsId,
			ref: pageRef,
			onClick: handleContainerClick,
		},
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),
		padded.map(({ text, startTime, originalText, text2 }, i) => {
			if (i === 0) {
				const nextLine = padded[1];
				const nextStartTime = nextLine?.startTime || 1;
				return react.createElement(IdlingIndicator, {
					key: `expanded-idling-${i}`,
					isActive: activeLineIndex === 0,
					progress: position / nextStartTime,
					delay: nextStartTime / 3,
				});
			}

			const isActive = i === activeLineIndex;
			const { mainText, subText, subText2 } = getLyricsDisplayMode(false, null, text, originalText, text2);

			let ref;
			if (isActive) {
				ref = activeLineRef;
			}

			let animationIndex;
			if (activeLineIndex <= CONFIG.visual["lines-before"]) {
				animationIndex = i - activeLineIndex;
			} else {
				animationIndex = i - CONFIG.visual["lines-before"] - 1;
			}

			let className = "lyrics-lyricsContainer-LyricsLine";
			if (isActive) {
				className += " lyrics-lyricsContainer-LyricsLine-active";
			}

			const paddingLine = (animationIndex < 0 && -animationIndex > CONFIG.visual["lines-before"]) || animationIndex > CONFIG.visual["lines-after"];
			if (paddingLine) {
				className += " lyrics-lyricsContainer-LyricsLine-paddingLine";
			}

			return react.createElement(
				"div",
				{
					className,
					style: {
						cursor: "pointer",
						"--position-index": animationIndex,
						// Lines moving down (animationIndex > 0) should not animate transform
						"--animation-index": animationIndex > 0 ? 0 : (animationIndex < 0 ? 0 : animationIndex) + 1,
						"--blur-index": Math.abs(animationIndex),
					},
					dir: "auto",
					ref,
					key: i,
					onClick: (event) => {
						if (startTime) {
							Spicetify.Player.seek(startTime);
						}
					},
				},
				react.createElement(
					"p",
					{
						onContextMenu: (event) => {
							event.preventDefault();
							const copyText = Utils.formatLyricLineToCopy(mainText, subText, subText2, originalText);
							if (copyText) {
								Spicetify.Platform.ClipboardAPI.copy(copyText)
									.then(() => Toast.success(I18n.t("notifications.lyricsCopied")))
									.catch(() => Toast.error(I18n.t("notifications.lyricsCopyFailed")));
							} else {
								Toast.error(I18n.t("notifications.lyricsCopyFailed"));
							}
						},
						// For Furigana/Hiragana HTML strings - React 310 방지를 위한 안전한 검증
						...(typeof mainText === "string" && !isKara && mainText ? { dangerouslySetInnerHTML: { __html: Utils.rubyTextToHTML(mainText) } } : {}),
					},
					// Safe rendering for main text
					(() => {
						if (isKara) {
							// 카라오케 모드에서는 KaraokeLine 컴포넌트 사용
							return react.createElement(KaraokeLine, {
								text: mainText,
								startTime,
								position,
								isActive
							});
						} else {
							// 비카라오케 모드에서는 문자열이면 dangerouslySetInnerHTML 사용
							if (typeof mainText === "string") {
								return null; // Content will be set via dangerouslySetInnerHTML
							} else {
								// 객체인 경우 안전한 렌더링
								return safeRenderText(mainText);
							}
						}
					})()
				),
				// React 310 방지: subText가 문자열이고 비어있지 않을 때만 렌더링
				subText && typeof subText === "string" && subText && react.createElement("p", {
					className: "lyrics-lyricsContainer-LyricsLine-phonetic",
					style: {
						"--sub-lyric-color": CONFIG.visual["inactive-color"],
					},
					dangerouslySetInnerHTML: {
						__html: Utils.rubyTextToHTML(subText),
					},
				}),
				// React 310 방지: subText2가 문자열이고 비어있지 않을 때만 렌더링
				subText2 && typeof subText2 === "string" && subText2 && react.createElement("p", {
					className: "lyrics-lyricsContainer-LyricsLine-translation",
					style: {
						"--sub-lyric-color": CONFIG.visual["inactive-color"],
					},
					dangerouslySetInnerHTML: {
						__html: Utils.rubyTextToHTML(subText2),
					},
				})
			);
		}),
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),
		react.createElement(CreditFooter, {
			provider,
			copyright,
		}),
		react.createElement(SearchBar, null)
	);
});

const UnsyncedLyricsPage = react.memo(({ lyrics = [], provider, copyright }) => {
	// Hook은 항상 같은 순서로 호출되어야 함 - React 130 방지
	const lyricsArray = useMemo(() => {
		// React 31 방지: 안전한 배열 변환 및 유효성 검사
		if (!lyrics) {
			return [];
		}
		if (Array.isArray(lyrics)) {
			// 배열의 각 요소가 유효한지 확인
			return lyrics.filter(item => item !== null && item !== undefined);
		}
		if (typeof lyrics === "string") {
			return lyrics.split("\n").map((text, index) => ({ text, index }));
		}
		// 비어있거나 잘못된 데이터인 경우 빈 배열 반환
		return [];
	}, [lyrics]);

	// 유효성 검사는 Hook 호출 후에 수행
	if (lyricsArray.length === 0) {
		return react.createElement(
			"div",
			{ className: "lyrics-lyricsContainer-UnsyncedLyricsPage" },
			react.createElement(
				"div",
				{ className: "lyrics-lyricsContainer-LyricsUnavailablePage" },
				react.createElement(
					"span",
					{ className: "lyrics-lyricsContainer-LyricsUnavailableMessage" },
					I18n.t("messages.noLyrics")
				)
			)
		);
	}

	return react.createElement(
		"div",
		{
			className: "lyrics-lyricsContainer-UnsyncedLyricsPage",
		},
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),
		...lyricsArray.map(({ text, originalText, text2 }, index) => {
			const { mainText: lineText, subText, subText2: showMode2Translation } = getLyricsDisplayMode(false, null, text, originalText, text2);

			// Convert lyrics to text for comparison
			const belowOrigin = (typeof originalText === "object" ? originalText?.props?.children?.[0] : originalText)?.replace(/\s+/g, "");
			const belowTxt = (typeof text === "object" ? text?.props?.children?.[0] : text)?.replace(/\s+/g, "");

			// Show sub-lines in "below" mode or when we have Mode 2 translation in either mode
			const displayMode = CONFIG.visual["translate:display-mode"];
			const showTranslatedBelow = displayMode === "below";
			const replaceOriginal = displayMode === "replace";
			const belowMode = showTranslatedBelow && originalText && belowOrigin !== belowTxt;
			const showMode2 = !!showMode2Translation && (showTranslatedBelow || replaceOriginal);

			return react.createElement(
				"div",
				{
					className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
					key: index,
					dir: "auto",
				},
				react.createElement(
					"p",
					{
						onContextMenu: (event) => {
							event.preventDefault();
							Spicetify.Platform.ClipboardAPI.copy(Utils.convertParsedToUnsynced(lyrics, belowMode).original)
								.then(() => Toast.success(I18n.t("notifications.lyricsCopied")))
								.catch(() => Toast.error(I18n.t("notifications.lyricsCopyFailed")));
						},
						// React 310 방지: 문자열이고 비어있지 않을 때만 dangerouslySetInnerHTML 사용
						...(typeof lineText === "string" && lineText
							? { dangerouslySetInnerHTML: { __html: Utils.rubyTextToHTML(lineText) } }
							: {}),
					},
					typeof lineText === "string" ? null : lineText
				),
				belowMode &&
				react.createElement(
					"p",
					{
						className: "lyrics-lyricsContainer-LyricsLine-phonetic",
						style: {
							"--sub-lyric-color": CONFIG.visual["inactive-color"]
						},
						onContextMenu: (event) => {
							event.preventDefault();
							Spicetify.Platform.ClipboardAPI.copy(Utils.convertParsedToUnsynced(lyrics, belowMode).conver)
								.then(() => Toast.success(I18n.t("notifications.translationCopied")))
								.catch(() => Toast.error(I18n.t("notifications.translationCopyFailed")));
						},
						// React 310 방지: 문자열이고 비어있지 않을 때만 dangerouslySetInnerHTML 사용
						...(typeof subText === "string" && subText
							? { dangerouslySetInnerHTML: { __html: Utils.rubyTextToHTML(subText) } }
							: {}),
					},
					typeof subText === "string" ? null : subText
				),
				showMode2 &&
				react.createElement(
					"p",
					{
						className: "lyrics-lyricsContainer-LyricsLine-translation",
						style: {
							"--sub-lyric-color": CONFIG.visual["inactive-color"]
						},
						onContextMenu: (event) => {
							event.preventDefault();
							Spicetify.Platform.ClipboardAPI.copy(showMode2Translation)
								.then(() => Toast.success(I18n.t("notifications.secondTranslationCopied")))
								.catch(() => Toast.error(I18n.t("notifications.secondTranslationCopyFailed")));
						},
						// React 310 방지: 문자열이고 비어있지 않을 때만 dangerouslySetInnerHTML 사용
						...(typeof showMode2Translation === "string" && showMode2Translation
							? { dangerouslySetInnerHTML: { __html: Utils.rubyTextToHTML(showMode2Translation) } }
							: {}),
					},
					typeof showMode2Translation === "string" ? null : showMode2Translation
				)
			);
		}),
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),

		react.createElement(CreditFooter, {
			provider,
			copyright,
		}),
		react.createElement(SearchBar, null)
	);
});




const LoadingIcon = react.createElement(
	"svg",
	{
		width: "200px",
		height: "200px",
		viewBox: "0 0 100 100",
		preserveAspectRatio: "xMidYMid",
	},
	react.createElement(
		"circle",
		{
			cx: "50",
			cy: "50",
			r: "0",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
		},
		react.createElement("animate", {
			attributeName: "r",
			repeatCount: "indefinite",
			dur: "1s",
			values: "0;40",
			keyTimes: "0;1",
			keySplines: "0 0.2 0.8 1",
			calcMode: "spline",
			begin: "0s",
		}),
		react.createElement("animate", {
			attributeName: "opacity",
			repeatCount: "indefinite",
			dur: "1s",
			values: "1;0",
			keyTimes: "0;1",
			keySplines: "0.2 0 0.8 1",
			calcMode: "spline",
			begin: "0s",
		})
	),
	react.createElement(
		"circle",
		{
			cx: "50",
			cy: "50",
			r: "0",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
		},
		react.createElement("animate", {
			attributeName: "r",
			repeatCount: "indefinite",
			dur: "1s",
			values: "0;40",
			keyTimes: "0;1",
			keySplines: "0 0.2 0.8 1",
			calcMode: "spline",
			begin: "-0.5s",
		}),
		react.createElement("animate", {
			attributeName: "opacity",
			repeatCount: "indefinite",
			dur: "1s",
			values: "1;0",
			keyTimes: "0;1",
			keySplines: "0.2 0 0.8 1",
			calcMode: "spline",
			begin: "-0.5s",
		})
	)
);


const LyricsPage = ({ lyricsContainer }) => {
	const modes = CONFIG.modes;
	const activeMode = lyricsContainer.getCurrentMode();
	const lockMode = CONFIG.locked;

	const topBarProps = {
		links: modes,
		activeLink: modes[activeMode] || modes[0],
		lockLink: lockMode !== -1 ? modes[lockMode] : null,
		switchCallback: (mode) => {
			const modeIndex = modes.indexOf(mode);
			if (modeIndex !== -1) {
				lyricsContainer.switchTo(modeIndex);
			}
		},
		lockCallback: (mode) => {
			const modeIndex = modes.indexOf(mode);
			if (modeIndex !== -1) {
				lyricsContainer.lockIn(modeIndex);
			}
		}
	};

	const topBarContent = typeof TopBarContent === "function"
		? react.createElement(TopBarContent, topBarProps)
		: null;

	return react.createElement(
		react.Fragment,
		null,
		topBarContent,
		lyricsContainer.render()
	);
};
