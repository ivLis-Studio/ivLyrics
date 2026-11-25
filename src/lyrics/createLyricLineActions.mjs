import { getCopyableText } from "./lyricDisplayText.mjs";

export function createLyricLineActions({
	getVisualSettings, prefersReducedLyricsMotion, supportsScale, clearPlaybackCorrection,
	seek, copy, notifySuccess, notifyError, translateSeekTitle,
}) {
	const copyLyricText = (text, successMessageKey, failureMessageKey) => {
		const copyText = getCopyableText(text);
		if (!copyText) {
			notifyError(failureMessageKey);
			return;
		}

		copy(copyText)
			.then(() => notifySuccess(successMessageKey))
			.catch(() => notifyError(failureMessageKey));
	};

	const createCopyHandler = (text, successMessageKey, failureMessageKey) => (event) => {
		event.preventDefault();
		copyLyricText(text, successMessageKey, failureMessageKey);
	};

	const lyricsLineSelectionAnimations = new WeakMap();
	const playLyricsLineSelectionFeedback = (element, isKara, repeatedKey = false) => {
		if (repeatedKey || prefersReducedLyricsMotion()
			|| (isKara && !getVisualSettings()["karaoke-line-transition"])) return;
		const content = element?.firstElementChild;
		if (!content?.animate || content.isConnected === false
			|| !supportsScale()) return;
		// Vocal anchors measure the part wrappers. Animate their contents so the
		// measured centers stay fixed even if a seek triggers an anchor correction.
		const vocalContents = isKara ? content.querySelectorAll?.(
			".lyrics-karaoke-part > .lyrics-vocal-main > .lyrics-karaoke-line, .lyrics-karaoke-part > .lyrics-karaoke-line"
		) : null;
		const targets = vocalContents?.length ? vocalContents : [content];
		for (const target of targets) {
			if (!target?.animate || target.isConnected === false
				|| lyricsLineSelectionAnimations.get(target)?.playState === "running") continue;
			// Add the brief scale to existing text effects without replacing their
			// transform, scale or opacity, or the outer row's scroll animation.
			const animation = target.animate([
				{ offset: 0, scale: "1" },
				{ offset: 0.3, scale: "0.985" },
				{ offset: 1, scale: "1" },
			], { duration: 160, easing: "cubic-bezier(0.2, 0.7, 0.3, 1)", composite: "add", fill: "none" });
			lyricsLineSelectionAnimations.set(target, animation);
			animation.addEventListener("finish", () => {
				if (lyricsLineSelectionAnimations.get(target) === animation) {
					lyricsLineSelectionAnimations.delete(target);
				}
			}, { once: true });
		}
	};

	const selectLine = (seekTime, isKara, event) => {
		if (!Number.isFinite(seekTime)) return;

		clearPlaybackCorrection();
		// Land before the first syllable when Spotify's post-seek fade is compensated.
		const seekFadeCompensation = getVisualSettings()?.["seek-fade-compensation"] === true;
		seek(seekFadeCompensation ? Math.max(0, seekTime - 300) : seekTime);
		playLyricsLineSelectionFeedback(event?.currentTarget, isKara, event?.repeat === true);
	};

	const formatLyricsSeekTitle = (seekTimeMs) => {
		const totalSeconds = Math.max(0, Math.round(seekTimeMs / 1000));
		const time = `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
		return translateSeekTitle("misc.seekToTime", { time }) || time;
	};

	return { createCopyHandler, selectLine, formatLyricsSeekTitle };
}
