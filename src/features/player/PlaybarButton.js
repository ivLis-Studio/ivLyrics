import { getRuntimeService } from "../../spicetify/runtimeServices.mjs";
import { IVLYRICS_ROUTE, isIvLyricsRoute } from "../../spicetify/lyricsRoute.mjs";
import { readSettingsPersistence } from "../../core/settingsRuntime.mjs";
import { createPlaybarButtonStyles } from "./playbarButtonStyles.mjs";
import { findPlaybarControlContainer, findPlaybarLayout, observePlaybarLayout } from "./playbarLayout.mjs";

const PLAYBAR_MOUNT = Symbol.for("ivLyrics.playbarButtons");
const RETRY_INITIAL_DELAY = 300;
const isEnabledValue = value => value === true || value === "true";

export function mountPlaybarButtons({
	host, document, readSpicetify, readStoredSetting, translate, createEvent, createObserver, scheduleTimer, cancelTimer, warn,
}) {
	const existingMount = host[PLAYBAR_MOUNT];
	if (existingMount) return existingMount;

	const { markPlaybarControl, lyricsStyle, fullscreenStyle } = createPlaybarButtonStyles(document);
	const replacements = [
		{
			name: "playbar-button",
			label: () => translate("playbarButton.label") || "Lyrics Plus",
			icon: `<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" data-encore-id="icon" fill="currentColor"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045 3.505-3.99z"></path></svg>`,
			onClick: () => {
				const history = readSpicetify()?.Platform?.History;
				const path = history?.location?.pathname;
				if (!path) return;
				if (isIvLyricsRoute(path)) history.goBack?.();
				else history.push?.(IVLYRICS_ROUTE);
			},
			style: lyricsStyle,
		},
		{
			name: "fullscreen-button",
			label: () => translate("menu.fullscreen") || "Fullscreen",
			icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.25 3C0.25 2.0335 1.0335 1.25 2 1.25H5.375V2.75H2C1.86193 2.75 1.75 2.86193 1.75 3V5.42857H0.25V3ZM14 2.75H10.625V1.25H14C14.9665 1.25 15.75 2.0335 15.75 3V5.42857H14.25V3C14.25 2.86193 14.1381 2.75 14 2.75ZM1.75 10.5714V13C1.75 13.1381 1.86193 13.25 2 13.25H5.375V14.75H2C1.0335 14.75 0.25 13.9665 0.25 13V10.5714H1.75ZM14.25 13V10.5714H15.75V13C15.75 13.9665 14.9665 14.75 14 14.75H10.625V13.25H14C14.1381 13.25 14.25 13.1381 14.25 13Z" fill="currentColor"></path></svg>`,
			onClick: () => host.dispatchEvent(createEvent("ivLyrics", { type: "fullscreen-toggle" })),
			style: fullscreenStyle,
		},
	];

	let layout = null;
	let controls = null;
	let releaseLayout = null;
	let retry = null;
	let retryDelay = RETRY_INITIAL_DELAY;
	let historySubscription = null;
	let buttonClass = null;
	let disposed = false;

	function restoreNativeButtons() {
		for (const replacement of replacements) replacement.style.remove();
		controls?.classList.remove("ivlyrics-playbar-controls");
	}

	function deregister(replacement) {
		replacement.style.remove();
		if (!replacement.registered) return;
		replacement.registered = false;
		try {
			replacement.button.deregister();
		} catch (error) {
			warn("[ivLyrics] Failed to deregister playbar button:", error);
		} finally {
			replacement.button.element.remove();
		}
	}

	function cancelRetry() {
		if (retry) cancelTimer(retry.timer);
		retry = null;
		retryDelay = RETRY_INITIAL_DELAY;
		for (const replacement of replacements) replacement.retryPending = false;
	}

	function retryDependencies() {
		if (retry) return;
		const pending = { timer: null };
		retry = pending;
		pending.timer = scheduleTimer(() => {
			if (retry !== pending) return;
			retry = null;
			for (const replacement of replacements) replacement.retryPending = false;
			reconcile();
		}, retryDelay);
		retryDelay = Math.min(retryDelay * 2, 2000);
	}

	function updateLayout(refresh) {
		const nextLayout = !refresh && layout?.right?.isConnected ? layout : findPlaybarLayout(document);
		const nextControls = findPlaybarControlContainer(nextLayout.right);
		if (!refresh && releaseLayout && layout?.anchor === nextLayout.anchor && controls === nextControls) return;
		restoreNativeButtons();
		releaseLayout?.();
		layout = nextLayout;
		controls = nextControls;
		releaseLayout = observePlaybarLayout({
			document, createObserver, anchor: layout.anchor, container: controls, onLayoutChange: reconcile,
			hasMissingControl: () => replacements.some(({ enabled, registered, button }) =>
				enabled && registered && button.element.parentElement !== controls
			),
		});
	}

	function releaseHistory() {
		const release = historySubscription?.release;
		historySubscription = null;
		if (typeof release !== "function") return;
		try {
			release();
		} catch (error) {
			warn("[ivLyrics] Failed to release the playbar route listener:", error);
		}
	}

	function updateLyricsButtonActive(pathname) {
		const { button } = replacements[0];
		const onLyricsPage = isIvLyricsRoute(pathname);
		if (button && button.active !== onLyricsPage) button.active = onLyricsPage;
	}

	function bindHistory(history) {
		if (historySubscription?.history === history) return;
		releaseHistory();
		const entry = { history, release: null };
		entry.release = history.listen(change => {
			if (historySubscription !== entry || readSpicetify()?.Platform?.History !== history) return;
			updateLyricsButtonActive(change?.pathname ?? change?.location?.pathname ?? history.location?.pathname);
		});
		historySubscription = entry;
	}

	function suspend() {
		restoreNativeButtons();
		for (const replacement of replacements) {
			deregister(replacement);
			replacement.retryPending = false;
		}
		releaseLayout?.();
		layout = controls = releaseLayout = null;
		releaseHistory();
	}

	function readSettings() {
		for (const replacement of replacements) {
			if (replacement.enabled !== undefined) continue;
			const stored = readStoredSetting(`ivLyrics:visual:${replacement.name}`);
			if (stored === undefined) return false;
			replacement.enabled = isEnabledValue(stored);
		}
		return true;
	}

	function reconcile(refreshLayout = false) {
		if (disposed) return;
		if (!readSettings()) {
			retryDependencies();
			return;
		}

		for (const replacement of replacements) {
			if (!replacement.enabled) deregister(replacement);
		}
		if (!replacements.some((replacement) => replacement.enabled)) {
			suspend();
			cancelRetry();
			return;
		}

		const spicetify = readSpicetify();
		const history = spicetify?.Platform?.History;
		// Widget belongs beside the track title, not in the right-hand controls.
		const Button = spicetify?.Playbar?.Button;
		if (typeof Button !== "function" || typeof history?.location?.pathname !== "string"
			|| typeof history.listen !== "function" || typeof history.push !== "function") {
			if (layout || historySubscription) suspend();
			retryDependencies();
			return;
		}
		if (buttonClass !== Button) {
			for (const replacement of replacements) {
				deregister(replacement);
				replacement.button = null;
				replacement.retryPending = false;
			}
			buttonClass = Button;
		}
		updateLayout(refreshLayout);
		if (!controls) {
			releaseHistory();
			cancelRetry();
			return;
		}
		try {
			bindHistory(history);
		} catch {
			suspend();
			retryDependencies();
			return;
		}

		for (const replacement of replacements) {
			if (!replacement.enabled || replacement.retryPending) continue;
			try {
				if (!replacement.button) {
					// Sixth argument is registerOnCreate, not placement. Both settings own registration.
					replacement.button = new Button(replacement.label(), replacement.icon, replacement.onClick,
						false, replacement === replacements[0] && isIvLyricsRoute(history.location.pathname), false);
					markPlaybarControl(replacement.button);
					if (replacement === replacements[1]) replacement.button.element.classList.add("ivlyrics-fullscreen-btn");
				}
				if (replacement === replacements[0]) updateLyricsButtonActive(history.location.pathname);
				if (!replacement.registered) {
					replacement.registered = true;
					replacement.button.register();
				}
				// Spicetify 2.45.3 caches its first rightContainer. Reuse the public element
				// after a remount without mutating that API or guessing at copied SVG paths.
				const element = replacement.button.element;
				if (element.parentElement !== controls) controls.prepend(element);
				if (element.isConnected && element.parentElement === controls) {
					if (!replacement.style.isConnected) document.head.appendChild(replacement.style);
				}
				replacement.warned = false;
			} catch (error) {
				deregister(replacement);
				if (!replacement.warned) warn(`[ivLyrics] Failed to register ${replacement.name}:`, error);
				replacement.warned = true;
				replacement.retryPending = true;
				retryDependencies();
			}
		}
		controls.classList.toggle("ivlyrics-playbar-controls", fullscreenStyle.isConnected);
		if (!replacements.some((replacement) => replacement.enabled && replacement.retryPending)) cancelRetry();
	}

	function handleSetting(event) {
		const replacement = replacements.find((item) => item.name === event.detail?.name);
		if (!replacement) return;
		const enabled = isEnabledValue(event.detail.value);
		if (enabled !== replacement.enabled) replacement.retryPending = false;
		replacement.enabled = enabled;
		reconcile();
	}
	const onFocus = () => reconcile();

	function dispose() {
		if (disposed) return;
		disposed = true;
		delete host[PLAYBAR_MOUNT];
		host.removeEventListener("ivLyrics", handleSetting);
		host.removeEventListener("focus", onFocus);
		cancelRetry();
		suspend();
	}

	host[PLAYBAR_MOUNT] = dispose;
	host.addEventListener("ivLyrics", handleSetting);
	host.addEventListener("focus", onFocus);
	reconcile();
	return dispose;
}

export default function initializePlaybarButtons() {
	return mountPlaybarButtons({
		host: window, document,
		readSpicetify: () => window.Spicetify,
		readStoredSetting: key => {
			const persistence = readSettingsPersistence(window);
			const storage = window.Spicetify?.LocalStorage;
			if (!persistence && typeof storage?.get !== "function") return undefined;
			return persistence?.getItem(key) ?? storage?.get?.(key) ?? null;
		},
		translate: key => getRuntimeService("I18n", window)?.t(key),
		createEvent: (type, detail) => new CustomEvent(type, { detail }),
		createObserver: callback => new MutationObserver(callback),
		scheduleTimer: (callback, delay) => setTimeout(callback, delay),
		cancelTimer: timer => clearTimeout(timer),
		warn: (...args) => console.warn(...args),
	});
}
