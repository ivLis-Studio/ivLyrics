// GlobalShortcuts.js - Spotify 전역에서 작동하는 단축키
// subfiles_extension으로 로드되어 페이지에 구애받지 않고 작동

(function GlobalShortcuts() {
    const MODULE_KEY = "__ivLyricsGlobalShortcuts";
    const moduleState = window[MODULE_KEY] || (window[MODULE_KEY] = {
        initialized: false,
        waitTimer: null,
        waitTimeout: null,
        historyUnlisten: null,
        fullscreenClosedHandler: null,
        ivLyricsHandler: null,
        storageHandler: null,
        focusHandler: null,
        visibilityHandler: null
    });

    if (moduleState.initialized) {
        return;
    }

    // 설정 키 (개별 설정은 직접 키 이름으로 저장됨)
    const FULLSCREEN_KEY_SETTING = "ivLyrics:visual:fullscreen-key";
    const DEFAULT_KEY = "f12";

    // 전체화면 모드 내에서 작동하는 단축키 설정 키
    const TOGGLE_TV_MODE_KEY = "ivLyrics:visual:toggle-tv-mode-key";
    const DEFAULT_TOGGLE_TV_KEY = "t";

    const getStoredValue = (key) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.getItem(key)
        : Spicetify.LocalStorage.get(key);
    const setStoredValue = (key, value) => window.ivLyricsStoragePersistence
        ? window.ivLyricsStoragePersistence.setItem(key, value)
        : Spicetify.LocalStorage.set(key, value);

    // 전체화면 단축키 가져오기
    const getFullscreenKey = () => {
        try {
            const stored = getStoredValue(FULLSCREEN_KEY_SETTING);
            return stored || DEFAULT_KEY;
        } catch (e) {
            return DEFAULT_KEY;
        }
    };

    // TV 모드 전환 단축키 가져오기
    const getToggleTvKey = () => {
        try {
            const stored = getStoredValue(TOGGLE_TV_MODE_KEY);
            return stored || DEFAULT_TOGGLE_TV_KEY;
        } catch (e) {
            return DEFAULT_TOGGLE_TV_KEY;
        }
    };

    // 현재 ivLyrics 페이지에 있는지 확인
    const isOnLyricsPage = () => {
        const pathname = Spicetify.Platform?.History?.location?.pathname || "";
        return pathname.includes("/ivLyrics");
    };

    // 전체화면 모드인지 확인
    const isInFullscreenMode = () => {
        // 1. lyricContainer의 state 확인 (가장 정확)
        if (window.lyricContainer?.state?.isFullscreen) {
            return true;
        }
        // 2. fullscreen-container가 body에 있는지 확인
        if (document.getElementById('lyrics-fullscreen-container')) {
            return true;
        }
        // 3. fullscreen-active 클래스 확인 (fallback)
        const container = document.querySelector('.lyrics-lyricsContainer-LyricsContainer.fullscreen-active');
        return !!container;
    };

    // 전역 Mousetrap 인스턴스
    let globalMousetrap = null;
    let currentBoundKey = null;
    let currentToggleTvKey = null;

    // 전체화면 진입 전 페이지 저장 (GlobalShortcuts를 통해 진입한 경우만)
    let previousPathBeforeFullscreen = null;

    // 전체화면 토글 함수 (LyricsContainer가 있으면 해당 메서드 사용, 없으면 직접 처리)
    const toggleFullscreen = () => {
        // 현재 ivLyrics 페이지에 있고 lyricContainer가 준비되어 있으면 바로 토글
        if (isOnLyricsPage() && window.lyricContainer && typeof window.lyricContainer.toggleFullscreen === 'function') {
            window.lyricContainer.toggleFullscreen();
            return;
        }

        // ivLyrics 페이지가 아니거나 lyricContainer가 없으면 페이지 이동 후 전체화면
        const currentPath = Spicetify.Platform?.History?.location?.pathname || "";
        if (!currentPath.includes("/ivLyrics")) {
            previousPathBeforeFullscreen = currentPath;
            window._ivLyricsPreviousPath = currentPath;
        }

        // ivLyrics 페이지로 이동
        if (!isOnLyricsPage()) {
            Spicetify.Platform?.History?.push?.("/ivLyrics");
        }

        // lyricContainer가 준비될 때까지 대기 후 전체화면 토글
        let retryCount = 0;
        const maxRetries = 20; // 최대 2초 대기 (100ms * 20)

        const waitAndToggle = () => {
            retryCount++;

            if (window.lyricContainer && typeof window.lyricContainer.toggleFullscreen === 'function') {
                // lyricContainer가 준비됨 - 전체화면 토글
                window.lyricContainer.toggleFullscreen();
            } else if (retryCount < maxRetries) {
                // 아직 준비되지 않음 - 재시도
                setTimeout(waitAndToggle, 100);
            } else {
                console.warn("[ivLyrics] Failed to toggle fullscreen - lyricContainer not ready after retries");
            }
        };

        // 첫 시도는 약간의 딜레이 후 시작 (페이지 이동 시간 고려)
        setTimeout(waitAndToggle, 200);
    };

    // TV 모드 토글 함수 (전체화면 모드에서만 작동)
    const toggleTvMode = () => {
        if (!isInFullscreenMode()) {
            console.debug("[ivLyrics] TV mode toggle ignored - not in fullscreen mode");
            return;
        }

        // TV 모드 설정 토글
        const currentValue = getStoredValue("ivLyrics:visual:fullscreen-tv-mode") === "true";
        const newValue = !currentValue;

        console.debug("[ivLyrics] Toggling TV mode:", currentValue, "->", newValue);

        setStoredValue("ivLyrics:visual:fullscreen-tv-mode", newValue.toString());

        // CONFIG 업데이트 (있으면)
        if (typeof window.CONFIG !== 'undefined' && window.CONFIG.visual) {
            window.CONFIG.visual["fullscreen-tv-mode"] = newValue;
        }

        // 이벤트 발생하여 UI 업데이트
        window.dispatchEvent(new CustomEvent("ivLyrics", {
            detail: { name: "fullscreen-tv-mode", value: newValue }
        }));

        // lyricContainer가 있으면 forceUpdate 호출
        if (window.lyricContainer && typeof window.lyricContainer.forceUpdate === 'function') {
            window.lyricContainer.forceUpdate();
        }

        // 컨테이너 클래스 업데이트 (fullscreen-container 내부의 컨테이너 찾기)
        const fullscreenContainer = document.getElementById('lyrics-fullscreen-container');
        const container = fullscreenContainer?.querySelector('.lyrics-lyricsContainer-LyricsContainer')
            || document.querySelector('.lyrics-lyricsContainer-LyricsContainer.fullscreen-active');
        if (container) {
            if (newValue) {
                container.classList.add('tv-mode-active');
            } else {
                container.classList.remove('tv-mode-active');
            }
        }
    };

    // 전체화면 종료 시 이전 페이지로 돌아가기
    const goBackToPreviousPage = () => {
        if (previousPathBeforeFullscreen) {
            Spicetify.Platform?.History?.push?.(previousPathBeforeFullscreen);
            previousPathBeforeFullscreen = null;
            window._ivLyricsPreviousPath = null;
        }
    };

    // 입력 필드 체크
    const isInputFocused = () => {
        const activeElement = document.activeElement;
        const tagName = activeElement?.tagName?.toLowerCase();
        const isEditable = activeElement?.isContentEditable;
        return tagName === 'input' || tagName === 'textarea' || tagName === 'select' || isEditable;
    };

    // 단축키 바인딩 업데이트
    const updateKeyBinding = () => {
        if (!globalMousetrap) return;

        const newKey = getFullscreenKey();

        // 기존 바인딩이 있으면 먼저 해제
        if (currentBoundKey) {
            globalMousetrap.unbind(currentBoundKey);
            currentBoundKey = null;
        }

        // 새 키 바인딩
        if (newKey) {
            globalMousetrap.bind(newKey, (e) => {
                if (isInputFocused()) return;
                e.preventDefault();
                toggleFullscreen();
            });
            currentBoundKey = newKey;
        }
    };

    // TV 모드 단축키 바인딩 업데이트
    const updateTvModeKey = () => {
        if (!globalMousetrap) return;

        const newToggleTvKey = getToggleTvKey();

        // 기존 바인딩 해제
        if (currentToggleTvKey) {
            globalMousetrap.unbind(currentToggleTvKey);
            currentToggleTvKey = null;
        }

        // TV 모드 전환 키 (전체화면 모드에서만 작동)
        if (newToggleTvKey) {
            globalMousetrap.bind(newToggleTvKey, (e) => {
                if (isInputFocused()) return;
                if (!isInFullscreenMode()) return;

                e.preventDefault();
                toggleTvMode();
            });
            currentToggleTvKey = newToggleTvKey;
        }
    };

    const syncBindingsAndState = () => {
        updateKeyBinding();
        updateTvModeKey();
        cleanupOrphanedFullscreenContainer();
    };

    // fullscreen container 정리 함수 (ivLyrics 페이지 아닐 때 container가 남아있으면 삭제)
    const cleanupOrphanedFullscreenContainer = () => {
        // ivLyrics 페이지가 아닌데 fullscreen container가 남아있으면 삭제
        if (!isOnLyricsPage()) {
            const fullscreenContainer = document.getElementById('lyrics-fullscreen-container');
            if (fullscreenContainer) {
                console.debug("[ivLyrics] Cleaning up orphaned fullscreen container (not on ivLyrics page)");

                // body에서 fullscreen 관련 클래스 제거
                document.body.classList.remove('ivlyrics-fullscreen-active');

                // container 삭제
                fullscreenContainer.remove();

                // 상태 초기화
                if (window.lyricContainer?.state) {
                    window.lyricContainer.state.isFullscreen = false;
                }

                // 전체화면 종료 이벤트 발생 (이전 페이지로 돌아가기 위해)
                window.dispatchEvent(new CustomEvent("ivLyrics:fullscreen-closed"));

                return true; // 정리됨
            }
        }
        return false; // 정리할 것 없음
    };

    // 초기화
    const init = () => {
        // Mousetrap이 준비될 때까지 대기
        if (!Spicetify.Mousetrap) {
            setTimeout(init, 300);
            return;
        }

        moduleState.initialized = true;
        if (moduleState.waitTimer) {
            clearInterval(moduleState.waitTimer);
            moduleState.waitTimer = null;
        }
        if (moduleState.waitTimeout) {
            clearTimeout(moduleState.waitTimeout);
            moduleState.waitTimeout = null;
        }

        // 전역 Mousetrap 인스턴스 생성
        globalMousetrap = new Spicetify.Mousetrap(document);

        // 초기 바인딩
        updateKeyBinding();
        updateTvModeKey();

        // 페이지 이동 감지하여 orphaned fullscreen container 정리
        // Spicetify History 이벤트 리스너 등록
        if (Spicetify.Platform?.History) {
            const unlisten = Spicetify.Platform.History.listen(() => {
                // 페이지 이동 시 약간의 딜레이 후 체크 (DOM 업데이트 대기)
                setTimeout(() => {
                    cleanupOrphanedFullscreenContainer();
                }, 100);
            });
            moduleState.historyUnlisten = typeof unlisten === "function" ? unlisten : null;
        }

        // 초기 로드 시에도 체크 (이전에 fullscreen이 남아있는 경우를 위해)
        setTimeout(() => {
            cleanupOrphanedFullscreenContainer();
        }, 500);

        moduleState.fullscreenClosedHandler = () => {
            goBackToPreviousPage();
        };
        window.addEventListener("ivLyrics:fullscreen-closed", moduleState.fullscreenClosedHandler);

        // 설정 변경 감지
        moduleState.ivLyricsHandler = (event) => {
            if (event.detail?.name === "fullscreen-key") {
                updateKeyBinding();
            }
            if (event.detail?.name === "toggle-tv-mode-key") {
                updateTvModeKey();
            }
            // PlaybarButton에서 전체화면 버튼 클릭 시 발생하는 이벤트 처리
            if (event.detail?.type === "fullscreen-toggle") {
                toggleFullscreen();
            }
        };
        window.addEventListener("ivLyrics", moduleState.ivLyricsHandler);

        moduleState.storageHandler = (event) => {
            if (event.key === FULLSCREEN_KEY_SETTING || event.key === TOGGLE_TV_MODE_KEY || event.key === null) {
                syncBindingsAndState();
            }
        };
        window.addEventListener("storage", moduleState.storageHandler);

        moduleState.focusHandler = () => {
            syncBindingsAndState();
        };
        window.addEventListener("focus", moduleState.focusHandler);

        moduleState.visibilityHandler = () => {
            if (document.visibilityState === "visible") {
                syncBindingsAndState();
            }
        };
        document.addEventListener("visibilitychange", moduleState.visibilityHandler);

        console.debug("[ivLyrics] Global shortcuts initialized");
    };

    // Spicetify가 준비되면 초기화
    if (Spicetify.Platform && Spicetify.LocalStorage && Spicetify.Mousetrap) {
        init();
    } else {
        // Spicetify가 준비될 때까지 대기
        if (!moduleState.waitTimer) {
            moduleState.waitTimer = setInterval(() => {
                if (Spicetify.Platform && Spicetify.LocalStorage && Spicetify.Mousetrap) {
                    clearInterval(moduleState.waitTimer);
                    moduleState.waitTimer = null;
                    init();
                }
            }, 100);
        }

        // 10초 이내에 준비되지 않으면 포기
        if (!moduleState.waitTimeout) {
            moduleState.waitTimeout = setTimeout(() => {
                if (moduleState.waitTimer) {
                    clearInterval(moduleState.waitTimer);
                    moduleState.waitTimer = null;
                }
            }, 10000);
        }
    }
})();
