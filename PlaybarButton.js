(function PlaybarButton() {
	// ===== 플레이바 버튼 모양 =====
	// Spotify 1.3부터 플레이바 컨트롤에 main-genericButton-button 클래스가 없어서,
	// Spicetify.Playbar.Button이 스타일 클래스를 복사해 올 형제 버튼을 찾지 못한다.
	// 그 결과 ivLyrics 버튼이 브라우저 기본 버튼(회색 배경과 테두리)으로 남았다.
	// Spotify 기본 플레이바 컨트롤(32px, 투명 배경, 활성 시 초록색과 점)과 같은 모양을 직접 지정한다.
	const PLAYBAR_CONTROL_CLASS = "ivlyrics-playbar-control";
	const PLAYBAR_CONTROL_STYLE_ID = "ivlyrics-playbar-control-style";

	function ensurePlaybarControlStyle() {
		if (document.getElementById(PLAYBAR_CONTROL_STYLE_ID)) return;
		const controlStyle = document.createElement("style");
		controlStyle.id = PLAYBAR_CONTROL_STYLE_ID;
		controlStyle.textContent = `
			button.${PLAYBAR_CONTROL_CLASS} {
				-webkit-appearance: none;
				appearance: none;
				position: relative;
				display: inline-flex;
				align-items: center;
				justify-content: center;
				flex: 0 0 auto;
				box-sizing: border-box;
				width: 32px;
				min-width: 32px;
				height: 32px;
				margin: 0;
				padding: 0;
				border: 0;
				background: transparent;
				box-shadow: none;
				color: rgba(var(--spice-rgb-text, 255, 255, 255), 0.7);
				cursor: pointer;
			}
			button.${PLAYBAR_CONTROL_CLASS} > span {
				display: inline-flex;
				align-items: center;
				justify-content: center;
			}
			button.${PLAYBAR_CONTROL_CLASS} svg {
				display: block;
			}
			button.${PLAYBAR_CONTROL_CLASS}:hover,
			button.${PLAYBAR_CONTROL_CLASS}:focus-visible {
				color: var(--spice-text, #fff);
			}
			button.${PLAYBAR_CONTROL_CLASS}.main-genericButton-buttonActive {
				color: var(--spice-button, #1db954);
			}
			button.${PLAYBAR_CONTROL_CLASS}.main-genericButton-buttonActive:hover,
			button.${PLAYBAR_CONTROL_CLASS}.main-genericButton-buttonActive:focus-visible {
				color: var(--spice-button-active, #1ed760);
			}
			button.${PLAYBAR_CONTROL_CLASS}.main-genericButton-buttonActiveDot::after {
				content: "";
				position: absolute;
				bottom: 0;
				left: 50%;
				width: 4px;
				height: 4px;
				border-radius: 50%;
				background-color: var(--spice-button, #1db954);
				transform: translateX(-50%);
			}
		`;
		document.head.appendChild(controlStyle);
	}

	function markPlaybarControl(control) {
		if (!control?.element?.classList) return;
		ensurePlaybarControlStyle();
		control.element.classList.add(PLAYBAR_CONTROL_CLASS);
	}

	const style = document.createElement("style");
	style.innerHTML = `
		/* Spotify 기본 가사 버튼만 숨김 (data-testid로 명확하게 지정) */
		button[data-testid="lyrics-button"] {
			display: none !important;
		}
		li[data-id="/ivLyrics"] {
			display: none;
		}
	`;
	style.classList.add("ivLyrics:visual:playbar-button");

	const fullscreenStyle = document.createElement("style");
	fullscreenStyle.innerHTML = `
		/* 기존 Spotify 전체화면 버튼 숨기기 */
		button[data-testid="fullscreen-mode-button"] {
			display: none !important;
		}
		/* ivLyrics 전체화면 버튼을 제일 오른쪽에 배치 (flexbox order 사용) */
		.ivlyrics-playbar-controls {
			display: flex !important;
		}
		.ivlyrics-playbar-controls > .ivlyrics-fullscreen-btn {
			order: 9999 !important;
		}
	`;
	fullscreenStyle.classList.add("ivLyrics:visual:fullscreen-button");

	const replacements = [
		{
			name: "playbar-button",
			label: () => window.I18n?.t("playbarButton.label") || "Lyrics Plus",
			icon: `<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" data-encore-id="icon" fill="currentColor"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045 3.505-3.99z"></path></svg>`,
			onClick: () => {
				const history = window.Spicetify.Platform.History;
				history.location.pathname !== "/ivLyrics" ? history.push("/ivLyrics") : history.goBack();
			},
			style,
		},
		{
			name: "fullscreen-button",
			label: () => window.I18n?.t("menu.fullscreen") || "Fullscreen",
			icon: `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.25 3C0.25 2.0335 1.0335 1.25 2 1.25H5.375V2.75H2C1.86193 2.75 1.75 2.86193 1.75 3V5.42857H0.25V3ZM14 2.75H10.625V1.25H14C14.9665 1.25 15.75 2.0335 15.75 3V5.42857H14.25V3C14.25 2.86193 14.1381 2.75 14 2.75ZM1.75 10.5714V13C1.75 13.1381 1.86193 13.25 2 13.25H5.375V14.75H2C1.0335 14.75 0.25 13.9665 0.25 13V10.5714H1.75ZM14.25 13V10.5714H15.75V13C15.75 13.9665 14.9665 14.75 14 14.75H10.625V13.25H14C14.1381 13.25 14.25 13.1381 14.25 13Z" fill="currentColor"></path></svg>`,
			onClick: () => window.dispatchEvent(new CustomEvent("ivLyrics", { detail: { type: "fullscreen-toggle" } })),
			style: fullscreenStyle,
		},
	];
	for (const replacement of replacements) {
		replacement.enabled = window.Spicetify?.LocalStorage?.get(`ivLyrics:visual:${replacement.name}`) === "true";
	}

	// Spicetify maps Spotify's right-hand bar column to main-nowPlayingBar-right,
	// but Spotify 1.3.6 renamed it and Spicetify 2.46.x has no mapping, so that
	// class (and Spicetify.Playbar.Button's own container lookup) finds nothing.
	// Fall back to Spotify's stable test ids: player-controls is the centre
	// column of the bar's three-column row, and the last column is the right side.
	const LEGACY_ROOT_SELECTOR = ".main-nowPlayingBar-right";
	const PLAYER_CONTROLS_SELECTOR = '[data-testid="now-playing-bar"] [data-testid="player-controls"]';
	const ROOT_SELECTOR = `${LEGACY_ROOT_SELECTOR}, ${PLAYER_CONTROLS_SELECTOR}`;

	function findPlaybarRoot() {
		const legacyRoot = document.querySelector(LEGACY_ROOT_SELECTOR);
		if (legacyRoot) return legacyRoot;
		const centerColumn = document.querySelector(PLAYER_CONTROLS_SELECTOR)?.parentElement;
		const row = centerColumn?.parentElement;
		const rightColumn = row?.children?.[row.children.length - 1];
		return rightColumn && rightColumn !== centerColumn ? rightColumn : null;
	}

	let playbarRoot = null;
	let controls = null;
	let observer = null;
	let retryTimer = null;
	let retryDelay = 300;
	let historyUnlisten = null;
	let listeningHistory = null;

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
			console.warn("[ivLyrics] Failed to deregister playbar button:", error);
		} finally {
			replacement.button.element.remove();
		}
	}

	function retryDependencies() {
		if (retryTimer !== null) return;
		retryTimer = setTimeout(() => {
			retryTimer = null;
			reconcile();
		}, retryDelay);
		retryDelay = Math.min(retryDelay * 2, 2000);
	}

	function observeControls(root, container) {
		observer?.disconnect();
		playbarRoot = root;
		controls = container;
		const ancestors = [];
		observer = new MutationObserver((records) => {
			if (!playbarRoot) {
				// Bootstrap only: inspect added subtrees instead of searching the document
				// for every lyric/clock mutation. The broad observer ends once the bar exists.
				if (records.some((record) => Array.from(record.addedNodes).some((node) =>
					node.nodeType === 1 && (node.matches(ROOT_SELECTOR) || node.querySelector(ROOT_SELECTOR))
				))) reconcile();
				return;
			}
			const moved = ancestors.some((node, index) => node.parentElement !== (ancestors[index + 1] || null));
			if (moved || !playbarRoot.isConnected || records.some((record) => record.target === playbarRoot)
				|| replacements.some((replacement) => replacement.enabled && replacement.registered && replacement.button
					&& replacement.button.element.parentElement !== controls)) {
				restoreNativeButtons();
				reconcile(moved);
			}
		});
		if (!root) {
			observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
			return;
		}
		if (container) observer.observe(container, { childList: true });
		// Watch the bar and its ancestor child lists, not the entire Spotify subtree.
		// This also detects a replaced footer or layout wrapper containing the bar.
		for (let node = root; node; node = node.parentElement) {
			ancestors.push(node);
			observer.observe(node, { childList: true });
		}
	}

	function reconcile(refreshObserver = false) {
		for (const replacement of replacements) {
			if (!replacement.enabled) deregister(replacement);
		}
		if (!replacements.some((replacement) => replacement.enabled)) {
			restoreNativeButtons();
			observer?.disconnect();
			observer = null;
			playbarRoot = controls = null;
			if (retryTimer !== null) clearTimeout(retryTimer);
			retryTimer = null;
			retryDelay = 300;
			historyUnlisten?.();
			historyUnlisten = listeningHistory = null;
			return;
		}

		const history = window.Spicetify?.Platform?.History;
		// Widget belongs beside the track title, not in the right-hand controls.
		const Button = window.Spicetify?.Playbar?.Button;
		if (!history || typeof Button !== "function") {
			restoreNativeButtons();
			retryDependencies(); // Readiness checks only; no repeated global DOM queries.
			return;
		}
		if (retryTimer !== null) clearTimeout(retryTimer);
		retryTimer = null;

		const root = playbarRoot?.isConnected ? playbarRoot : findPlaybarRoot();
		const container = root && Array.from(root.children).find((node) => node.tagName === "DIV");
		if (refreshObserver || !observer || root !== playbarRoot || container !== controls) {
			restoreNativeButtons();
			observeControls(root, container);
		}
		if (!container) return;

		if (listeningHistory !== history) {
			historyUnlisten?.();
			listeningHistory = history;
			historyUnlisten = history.listen((location) => {
				if (replacements[0].button) replacements[0].button.active = location.pathname === "/ivLyrics";
			});
		}
		for (const replacement of replacements) {
			if (!replacement.enabled) continue;
			try {
				if (!replacement.button) {
					// Sixth argument is registerOnCreate, not placement. Both settings own registration.
					replacement.button = new Button(replacement.label(), replacement.icon, replacement.onClick,
						false, replacement === replacements[0] && history.location.pathname === "/ivLyrics", false);
					markPlaybarControl(replacement.button);
					if (replacement === replacements[1]) replacement.button.element.classList.add("ivlyrics-fullscreen-btn");
				}
				if (replacement === replacements[0]) replacement.button.active = history.location.pathname === "/ivLyrics";
				if (!replacement.registered) {
					replacement.registered = true;
					replacement.button.register();
				}
				// Spicetify 2.45.3 caches its first rightContainer. Reuse the public element
				// after a remount without mutating that API or guessing at copied SVG paths.
				const element = replacement.button.element;
				if (element.parentElement !== container) container.prepend(element);
				if (element.isConnected && element.parentElement === container) {
					if (!replacement.style.isConnected) document.head.appendChild(replacement.style);
				}
				replacement.warned = false;
			} catch (error) {
				deregister(replacement);
				if (!replacement.warned) console.warn(`[ivLyrics] Failed to register ${replacement.name}:`, error);
				replacement.warned = true;
				retryDependencies();
			}
		}
		controls.classList.toggle("ivlyrics-playbar-controls", fullscreenStyle.isConnected);
	}

	window.addEventListener("ivLyrics", (event) => {
		const replacement = replacements.find((item) => item.name === event.detail?.name);
		if (!replacement) return;
		replacement.enabled = event.detail.value === true || event.detail.value === "true";
		reconcile();
	});
	reconcile();
})();
