import { watchSyncCreatorTrackRetention } from './syncCreatorTrackRetention.mjs';

export function useSyncCreatorVisibility({ react: { useEffect, useRef }, containerRef, preventNextTrackRef, trackUri, getPlayer }) {
	const isVisibleRef = useRef(false);

	useEffect(() => {
		if (!containerRef.current) return undefined;
		const observer = new IntersectionObserver(([entry]) => {
			isVisibleRef.current = entry.isIntersecting;
			preventNextTrackRef.current = entry.isIntersecting;
		}, { threshold: 0 });
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, [containerRef, preventNextTrackRef]);

	// Keep Spotify painted while the editor fades in. Once the overlay is
	// opaque, the covered UI can be skipped.
	useEffect(() => {
		const shell = containerRef.current;
		const body = typeof document !== 'undefined' ? document.body : null;
		if (!shell || !body) return undefined;
		let covered = false;
		const cover = () => {
			if (covered) return;
			covered = true;
			body.classList.add('ivlyrics-sync-creator-covering');
		};
		const handleAnimationDone = (event) => {
			if (event.target === shell) cover();
		};
		shell.addEventListener('animationend', handleAnimationDone);
		shell.addEventListener('animationcancel', handleAnimationDone);
		const fadeRunning = typeof shell.getAnimations === 'function'
			&& shell.getAnimations().some(animation => animation.playState === 'running');
		const fallbackTimer = setTimeout(cover, fadeRunning ? 1000 : 0);
		return () => {
			clearTimeout(fallbackTimer);
			shell.removeEventListener('animationend', handleAnimationDone);
			shell.removeEventListener('animationcancel', handleAnimationDone);
			body.classList.remove('ivlyrics-sync-creator-covering');
		};
	}, [containerRef]);

	// Pause the looping style samples while their controls are offscreen.
	const effectPreviewObserverRef = useRef(null);
	const effectPreviewCardsRef = useRef(new Set());
	useEffect(() => {
		const shell = containerRef.current;
		if (!shell || typeof IntersectionObserver !== 'function') return;
		const observed = effectPreviewCardsRef.current;
		const cards = shell.querySelectorAll('.ivlyrics-sync-effect-card');
		if (cards.length === observed.size && Array.prototype.every.call(cards, card => observed.has(card))) return;
		const observer = effectPreviewObserverRef.current ??= new IntersectionObserver((entries) => {
			for (const entry of entries) {
				entry.target.toggleAttribute('data-iv-preview-paused', !entry.isIntersecting);
			}
		}, { threshold: 0 });
		const current = new Set(cards);
		for (const card of observed) {
			if (current.has(card)) continue;
			observer.unobserve(card);
			observed.delete(card);
		}
		for (const card of current) {
			if (observed.has(card)) continue;
			observer.observe(card);
			observed.add(card);
		}
	});
	useEffect(() => () => {
		effectPreviewObserverRef.current?.disconnect();
		effectPreviewObserverRef.current = null;
		effectPreviewCardsRef.current.clear();
	}, []);

	useEffect(() => {
		preventNextTrackRef.current = isVisibleRef.current;
		const stop = watchSyncCreatorTrackRetention({
			trackUri, getPlayer, keepsTrack: () => isVisibleRef.current && preventNextTrackRef.current,
		});
		return () => {
			preventNextTrackRef.current = false;
			stop();
		};
	}, [trackUri, getPlayer, preventNextTrackRef]);
}
