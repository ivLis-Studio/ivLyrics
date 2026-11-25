export function createSyncedLyricRows({ react, IdlingIndicator, LyricsLineBlock }) {
	const syncedRenderItemUpdates = new WeakMap();

	const renderLyricsItems = ({ items, isKara, karaokeRenderGranularity = null, position = 0, liveClock = null, activeLineRef = null, settingsRevision = 0, cache = null }) => {
		const karaokePosition = isKara ? position : 0;
		if (cache && (cache.isKara !== isKara || cache.granularity !== karaokeRenderGranularity
			|| cache.activeLineRef !== activeLineRef || cache.settingsRevision !== settingsRevision
			|| cache.liveClock !== liveClock)) {
			cache.elementsByItem = new WeakMap();
			cache.update = null;
			cache.items = null;
			cache.isKara = isKara;
			cache.granularity = karaokeRenderGranularity;
			cache.activeLineRef = activeLineRef;
			cache.settingsRevision = settingsRevision;
			cache.liveClock = liveClock;
		}
		const renderItem = (item) => {
			const renderPosition = Number.isFinite(item.karaokePosition)
				? item.karaokePosition : (item.karaokeActive ? karaokePosition : 0);
			// Only rows that follow the live clock get continuous painting. Pinned
			// completed or future rows keep their static React output.
			const itemLiveClock = liveClock && isKara && item.karaokeActive && renderPosition === karaokePosition
				? liveClock : null;
			const previous = cache?.elementsByItem?.get(item);
			if (previous && previous.position === renderPosition) return previous.element;
			const element = item.type === "indicator"
				? react.createElement(IdlingIndicator, {
					key: item.key,
					isActive: item.isActive,
					delay: item.delay,
					durationMs: item.durationMs,
					settingsRevision,
					lineRef: (item.trackLineRef ?? item.isActive) ? activeLineRef : null,
					detailClassName: item.detailClassName,
					...(Number.isFinite(item.fadeDurationMs) ? { fadeDurationMs: item.fadeDurationMs } : {}),
					...(Number.isFinite(item.offsetPx) ? { offsetPx: item.offsetPx } : {}),
				})
				: react.createElement(LyricsLineBlock, {
					key: item.key,
					className: item.className,
					style: item.style,
					lineRef: item.trackLineRef ? activeLineRef : null,
					seekTime: item.canSeek ? item.startTime : null,
					mainText: item.mainText,
					subText: item.subText,
					subText2: item.subText2,
					culturalNote: item.culturalNote,
					originalText: item.originalText,
					isKara,
					karaokeRenderGranularity,
					line: item.line,
					// Singing rows follow the live clock. Completed rows receive a stable time
					// beyond their final glyph so their fill does not snap back while the parent
					// line is easing out; future rows remain pinned to zero.
					position: renderPosition,
					...(itemLiveClock ? { liveClock: itemLiveClock } : {}),
					isActive: item.karaokeActive,
					isCurrentLine: item.isActiveLine,
					isEffectFocused: item.effectFocused,
					isEffectLive: item.effectLive,
					settingsRevision,
					globalCharOffset: item.globalCharOffset,
					activeGlobalCharIndex: item.activeGlobalCharIndex,
					hiddenFromAccessibility: item.hiddenFromAccessibility === true,
				});
			cache?.elementsByItem?.set(item, { position: renderPosition, element });
			return element;
		};
		const update = syncedRenderItemUpdates.get(items);
		if (cache && update && cache.items === items) return cache.elements;
		let elements;
		if (cache?.update && update?.frame === cache.update.frame
			&& update.revision === cache.update.revision + 1) {
			elements = cache.elements.slice();
			for (const index of update.indices) elements[index] = renderItem(items[index]);
		} else {
			elements = items.map(renderItem);
		}
		if (cache) {
			cache.items = items;
			cache.elements = elements;
			cache.update = update;
		}
		return elements;
	};

	const prepareLiveSyncedRenderItems = (items, position) => {
		const frame = {
			items,
			revision: 0,
			live: items.flatMap((item, index) => item.karaokeActive ? [{
				index,
				// A pinned completion is contentEnd + 900ms, beyond the 820ms release
				// window. Only rows following the clock have this preparation position.
				followsClock: item.karaokePosition === position,
			}] : []),
		};
		syncedRenderItemUpdates.set(items, { frame, revision: 0, indices: [] });
		return frame;
	};

	const advanceLiveSyncedRenderItems = (frame, position, activeGlobalCharIndex) => {
		let items = frame.items;
		const indices = [];
		for (const { index, followsClock } of frame.live) {
			const item = items[index];
			const karaokePosition = followsClock ? position : item.karaokePosition;
			if (item.karaokePosition === karaokePosition && item.activeGlobalCharIndex === activeGlobalCharIndex) continue;
			if (items === frame.items) items = items.slice();
			items[index] = { ...item, karaokePosition, activeGlobalCharIndex };
			indices.push(index);
		}
		if (items !== frame.items) {
			frame.revision++;
			syncedRenderItemUpdates.set(items, { frame, revision: frame.revision, indices });
		}
		frame.items = items;
		return items;
	};

	return { renderLyricsItems, prepareLiveSyncedRenderItems, advanceLiveSyncedRenderItems };
}
