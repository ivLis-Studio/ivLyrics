import { seekSyncCreatorByOffset, seekSyncCreatorFromProgressBar } from './syncCreatorSeek.mjs';

export function useSyncCreatorNavigation({
	react: { useCallback, useEffect }, host: window, getPlayer,
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

	const goToPrevLine = useCallback(() => {
		leavePreviewForLineNavigation();
		if (previousNavigableLineIndex >= 0) {
			claimSessionForLocalEditing();
			setCurrentLineIndex(previousNavigableLineIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [claimSessionForLocalEditing, leavePreviewForLineNavigation, previousNavigableLineIndex]);

	const goToNextLine = useCallback(() => {
		leavePreviewForLineNavigation();
		if (nextNavigableLineIndex >= 0) {
			claimSessionForLocalEditing();
			setCurrentLineIndex(nextNavigableLineIndex);
			if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
		}
	}, [claimSessionForLocalEditing, leavePreviewForLineNavigation, nextNavigableLineIndex]);

	const goToSyncTarget = useCallback((lineIndex, edge = 'first') => {
		if (lineIndex < 0 || lineIndex >= lyricsLines.length) return;
		claimSessionForLocalEditing();
		resetCurrentSyncInput();
		pendingParallelNavigationRef.current = { lineIndex, edge };
		setCurrentLineIndex(lineIndex);
		setActiveParallelPartId('');
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, lyricsLines.length, resetCurrentSyncInput]);

	const goToPreviousSyncTarget = useCallback(() => {
		leavePreviewForLineNavigation();
		const currentPartIndex = currentParallelParts.findIndex(part => part.id === activeParallelTargetId);
		if (currentPartIndex > 0) {
			selectParallelPart(currentParallelParts[currentPartIndex - 1].id);
			return;
		}
		if (previousNavigableLineIndex < 0) return;
		goToSyncTarget(previousNavigableLineIndex, 'last');
	}, [
		activeParallelTargetId,
		currentParallelParts,
		goToSyncTarget,
		leavePreviewForLineNavigation,
		previousNavigableLineIndex,
		selectParallelPart
	]);

	const goToNextSyncTarget = useCallback(() => {
		leavePreviewForLineNavigation();
		const currentPartIndex = currentParallelParts.findIndex(part => part.id === activeParallelTargetId);
		if (currentPartIndex >= 0 && currentPartIndex < currentParallelParts.length - 1) {
			selectParallelPart(currentParallelParts[currentPartIndex + 1].id);
			return;
		}
		if (nextNavigableLineIndex < 0) return;
		goToSyncTarget(nextNavigableLineIndex, 'first');
	}, [
		activeParallelTargetId,
		currentParallelParts,
		goToSyncTarget,
		leavePreviewForLineNavigation,
		nextNavigableLineIndex,
		selectParallelPart
	]);

	useEffect(() => {
		const handleLineNavigationShortcut = (event) => {
			if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
			if (event.isComposing || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
			const target = event.target;
			if (
				target?.isContentEditable
				|| ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName)
				|| target?.closest?.('[role="dialog"], [role="separator"], [role="slider"], [role="listbox"], [role="menu"], [role="menuitem"], [aria-haspopup]')
			) return;
			if (!lyricsText || lyricsLines.length === 0) return;

			event.preventDefault();
			event.stopPropagation();
			if (event.key === 'ArrowUp') goToPreviousSyncTarget();
			else goToNextSyncTarget();
		};

		window.addEventListener('keydown', handleLineNavigationShortcut, true);
		return () => window.removeEventListener('keydown', handleLineNavigationShortcut, true);
	}, [goToNextSyncTarget, goToPreviousSyncTarget, lyricsLines.length, lyricsText]);

	const goToFirstLine = useCallback(() => {
		leavePreviewForLineNavigation();
		claimSessionForLocalEditing();
		setCurrentLineIndex(0);
		if (lyricsScrollRef.current) lyricsScrollRef.current.scrollLeft = 0;
	}, [claimSessionForLocalEditing, leavePreviewForLineNavigation]);

	const handleSeek = useCallback(event => seekSyncCreatorFromProgressBar(getPlayer(), event), [getPlayer]);
	const handleSeekOffset = useCallback(offsetMs => seekSyncCreatorByOffset(getPlayer(), offsetMs), [getPlayer]);
	return { goToPrevLine, goToNextLine, goToFirstLine, handleSeek, handleSeekOffset };
}
