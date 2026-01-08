/**
 * VideoHelperService - 로컬 헬퍼 프로그램과 통신하는 서비스
 * 
 * 헬퍼 프로그램은 YouTube 영상을 다운로드하여 로컬에서 제공합니다.
 * API 엔드포인트: localhost:15123
 */

const VideoHelperService = (() => {
  const BASE_URL = "http://localhost:15123";
  const DOWNLOAD_URL = "https://ivlis.kr/ivLyrics/extensions/#helper";

  // 연결 상태
  let isConnected = false;
  let lastHealthCheck = 0;
  const HEALTH_CHECK_INTERVAL = 30000; // 30초

  /**
   * 헬퍼 서버 상태 확인
   * @returns {Promise<boolean>} 연결 여부
   */
  const checkHealth = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`${BASE_URL}/health`, {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      isConnected = response.ok && (await response.text()) === "OK";
      lastHealthCheck = Date.now();
      return isConnected;
    } catch (e) {
      isConnected = false;
      lastHealthCheck = Date.now();
      return false;
    }
  };

  /**
   * 캐시된 연결 상태 반환 (일정 시간 이내면 캐시 사용)
   * @returns {Promise<boolean>}
   */
  const isHelperAvailable = async () => {
    if (Date.now() - lastHealthCheck < HEALTH_CHECK_INTERVAL) {
      return isConnected;
    }
    return await checkHealth();
  };

  /**
   * 비디오 상태 확인 (단순 조회)
   * @param {string} videoId - YouTube 비디오 ID
   * @returns {Promise<{success: boolean, url: string|null, message: string}>}
   */
  const getVideoStatus = async (videoId) => {
    if (!videoId) {
      return { success: false, url: null, message: "Invalid video ID" };
    }

    try {
      const response = await fetch(`${BASE_URL}/video/status?id=${encodeURIComponent(videoId)}`);
      const data = await response.json();
      return {
        success: data.success,
        url: data.url,
        message: data.message,
        videoId: data.video_id,
      };
    } catch (e) {
      return { success: false, url: null, message: "Failed to check video status" };
    }
  };

  /**
   * 비디오 요청 (SSE 스트림으로 다운로드 진행 상황 받기)
   * @param {string} videoId - YouTube 비디오 ID
   * @param {object} callbacks - 콜백 함수들
   * @param {function} callbacks.onProgress - 진행 상황 콜백 (percent, speed, eta, message, status)
   * @param {function} callbacks.onComplete - 완료 콜백 (url)
   * @param {function} callbacks.onError - 에러 콜백 (message)
   * @returns {function} abort 함수
   */
  const requestVideo = (videoId, callbacks = {}) => {
    const { onProgress, onComplete, onError } = callbacks;
    let aborted = false;

    if (!videoId) {
      onError?.("Invalid video ID");
      return () => { };
    }

    const controller = new AbortController();

    const fetchVideo = async () => {
      try {
        const response = await fetch(`${BASE_URL}/video/request?id=${encodeURIComponent(videoId)}`, {
          signal: controller.signal,
        });

        const contentType = response.headers.get("content-type") || "";

        // JSON 응답 (이미 존재하는 경우)
        if (contentType.includes("application/json")) {
          const data = await response.json();
          if (aborted) return;

          if (data.success) {
            onComplete?.(data.url);
          } else {
            onError?.(data.message || "Video request failed");
          }
          return;
        }

        // SSE 스트림 (다운로드 진행 중)
        if (contentType.includes("text/event-stream")) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          let pendingData = null; // data가 먼저 오고 event가 나중에 오는 형식 대응

          while (true) {
            const { done, value } = await reader.read();
            if (done || aborted) break;

            buffer += decoder.decode(value, { stream: true });

            // 줄 단위로 처리
            const lines = buffer.split("\n");
            buffer = lines.pop() || ""; // 마지막 불완전한 줄은 버퍼에 유지

            for (const line of lines) {
              const trimmedLine = line.trim();

              // 빈 줄이면 이벤트 끝
              if (!trimmedLine) {
                pendingData = null;
                continue;
              }

              // data: 줄 처리 (먼저 옴)
              if (trimmedLine.startsWith("data:")) {
                const dataStr = trimmedLine.slice(5).trim();
                if (!dataStr) continue;

                try {
                  pendingData = JSON.parse(dataStr);
                } catch (e) {
                  pendingData = null;
                }
                continue;
              }

              // event: 줄 처리 (나중에 옴)
              if (trimmedLine.startsWith("event:")) {
                const eventType = trimmedLine.slice(6).trim();

                if (!pendingData) continue;
                const data = pendingData;
                pendingData = null;

                // progress 이벤트
                if (eventType === "progress") {
                  onProgress?.({
                    percent: data.percent || 0,
                    speed: data.speed,
                    eta: data.eta,
                    message: data.message,
                    status: data.status,
                  });
                }
                // complete 이벤트
                else if (eventType === "complete") {
                  // status가 completed이고 message가 URL인 경우에만 완료 처리
                  if (data.status === "completed") {
                    const videoUrl = data.url || data.message;
                    // URL 형식인지 확인 (http로 시작하는 경우만)
                    if (videoUrl && typeof videoUrl === 'string' && videoUrl.startsWith('http')) {
                      console.log("[VideoHelperService] Download complete, URL:", videoUrl);
                      onComplete?.(videoUrl);
                      return;
                    }
                    // "Download completed" 같은 메시지면 다음 이벤트 기다림
                  }
                  // status가 error지만 WARNING 메시지면 무시하고 계속 진행
                  else if (data.status === "error") {
                    const msg = data.message || "";
                    if (msg.startsWith("WARNING")) {
                      console.log("[VideoHelperService] Ignoring warning:", msg);
                      // WARNING은 무시하고 계속 진행
                    } else {
                      // 진짜 에러
                      onError?.(msg || "Download failed");
                      return;
                    }
                  }
                }
                // error 이벤트
                else if (eventType === "error") {
                  onError?.(data.message || "Download failed");
                  return;
                }
              }
            }
          }

          // 스트림이 끝났는데 완료 콜백이 호출되지 않은 경우
          // 버퍼에 남은 데이터 처리
          if (buffer.trim()) {
            const dataMatch = buffer.match(/data:\s*({.*})/);
            if (dataMatch) {
              try {
                const data = JSON.parse(dataMatch[1]);
                if (data.status === "completed") {
                  const videoUrl = data.url || data.message;
                  if (videoUrl && videoUrl.startsWith('http')) {
                    console.log("[VideoHelperService] Final buffer complete, URL:", videoUrl);
                    onComplete?.(videoUrl);
                    return;
                  }
                }
              } catch (e) {
                // ignore
              }
            }
          }
        } else {
          // 알 수 없는 응답 타입
          const text = await response.text();
          if (!aborted) {
            onError?.("Unexpected response: " + text.substring(0, 100));
          }
        }
      } catch (e) {
        if (aborted) return;
        if (e.name === "AbortError") return;
        console.error("[VideoHelperService] Request error:", e);
        onError?.(e.message || "Request failed");
      }
    };

    fetchVideo();

    // abort 함수 반환
    return () => {
      aborted = true;
      controller.abort();
    };
  };

  /**
   * 비디오 파일 URL 생성
   * @param {string} videoId - YouTube 비디오 ID
   * @returns {string} 비디오 파일 URL
   */
  const getVideoFileUrl = (videoId) => {
    return `${BASE_URL}/video/files/${encodeURIComponent(videoId)}.webm`;
  };

  /**
   * 헬퍼 프로그램 다운로드 URL 반환
   * @returns {string}
   */
  const getDownloadUrl = () => {
    return DOWNLOAD_URL;
  };

  /**
   * 헬퍼 프로그램 다운로드 페이지 열기
   */
  const openDownloadPage = () => {
    window.open(DOWNLOAD_URL, "_blank");
  };

  /**
   * YouTube 비디오 ID 추출
   * @param {string} url - YouTube URL 또는 비디오 ID
   * @returns {string|null} 비디오 ID
   */
  const extractVideoId = (url) => {
    if (!url) return null;

    // 이미 비디오 ID인 경우 (11자 영숫자+하이픈+언더스코어)
    if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
      return url;
    }

    // 다양한 YouTube URL 형식 지원
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
      /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }

    return null;
  };

  // 공개 API
  return {
    checkHealth,
    isHelperAvailable,
    getVideoStatus,
    requestVideo,
    getVideoFileUrl,
    getDownloadUrl,
    openDownloadPage,
    extractVideoId,
    get isConnected() {
      return isConnected;
    },
    BASE_URL,
  };
})();

// 전역으로 노출
window.VideoHelperService = VideoHelperService;
