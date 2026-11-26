import { isKeyboardShortcutComposition } from '#ivlyrics/core/keyboardShortcut.mjs';
import { seekSyncCreatorByOffset, seekSyncCreatorFromProgressBar } from './syncCreatorSeek.mjs';

export function useSyncCreatorNavigation({
	react: { useCallback, useEffect }, host, getPlayer, canStartOperation,
	editor: { mode, lyricsText, lyricsLines, previousNavigableLineIndex, nextNavigableLineIndex, activeParallelTargetId, currentParallelParts },
	refs: { manualPreviewExitRef, lyricsScrollRef, pendingParallelNavigationRef },
	actions: { setMode, setCurrentLineIndex, claimSessionForLocalEditing, resetCurrentSyncInput, setActiveParallelPartId, selectParallelPart },
}) {
	// Preview follows playback on its own. Any manual line navigation means the
	// user wants to edit that line, so it leaves preview before moving. The ref
	// covers the window before the preview polling effect is torn down.
	const leavePreviewForLineNavigation = useCallback(() => {
		if (mode === 'preview') manualPreviewExitRef.current = true;
		setMode(prev => (prev === 'preview' ? 'idle' : prev));
	}, [mode]);

	const selectLine = useCallback((lineIndex, parallelEdge) => {
		if (lineIndex < 0) return;
		claimSessionForLocalEditing();
		if (parallelEdge) {
			resetCurrentSyncInput();
			pendingParallelNavigationRef.current = { lineIndex, edge: parallelEdge };
		}
		setCurrentLineIndex(lineIndex);
		if (parallelEdge) setActiveParallelPartId('');
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, lyricsScrollRef, pendingParallelNavigationRef, resetCurrentSyncInput,
		setCurrentLineIndex, setActiveParallelPartId]);

	const navigateLine = useCallback(lineIndex => {
		if (!canStartOperation()) return;
		leavePreviewForLineNavigation();
		selectLine(lineIndex);
	}, [canStartOperation, leavePreviewForLineNavigation, selectLine]);
	const goToPrevLine = useCallback(() => navigateLine(previousNavigableLineIndex), [navigateLine, previousNavigableLineIndex]);
	const goToNextLine = useCallback(() => navigateLine(nextNavigableLineIndex), [navigateLine, nextNavigableLineIndex]);
	const goToFirstLine = useCallback(() => navigateLine(0), [navigateLine]);

	useEffect(() => {
		const handleLineNavigationShortcut = (event) => {
			if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
			if (event.defaultPrevented || isKeyboardShortcutComposition(event)
				|| event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
			const target = event.target;
			if (
				target?.isContentEditable
				|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
				|| target?.closest?.('[role="dialog"], [role="separator"], [role="slider"], [role="listbox"], [role="menu"], [role="menuitem"], [aria-haspopup]')
			) return;
			if (!canStartOperation() || !lyricsText || lyricsLines.length === 0) return;

			event.preventDefault();
			event.stopPropagation();
			leavePreviewForLineNavigation();
			const previous = event.key === 'ArrowUp';
			const currentPartIndex = currentParallelParts.findIndex(part => part.id === activeParallelTargetId);
			const nextPart = currentPartIndex < 0 ? null : currentParallelParts[currentPartIndex + (previous ? -1 : 1)];
			if (nextPart) {
				selectParallelPart(nextPart.id);
				return;
			}
			const lineIndex = previous ? previousNavigableLineIndex : nextNavigableLineIndex;
			if (lineIndex < lyricsLines.length) selectLine(lineIndex, previous ? 'last' : 'first');
		};

		host.addEventListener('keydown', handleLineNavigationShortcut, true);
		return () => host.removeEventListener('keydown', handleLineNavigationShortcut, true);
	}, [host, canStartOperation, leavePreviewForLineNavigation, activeParallelTargetId,
		currentParallelParts, selectParallelPart, previousNavigableLineIndex, nextNavigableLineIndex,
		selectLine, lyricsLines.length, lyricsText]);

	const handleSeek = useCallback(event => {
		if (canStartOperation()) seekSyncCreatorFromProgressBar(getPlayer(), event);
	}, [canStartOperation, getPlayer]);
	const handleSeekOffset = useCallback(offsetMs => {
		if (canStartOperation()) seekSyncCreatorByOffset(getPlayer(), offsetMs);
	}, [canStartOperation, getPlayer]);
	return { goToPrevLine, goToNextLine, goToFirstLine, handleSeek, handleSeekOffset };
}
