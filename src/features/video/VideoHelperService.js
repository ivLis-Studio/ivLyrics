/**
 * VideoHelperService - 로컬 헬퍼 프로그램과 통신하는 서비스
 *
 * 헬퍼 프로그램은 YouTube 영상을 다운로드하여 로컬에서 제공합니다.
 * API 엔드포인트: localhost:15123
 */

import { readHelperVideoUrl } from "./helperVideoResponse.mjs";

export function createVideoHelperService({ host: window, request }) {
  const BASE_URL = "http://localhost:15123";
  const DOWNLOAD_URL = "https://ivlis.kr/ivLyrics/extensions/#helper";

  // 연결 상태
  let isConnected = false;
  let lastHealthCheck = -Infinity;
  const HEALTH_CHECK_INTERVAL = 30000; // 30초
  let pendingHealthCheck = null;

  /**
   * 헬퍼 서버 상태 확인
   * @returns {Promise<boolean>} 연결 여부
   */
  const checkHealth = () => {
    if (pendingHealthCheck) return pendingHealthCheck;
    pendingHealthCheck = (async () => {
      try {
        const response = await request(`${BASE_URL}/health`, {
          signal: AbortSignal.timeout(3000),
        });
        isConnected = response.ok && (await response.text()) === "OK";
      } catch {
        isConnected = false;
      }
      lastHealthCheck = Date.now();
      return isConnected;
    })().finally(() => { pendingHealthCheck = null; });
    return pendingHealthCheck;
  };

  /** Reuse the current check, or a recent response, for background callers. */
  const isHelperAvailable = () => pendingHealthCheck
    || (Date.now() - lastHealthCheck < HEALTH_CHECK_INTERVAL ? Promise.resolve(isConnected) : checkHealth());

  /**
   * 비디오 상태 확인 (단순 조회)
   * @param {string} videoId - YouTube 비디오 ID
   * @returns {Promise<{success: boolean, url: string|null, message: string}>}
   */
  const getVideoStatus = async (videoId, signal) => {
    if (!videoId) {
      return { success: false, url: null, message: "Invalid video ID" };
    }

    try {
      const timeout = AbortSignal.timeout(3000);
      const response = await request(`${BASE_URL}/video/status?id=${encodeURIComponent(videoId)}`, {
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
      const data = await response.json();
      return {
        success: response.ok && data.success,
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
  const videoRequests = new Map();

  function notifySubscriber(subscriber, event, value) {
    try {
      subscriber.callbacks[event]?.(value);
    } catch (error) {
      console.error("[VideoHelperService] Callback failed:", error);
    }
  }

  function notifySubscribers(job, event, value) {
    for (const subscriber of [...job.subscribers]) {
      if (job.subscribers.has(subscriber)) notifySubscriber(subscriber, event, value);
    }
  }

  function startVideoRequest(videoId, job) {
    const { signal } = job.controller;
    async function fetchVideo() {
      const response = await request(`${BASE_URL}/video/request?id=${encodeURIComponent(videoId)}`, { signal });
      signal.throwIfAborted();
      return readHelperVideoUrl(response, {
        signal,
        onProgress(progress) {
          if (signal.aborted) return;
          job.lastProgress = progress;
          notifySubscribers(job, "onProgress", progress);
        },
        readCachedVideo: () => getVideoStatus(videoId, signal),
      });
    }

    function finish(event, value) {
      if (videoRequests.get(videoId) !== job) return;
      videoRequests.delete(videoId);
      notifySubscribers(job, event, value);
      job.subscribers.clear();
    }

    fetchVideo().then(
      url => finish("onComplete", url),
      error => {
        if (signal.aborted) return;
        console.error("[VideoHelperService] Request error:", error);
        finish("onError", error?.message || "Request failed");
      },
    );
  }

  const requestVideo = (videoId, callbacks = {}) => {
    if (!videoId) {
      callbacks.onError?.("Invalid video ID");
      return () => {};
    }

    const subscriber = { callbacks };
    let job = videoRequests.get(videoId);
    if (job) {
      job.subscribers.add(subscriber);
      // Replaying only the most recent progress keeps a late consumer in sync.
      const progress = job.lastProgress;
      if (progress) {
        Promise.resolve().then(() => {
          if (job.subscribers.has(subscriber) && job.lastProgress === progress) {
            notifySubscriber(subscriber, "onProgress", progress);
          }
        });
      }
    } else {
      job = { controller: new AbortController(), subscribers: new Set([subscriber]), lastProgress: null };
      videoRequests.set(videoId, job);
      startVideoRequest(videoId, job);
    }

    return () => {
      if (!job.subscribers.delete(subscriber)) return;
      if (job.subscribers.size === 0 && videoRequests.get(videoId) === job) {
        videoRequests.delete(videoId);
        job.controller.abort();
      }
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
}
