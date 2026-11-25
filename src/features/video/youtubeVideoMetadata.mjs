const YOUTUBE_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
];

/**
 * YouTube URL에서 Video ID 추출
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;

  // 이미 Video ID 형식인 경우 (11자리)
  if (/^[a-zA-Z0-9_-]{11}$/.test(url)) {
    return url;
  }

  for (const pattern of YOUTUBE_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match) return match[1];
  }

  return null;
}

export function createYouTubeVideoMetadata({ request, logDebug }) {
    return {
      /**
       * YouTube 영상 제목 가져오기 (oEmbed API 사용)
       * @returns {Promise<string|null>} 영상 제목 또는 null (존재하지 않는 영상)
       */
      async getYouTubeVideoTitle(videoId, { signal } = {}) {
        if (!videoId || signal?.aborted) return null;
        const options = signal ? { signal } : undefined;

        try {
          // YouTube oEmbed API는 API 키 없이도 사용 가능
          const response = await request(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, options
          );

          // 404 = 영상이 존재하지 않음, 401 = 비공개 영상
          if (response.status === 404 || response.status === 401) {
            logDebug("[ivLyrics] YouTube video not found or private:", videoId);
            return null;
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const data = await response.json();
          return signal?.aborted ? null : data.title || null;
        } catch (error) {
          if (signal?.aborted) return null;
          console.error("[ivLyrics] Failed to get YouTube title:", error);

          // 백업: noembed.com 사용
          try {
            const backupResponse = await request(
              `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`, options
            );

            if (backupResponse.ok) {
              const backupData = await backupResponse.json();
              if (signal?.aborted) return null;
              // noembed은 존재하지 않는 영상에 대해 error 필드를 반환함
              if (backupData.error) {
                logDebug("[ivLyrics] Video not found via noembed:", videoId);
                return null;
              }
              return backupData.title || null;
            }
          } catch (backupError) {
            if (!signal?.aborted) console.error("[ivLyrics] Backup title fetch also failed:", backupError);
          }

          return null;
        }
      },

      /**
       * YouTube 영상이 실제로 존재하고 재생 가능한지 확인
       * @returns {Promise<{valid: boolean, title: string|null, error: string|null}>}
       */
      async validateYouTubeVideo(videoId, { signal } = {}) {
        signal?.throwIfAborted();
        if (!videoId) {
          return { valid: false, title: null, error: 'invalidId' };
        }

        // 기본적인 ID 형식 검증 (11자리, 영숫자 + 특수문자)
        if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
          return { valid: false, title: null, error: 'invalidFormat' };
        }

        try {
          // oEmbed API로 영상 존재 여부 확인
          const response = await request(
            `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
            signal ? { signal } : undefined
          );

          // 404 = 영상이 존재하지 않음
          if (response.status === 404) {
            return { valid: false, title: null, error: 'notFound' };
          }

          // 401 = 비공개 영상
          if (response.status === 401) {
            return { valid: false, title: null, error: 'private' };
          }

          if (!response.ok) {
            return { valid: false, title: null, error: 'httpError' };
          }

          const data = await response.json();
          signal?.throwIfAborted();

          if (!data.title) {
            return { valid: false, title: null, error: 'noTitle' };
          }

          return { valid: true, title: data.title, error: null };
        } catch (error) {
          signal?.throwIfAborted();
          console.error("[ivLyrics] YouTube validation error:", error);
          return { valid: false, title: null, error: 'networkError' };
        }
      },
    };
}
