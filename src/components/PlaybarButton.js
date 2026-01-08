(function PlaybarButton() {
	if (!Spicetify.Platform.History) {
		setTimeout(PlaybarButton, 300);
		return;
	}

	// ===== 가사 버튼 교체 (기존 기능) =====
	const button = new Spicetify.Playbar.Button(
		"가사 플러스",
		`<svg role="img" height="16" width="16" aria-hidden="true" viewBox="0 0 16 16" data-encore-id="icon" fill="currentColor"><path d="M13.426 2.574a2.831 2.831 0 0 0-4.797 1.55l3.247 3.247a2.831 2.831 0 0 0 1.55-4.797zM10.5 8.118l-2.619-2.62A63303.13 63303.13 0 0 0 4.74 9.075L2.065 12.12a1.287 1.287 0 0 0 1.816 1.816l3.06-2.688 3.56-3.129zM7.12 4.094a4.331 4.331 0 1 1 4.786 4.786l-3.974 3.493-3.06 2.689a2.787 2.787 0 0 1-3.933-3.933l2.676-3.045 3.505-3.99z"></path></svg>`,
		() =>
			Spicetify.Platform.History.location.pathname !== "/ivLyrics"
				? Spicetify.Platform.History.push("/ivLyrics")
				: Spicetify.Platform.History.goBack(),
		false,
		Spicetify.Platform.History.location.pathname === "/ivLyrics",
		false
	);

	const style = document.createElement("style");
	style.innerHTML = `
		.main-nowPlayingBar-lyricsButton {
			display: none !important;
		}
		li[data-id="/ivLyrics"] {
			display: none;
		}
	`;
	style.classList.add("ivLyrics:visual:playbar-button");

	if (Spicetify.LocalStorage.get("ivLyrics:visual:playbar-button") === "true") setPlaybarButton();
	window.addEventListener("ivLyrics", (event) => {
		if (event.detail?.name === "playbar-button") event.detail.value ? setPlaybarButton() : removePlaybarButton();
	});

	Spicetify.Platform.History.listen((location) => {
		button.active = location.pathname === "/ivLyrics";
	});

	function setPlaybarButton() {
		document.head.appendChild(style);
		button.register();
	}

	function removePlaybarButton() {
		style.remove();
		button.deregister();
	}

	// ===== 전체화면 버튼 교체 (새 기능) =====
	// 마지막 파라미터(right)를 true로 설정하여 기존 전체화면 버튼 위치(제일 오른쪽)에 배치
	const fullscreenButton = new Spicetify.Playbar.Button(
		"전체화면",
		`<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path fill-rule="evenodd" clip-rule="evenodd" d="M0.25 3C0.25 2.0335 1.0335 1.25 2 1.25H5.375V2.75H2C1.86193 2.75 1.75 2.86193 1.75 3V5.42857H0.25V3ZM14 2.75H10.625V1.25H14C14.9665 1.25 15.75 2.0335 15.75 3V5.42857H14.25V3C14.25 2.86193 14.1381 2.75 14 2.75ZM1.75 10.5714V13C1.75 13.1381 1.86193 13.25 2 13.25H5.375V14.75H2C1.0335 14.75 0.25 13.9665 0.25 13V10.5714H1.75ZM14.25 13V10.5714H15.75V13C15.75 13.9665 14.9665 14.75 14 14.75H10.625V13.25H14C14.1381 13.25 14.25 13.1381 14.25 13Z" fill="currentColor"></path></svg>`,
		() => {
			// 전체화면 토글 이벤트 발송
			window.dispatchEvent(new CustomEvent("ivLyrics", {
				detail: { type: "fullscreen-toggle" }
			}));
		},
		false,
		false,
		true  // right=true: 오른쪽 그룹에 배치
	);

	const fullscreenStyle = document.createElement("style");
	fullscreenStyle.innerHTML = `
		/* 기존 Spotify 전체화면 버튼 숨기기 */
		button[data-testid="fullscreen-mode-button"] {
			display: none !important;
		}
		/* ivLyrics 전체화면 버튼을 제일 오른쪽에 배치 (flexbox order 사용) */
		.main-nowPlayingBar-extraControls {
			display: flex !important;
		}
		.main-nowPlayingBar-extraControls > .ivlyrics-fullscreen-btn {
			order: 9999 !important;
		}
	`;
	fullscreenStyle.classList.add("ivLyrics:visual:fullscreen-button");

	if (Spicetify.LocalStorage.get("ivLyrics:visual:fullscreen-button") === "true") setFullscreenButton();
	window.addEventListener("ivLyrics", (event) => {
		if (event.detail?.name === "fullscreen-button") event.detail.value ? setFullscreenButton() : removeFullscreenButton();
	});

	function setFullscreenButton() {
		document.head.appendChild(fullscreenStyle);
		fullscreenButton.register();
		// 버튼에 고유 클래스 추가하여 CSS로 위치 조정 가능하게 함
		setTimeout(() => {
			// Spicetify.Playbar.Button의 내부 element 속성 사용 시도
			if (fullscreenButton.element) {
				fullscreenButton.element.classList.add('ivlyrics-fullscreen-btn');
			} else {
				// fallback: SVG 내용으로 버튼 찾기
				const btns = document.querySelectorAll('.main-nowPlayingBar-extraControls button');
				for (const btn of btns) {
					// 전체화면 SVG의 특징적인 path를 찾음 (d 속성에 "M0.25 3C0.25" 포함)
					const path = btn.querySelector('svg path');
					if (path && path.getAttribute('d')?.includes('M0.25 3C0.25')) {
						btn.classList.add('ivlyrics-fullscreen-btn');
						break;
					}
				}
			}
		}, 100);
	}

	function removeFullscreenButton() {
		fullscreenStyle.remove();
		fullscreenButton.deregister();
	}
})();