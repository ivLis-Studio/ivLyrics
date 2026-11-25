function translateHelperMessage(message, translate) {
    if (!message) return null;

    // cookies.txt 파일 관련 메시지
    if (message.includes("Trying with cookies.txt")) {
        return translate("videoBackground.tryingCookiesFile");
    }
    if (message.includes("Checking video with cookies.txt")) {
        return translate("videoBackground.checkingWithCookiesFile");
    }

    // 브라우저 쿠키 관련 메시지
    const tryingBrowserMatch = message.match(/Trying with (\w+) cookies/);
    if (tryingBrowserMatch) {
        return translate("videoBackground.tryingBrowserCookies", { browser: tryingBrowserMatch[1] });
    }
    const checkingBrowserMatch = message.match(/Checking video with (\w+) cookies/);
    if (checkingBrowserMatch) {
        return translate("videoBackground.checkingWithBrowserCookies", { browser: checkingBrowserMatch[1] });
    }

    // 일반 확인 메시지
    if (message.includes("Checking video availability")) {
        return translate("videoBackground.checkingAvailability");
    }

    // 연령 제한 관련 에러 메시지
    if (message.includes("Age-restricted") || message.includes("age-restricted")) {
        if (message.includes("No cookies.txt or supported browsers")) {
            return translate("videoBackground.ageRestrictedNoCookies");
        }
        return translate("videoBackground.ageRestrictedFailed");
    }

    // 이미 다운로드된 영상
    if (message.includes("Video already downloaded") || message.includes("Video already available")) {
        return translate("videoBackground.videoAlreadyDownloaded");
    }

    // 다운로드 중 메시지 (퍼센트 추출)
    const downloadingMatch = message.match(/Downloading:\s*([\d.]+)%/);
    if (downloadingMatch) {
        return translate("videoBackground.downloading", { percent: Math.round(parseFloat(downloadingMatch[1])) });
    }

    // 기본값: 원본 메시지 반환
    return message;
}

export function startHelperBackgroundDownload({
    videoId, videoHelper, translate, setHelperVideoUrl, setIsPlayerReady, setHelperStatus,
    reportVideoBackgroundStatus, showVideoBackgroundError, debug,
    isCurrent = () => true, schedule = setTimeout, cancel = clearTimeout,
}) {
    let isActive = true;
    const wanted = () => isActive && isCurrent();
    let abortDownload = null;

    // 이전 상태 초기화
    setHelperVideoUrl(null);
    setIsPlayerReady(false);

    setHelperStatus("checking");
    reportVideoBackgroundStatus("loading", {
        label: translate("settings.videoBackground.label") || translate("videoBackground.loading"),
        description: translate("videoBackground.checking"),
    });

    debug(`[VideoBackground] Helper mode: requesting video ${videoId}`);

    // 응답이 늦어질 때 알약의 메시지를 준비 중 상태로 갱신합니다.
    const preparingToastTimeout = schedule(() => {
        if (!wanted()) return;
        reportVideoBackgroundStatus("loading", {
            label: translate("videoBackground.preparing"),
            description: translate("videoBackground.preparing"),
        });
    }, 1500);
    const finish = () => {
        if (!isActive) return false;
        isActive = false;
        cancel(preparingToastTimeout);
        return true;
    };

    // 먼저 비디오 상태 확인
    const requestVideo = async () => {
        try {
            // 헬퍼 서버 연결 확인
            const isAvailable = await videoHelper.isHelperAvailable();
            if (!wanted()) return;
            if (!isAvailable) {
                finish();
                setHelperStatus("not-connected");
                showVideoBackgroundError(translate("videoBackground.helperNotConnected"));
                return;
            }

            // 비디오 요청 (SSE 스트림)
            abortDownload = videoHelper.requestVideo(videoId, {
                onProgress: (progress) => {
                    if (!wanted()) return;
                    if (progress?.status === "downloading") setHelperStatus("downloading");
                    else if (progress?.status === "processing") setHelperStatus("processing");
                    else if (progress?.status === "checking") setHelperStatus("checking");
                    // progress 이벤트가 오면 preparing timeout 취소
                    cancel(preparingToastTimeout);

                    const percent = Math.round(progress.percent || 0);
                    const translatedMsg = translateHelperMessage(progress.message, translate);

                    if (progress.status === "downloading") {
                        const message = translate("videoBackground.downloading", { percent });
                        reportVideoBackgroundStatus("loading", {
                            label: message,
                            description: message,
                        });
                    } else if (progress.status === "processing") {
                        const message = translate("videoBackground.processing");
                        reportVideoBackgroundStatus("loading", {
                            label: message,
                            description: message,
                        });
                    } else if (progress.status === "checking") {
                        // checking 상태일 때 메시지가 있으면 번역된 메시지 사용
                        const checkingMsg = translatedMsg || translate("videoBackground.checking");
                        reportVideoBackgroundStatus("loading", {
                            label: checkingMsg,
                            description: checkingMsg,
                        });
                    }
                },
                onComplete: (url) => {
                    if (!wanted() || !finish()) return;
                    debug(`[VideoBackground] Helper: video ready, setting URL: ${url}`);

                    // URL 유효성 확인
                    if (!url || typeof url !== 'string' || !url.startsWith('http')) {
                        setHelperStatus("error");
                        console.error(`[VideoBackground] Invalid video URL received: ${url}`);
                        showVideoBackgroundError(translate("videoBackground.helperError"));
                        return;
                    }

                    setHelperStatus("ready");
                    setHelperVideoUrl(url);
                    const message = translate("videoBackground.processing");
                    reportVideoBackgroundStatus("loading", {
                        label: message,
                        description: message,
                    });
                },
                onError: (message) => {
                    if (!wanted() || !finish()) return;
                    setHelperStatus("error");
                    console.error(`[VideoBackground] Helper error: ${message}`);

                    // 에러 메시지 번역
                    const translatedError = translateHelperMessage(message, translate) || translate("videoBackground.helperError");
                    showVideoBackgroundError(translatedError);
                },
            });
        } catch (e) {
            if (!wanted() || !finish()) return;
            setHelperStatus("error");
            console.error("[VideoBackground] Helper request failed:", e);
            showVideoBackgroundError(translate("videoBackground.helperError"));
        }
    };

    requestVideo();

    return () => {
        if (finish()) abortDownload?.();
    };
}
