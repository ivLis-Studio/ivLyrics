export function createPlaybarButtonStyles(document) {
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
	return { markPlaybarControl, lyricsStyle: style, fullscreenStyle };
}
