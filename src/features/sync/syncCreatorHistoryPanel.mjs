import { TOSS_BLUE } from "./syncCreatorStyles.mjs";

export const SYNC_CREATOR_HISTORY_MIN_HEIGHT = 130;

const SYNC_CREATOR_HISTORY_HEIGHT_STORAGE_KEY = 'ivLyrics:syncCreator:history-panel-height';

export function useSyncCreatorHistoryResize({ react, getStorage, getResizeObserver }) {
	const { useState, useRef, useCallback, useEffect } = react;
	const [historyPanelHeight, setHistoryPanelHeight] = useState(() => {
		try {
			const storedHeight = Number(getStorage()?.getItem(SYNC_CREATOR_HISTORY_HEIGHT_STORAGE_KEY));
			return Number.isFinite(storedHeight) && storedHeight >= SYNC_CREATOR_HISTORY_MIN_HEIGHT
				? storedHeight
				: null;
		} catch {
			return null;
		}
	});
	const historyPanelRef = useRef(null);
	const historyResizeDragRef = useRef(null);
	// Rendering the resize handle read the rail height, forcing a synchronous
	// layout in every editor render. The rail size is observed instead.
	const historyRailHeightRef = useRef(0);
	const historyRailObserverRef = useRef({ rail: null, observer: null });
	const getRenderedHistoryPanelMaxHeight = () => Math.max(
		SYNC_CREATOR_HISTORY_MIN_HEIGHT,
		(historyRailHeightRef.current || 720) - 180
	);
	const getHistoryPanelHeightBounds = useCallback(() => {
		const railHeight = historyPanelRef.current?.parentElement?.clientHeight || 720;
		historyRailHeightRef.current = railHeight;
		return {
			min: SYNC_CREATOR_HISTORY_MIN_HEIGHT,
			max: Math.max(SYNC_CREATOR_HISTORY_MIN_HEIGHT, railHeight - 180)
		};
	}, []);
	useEffect(() => {
		const ResizeObserver = getResizeObserver();
		const rail = historyPanelRef.current?.parentElement || null;
		const tracked = historyRailObserverRef.current;
		if (tracked.rail === rail) return;
		tracked.observer?.disconnect();
		tracked.rail = rail;
		tracked.observer = null;
		if (!rail || typeof ResizeObserver !== 'function') return;
		const update = () => {
			historyRailHeightRef.current = rail.clientHeight || 720;
			rail.querySelector('.sync-creator-history-resize-handle')
				?.setAttribute('aria-valuemax', String(Math.round(getRenderedHistoryPanelMaxHeight())));
		};
		tracked.observer = new ResizeObserver(update);
		tracked.observer.observe(rail);
	});
	useEffect(() => () => {
		historyRailObserverRef.current.observer?.disconnect();
		historyRailObserverRef.current = { rail: null, observer: null };
	}, []);
	const persistHistoryPanelHeight = useCallback((height) => {
		try {
			getStorage()?.setItem(SYNC_CREATOR_HISTORY_HEIGHT_STORAGE_KEY, String(Math.round(height)));
		} catch {
			// Resizing still works for this session when storage is unavailable.
		}
	}, [getStorage]);
	const handleHistoryResizePointerDown = useCallback((event) => {
		if (event.button !== 0 || !historyPanelRef.current) return;
		event.preventDefault();
		const bounds = getHistoryPanelHeightBounds();
		const startHeight = historyPanelRef.current.getBoundingClientRect().height;
		historyResizeDragRef.current = {
			pointerId: event.pointerId,
			startY: event.clientY,
			startHeight,
			minHeight: bounds.min,
			maxHeight: bounds.max,
			lastHeight: startHeight
		};
		event.currentTarget.setPointerCapture?.(event.pointerId);
	}, [getHistoryPanelHeightBounds]);
	const handleHistoryResizePointerMove = useCallback((event) => {
		const drag = historyResizeDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		const nextHeight = Math.max(
			drag.minHeight,
			Math.min(drag.maxHeight, drag.startHeight + drag.startY - event.clientY)
		);
		drag.lastHeight = nextHeight;
		setHistoryPanelHeight(nextHeight);
	}, []);
	const finishHistoryResize = useCallback((event) => {
		const drag = historyResizeDragRef.current;
		if (!drag || drag.pointerId !== event.pointerId) return;
		historyResizeDragRef.current = null;
		event.currentTarget.releasePointerCapture?.(event.pointerId);
		persistHistoryPanelHeight(drag.lastHeight);
	}, [persistHistoryPanelHeight]);
	const handleHistoryResizeKeyDown = useCallback((event) => {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		event.preventDefault();
		const bounds = getHistoryPanelHeightBounds();
		const currentHeight = historyPanelHeight
			|| historyPanelRef.current?.getBoundingClientRect().height
			|| SYNC_CREATOR_HISTORY_MIN_HEIGHT;
		const direction = event.key === 'ArrowUp' ? 1 : -1;
		const nextHeight = Math.max(bounds.min, Math.min(bounds.max, currentHeight + direction * 24));
		setHistoryPanelHeight(nextHeight);
		persistHistoryPanelHeight(nextHeight);
	}, [getHistoryPanelHeightBounds, historyPanelHeight, persistHistoryPanelHeight]);

	return {
		panelRef: historyPanelRef,
		height: historyPanelHeight,
		getMaxHeight: getRenderedHistoryPanelMaxHeight,
		onPointerDown: handleHistoryResizePointerDown,
		onPointerMove: handleHistoryResizePointerMove,
		onPointerEnd: finishHistoryResize,
		onKeyDown: handleHistoryResizeKeyDown,
	};
}

// Building an Intl formatter costs far more than formatting with one; the
// history list formatted every entry with a new formatter on each render.
let syncCreatorHistoryTimeFormat = null;
let syncCreatorHistoryTimeFormatLocale = null;
const getSyncCreatorHistoryTimeFormat = () => {
	const locale = typeof navigator !== 'undefined' ? navigator.language : undefined;
	if (!syncCreatorHistoryTimeFormat || syncCreatorHistoryTimeFormatLocale !== locale) {
		syncCreatorHistoryTimeFormat = new Intl.DateTimeFormat(undefined, {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
		syncCreatorHistoryTimeFormatLocale = locale;
	}
	return syncCreatorHistoryTimeFormat;
};

export function renderSyncCreatorHistoryPanel({
	react, translate, styles: s,
	history: { entries: sessionHistory, cursorId: sessionHistoryCursorId, cursorIndex: historyCursorIndex, listRef: historyListRef },
	source: { provider, addonId, lrclibSource: selectedLrclibSource },
	status: { isRestoring: isRestoringCheckpoint, saveState: sessionSaveState, lastSavedAt: lastSessionSavedAt,
		announcement: historyAnnouncement, autosaveEnabled: isSessionAutosaveEnabled, canAddCheckpoint, canUndoPendingEdit },
	resize: { panelRef: historyPanelRef, height: historyPanelHeight, getMaxHeight: getRenderedHistoryPanelMaxHeight,
		onPointerDown: handleHistoryResizePointerDown, onPointerMove: handleHistoryResizePointerMove,
		onPointerEnd: finishHistoryResize, onKeyDown: handleHistoryResizeKeyDown },
	actions: { toggleSessionAutosave, moveHistoryCursor, addManualCheckpoint, restoreHistoryCheckpoint },
}) {
	const getHistoryDate = (timestamp) => {
		if (timestamp === null || timestamp === undefined || timestamp === '') return null;
		const numericTimestamp = Number(timestamp);
		if (!Number.isFinite(numericTimestamp) || numericTimestamp <= 0) return null;
		const date = new Date(numericTimestamp);
		return Number.isFinite(date.getTime()) ? date : null;
	};
	const formatHistoryTime = (timestamp) => {
		const date = getHistoryDate(timestamp);
		if (!date) return '';
		try {
			return getSyncCreatorHistoryTimeFormat().format(date);
		} catch (error) {
			return date.toLocaleTimeString();
		}
	};
	const formatHistoryDateTime = (timestamp) => {
		const date = getHistoryDate(timestamp);
		return date ? date.toISOString() : undefined;
	};
	const getHistoryEntryLabel = (entry) => {
		const lineNumber = Math.max(1, Number(entry?.lineIndex) + 1 || 1);
		if (entry?.kind === 'source') {
			return translate('syncCreator.historySourceLoaded') || '가사 원본 불러옴';
		}
		if (entry?.kind === 'line') {
			if (entry.partId && entry.partId !== 'full') {
				return translate('syncCreator.historyPartCompleted', {
					line: lineNumber,
					part: String(entry.partId).toUpperCase()
				}) || `${lineNumber}번 줄 · ${String(entry.partId).toUpperCase()} 완료`;
			}
			return translate('syncCreator.historyLineCompleted', { line: lineNumber })
				|| `${lineNumber}번 줄 완료`;
		}
		if (entry?.kind === 'working') {
			return translate('syncCreator.historyCurrentWork') || '현재 작업';
		}
		return translate('syncCreator.historyManualCheckpoint') || '수동 체크포인트';
	};
	const historySaveLabel = (() => {
		if (isRestoringCheckpoint) return translate('syncCreator.historyRestoring') || '복원 중';
		if (sessionSaveState === 'loading') return translate('syncCreator.historyChecking') || '복구 확인 중';
		if (sessionSaveState === 'saving') return translate('syncCreator.historySaving') || '저장 중';
		if (sessionSaveState === 'dirty') return translate('syncCreator.historyAutosavePending') || '다음 자동 저장 대기';
		if (sessionSaveState === 'disabled') return translate('syncCreator.historyAutosaveDisabled') || '자동 저장 꺼짐';
		if (sessionSaveState === 'error') return translate('syncCreator.historySaveError') || '저장 실패';
		if (sessionSaveState === 'idle') return translate('syncCreator.historyIdle') || '저장 대기';
		return translate('syncCreator.historySaved') || '자동 저장됨';
	})();
	const historySaveDotColor = sessionSaveState === 'error'
		? '#ff7878'
		: (isRestoringCheckpoint || sessionSaveState === 'saving' || sessionSaveState === 'dirty' || sessionSaveState === 'loading')
			? '#f6c76b'
			: (sessionSaveState === 'idle' || sessionSaveState === 'disabled' ? 'rgba(255,255,255,0.30)' : TOSS_BLUE);
	const historySourceLabel = [
		provider || addonId,
		selectedLrclibSource?.lrclibId !== null && selectedLrclibSource?.lrclibId !== undefined
			? `LRCLIB #${selectedLrclibSource.lrclibId}`
			: ''
	].filter(Boolean).join(' · ');

	const renderHistoryHeader = () => react.createElement('div', { style: s.historyHeader },
		react.createElement('div', { style: s.historyTitleRow },
			react.createElement('h3', { style: { ...s.historyTitle, margin: 0 } }, translate('syncCreator.historyTitle') || '작업 내역'),
			react.createElement('span', { style: s.historyCount }, sessionHistory.length),
			react.createElement('button', {
				type: 'button',
				className: 'sync-creator-autosave-toggle',
				style: s.historyAutosaveToggle,
				role: 'switch',
				'aria-checked': isSessionAutosaveEnabled,
				onClick: toggleSessionAutosave,
				title: translate('syncCreator.historyAutosaveDescription') || '현재 작업을 30초마다 자동 저장합니다.'
			},
				react.createElement('span', { style: s.historyAutosaveLabel }, translate('syncCreator.historyAutosaveToggle') || '자동 저장'),
				react.createElement('span', {
					style: {
						...s.historyAutosaveTrack,
						...(isSessionAutosaveEnabled ? s.historyAutosaveTrackActive : null)
					},
					'aria-hidden': true
				}, react.createElement('span', {
					style: {
						...s.historyAutosaveThumb,
						transform: isSessionAutosaveEnabled ? 'translateX(12px)' : 'translateX(0)'
					}
				}))
			),
			react.createElement('div', { style: s.historyActions },
				react.createElement('button', {
					type: 'button',
					style: s.historyIconButton,
					onClick: () => moveHistoryCursor(-1),
					disabled: isRestoringCheckpoint || (historyCursorIndex <= 0 && !canUndoPendingEdit),
					title: translate('syncCreator.historyPrevious') || '이전 상태',
					'aria-label': translate('syncCreator.historyPrevious') || '이전 상태'
				}, react.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
					react.createElement('path', { d: 'M9 14 4 9l5-5' }),
					react.createElement('path', { d: 'M4 9h9a6 6 0 0 1 6 6v1' })
				)),
				react.createElement('button', {
					type: 'button',
					style: s.historyIconButton,
					onClick: () => moveHistoryCursor(1),
					disabled: historyCursorIndex < 0 || historyCursorIndex >= sessionHistory.length - 1 || isRestoringCheckpoint,
					title: translate('syncCreator.historyNext') || '다음 상태',
					'aria-label': translate('syncCreator.historyNext') || '다음 상태'
				}, react.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' },
					react.createElement('path', { d: 'm15 14 5-5-5-5' }),
					react.createElement('path', { d: 'M20 9h-9a6 6 0 0 0-6 6v1' })
				)),
				react.createElement('button', {
					type: 'button',
					style: s.historyIconButton,
					onClick: addManualCheckpoint,
					disabled: !canAddCheckpoint,
					title: translate('syncCreator.historyAddCheckpoint') || '현재 상태 저장',
					'aria-label': translate('syncCreator.historyAddCheckpoint') || '현재 상태 저장'
				}, react.createElement('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' },
					react.createElement('path', { d: 'M12 5v14M5 12h14' })
				))
			)
		),
		react.createElement('div', { style: s.historyMeta },
			react.createElement('span', { style: s.historySource, title: historySourceLabel }, historySourceLabel || (translate('syncCreator.historyNoSource') || '가사 원본 없음')),
			react.createElement('span', {
				style: s.historySaveState,
				title: lastSessionSavedAt ? formatHistoryTime(lastSessionSavedAt) : ''
			},
				react.createElement('span', { style: { ...s.historySaveDot, background: historySaveDotColor } }),
				historySaveLabel
			)
		)
	);

	const renderHistoryEntry = (entry, index) => {
		const isCurrent = entry.id === sessionHistoryCursorId;
		const historyTimeLabel = formatHistoryTime(entry.createdAt);
		return react.createElement('li', { key: entry.id, style: s.historyItem },
			react.createElement('button', {
				type: 'button',
				className: `sync-creator-history-row${isCurrent ? ' is-current' : ''}`,
				style: { ...s.historyButton, ...(isCurrent ? s.historyButtonActive : null) },
				onClick: isCurrent ? undefined : () => restoreHistoryCheckpoint(entry.id),
				disabled: isCurrent || isRestoringCheckpoint,
				'aria-current': isCurrent ? 'step' : undefined,
				'data-history-id': entry.id,
				title: entry.lineText || getHistoryEntryLabel(entry)
			},
				react.createElement('span', { style: s.historyTimeline, 'aria-hidden': true },
					sessionHistory.length > 1 && react.createElement('span', {
						style: {
							...s.historyLine,
							top: index === 0 ? '50%' : '-7px',
							bottom: index === sessionHistory.length - 1 ? '50%' : '-7px'
						}
					}),
					react.createElement('span', { style: { ...s.historyDot, ...(isCurrent ? s.historyDotActive : null) } })
				),
				react.createElement('span', { style: s.historyContent },
					react.createElement('span', { style: s.historyLabel }, getHistoryEntryLabel(entry)),
					entry.lineText && react.createElement('span', { style: { ...s.historyText, display: 'block' } }, entry.lineText)
				),
				historyTimeLabel && react.createElement('time', {
					style: s.historyTime,
					dateTime: formatHistoryDateTime(entry.createdAt)
				}, historyTimeLabel)
			)
		);
	};

	const renderHistoryResizeHandle = () => react.createElement('div', {
		className: 'sync-creator-history-resize-handle',
		style: s.historyResizeHandle,
		role: 'separator',
		tabIndex: 0,
		'aria-orientation': 'horizontal',
		'aria-label': translate('syncCreator.historyResize') || '작업 내역 높이 조절',
		'aria-valuemin': SYNC_CREATOR_HISTORY_MIN_HEIGHT,
		'aria-valuemax': Math.round(getRenderedHistoryPanelMaxHeight()),
		'aria-valuenow': Math.round(historyPanelHeight || 190),
		title: translate('syncCreator.historyResizeHint') || '위아래로 드래그해 작업 내역 높이를 조절합니다.',
		onPointerDown: handleHistoryResizePointerDown,
		onPointerMove: handleHistoryResizePointerMove,
		onPointerUp: finishHistoryResize,
		onPointerCancel: finishHistoryResize,
		onKeyDown: handleHistoryResizeKeyDown
	}, react.createElement('span', { style: s.historyResizeGrip, 'aria-hidden': true }));
	const renderHistoryLiveRegion = () => react.createElement('div', {
		style: s.historyLive,
		role: 'status',
		'aria-live': 'polite',
		'aria-atomic': 'true'
	}, historyAnnouncement);
	return react.createElement('section', {
		ref: historyPanelRef,
		className: 'sync-creator-history-panel',
		style: {
			...s.historyPanel,
			maxHeight: 'calc(100% - 180px)',
			...(historyPanelHeight ? {
				flex: `0 0 ${Math.round(historyPanelHeight)}px`,
				height: `${Math.round(historyPanelHeight)}px`
			} : null)
		},
		'aria-busy': isRestoringCheckpoint ? 'true' : undefined,
		'aria-label': translate('syncCreator.historyTitle') || '작업 내역'
	},
		renderHistoryResizeHandle(),
		renderHistoryHeader(),
		sessionHistory.length > 0
			? react.createElement('ol', { ref: historyListRef, style: s.historyList },
				sessionHistory.map((entry, index) => renderHistoryEntry(entry, index))
			)
			: react.createElement('div', { style: s.historyEmpty },
				translate('syncCreator.historyEmpty') || '30초 자동 저장 또는 수동 저장 시 작업 상태가 여기에 기록됩니다.'
			),
		renderHistoryLiveRegion()
	);
}
