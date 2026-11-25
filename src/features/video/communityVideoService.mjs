import { LRUCache } from "../../core/LRUCache.mjs";
import { normalizeVideoSkipSegments } from "./communityVideoTimeline.mjs";

export function createCommunityVideoService({
    extractTrackId, readSpotifyData, readSyncData, getUserHash, getApiHeaders,
    requireDiscordAuth, translate, shouldHideDisliked, request, logDebug,
}) {
    const lastRandomVideoByTrack = new LRUCache(200);

    return {
      async getCommunityVideoIdentity(trackUri) {
        const trackId = extractTrackId(trackUri);
        if (!trackId) return null;

        const spotifyData = readSpotifyData()?.extractSpotifyData?.(trackUri) || null;
        const metadata = {
          trackId,
          trackName: spotifyData?.name || "",
          title: spotifyData?.name || "",
          artists: spotifyData?.artists || [],
          album: spotifyData?.album || spotifyData?.albumName || "",
          isrc: spotifyData?.isrc || spotifyData?.external_ids?.isrc || ""
        };
        const isrc = await readSyncData()?.resolveTrackIsrc?.(trackId, metadata)
          || readSyncData()?.getTrackIsrc?.(trackId, metadata)
          || "";
        if (!isrc) return null;

        return { isrc, trackId, metadata };
      },

      /**
       * 커뮤니티 영상 목록 조회
       * @param {string} trackUri - 트랙 URI
       */
      async getCommunityVideos(trackUri, options) {
        const signal = options?.signal;
        if (signal?.aborted) return null;
        const identity = await this.getCommunityVideoIdentity(trackUri);
        if (!identity || signal?.aborted) return null;

        const userHash = getUserHash();

        try {
          // 브라우저 캐시 우회를 위해 타임스탬프 추가
          const url = new URL('https://ivlis.kr/ivLyrics/openvideo/community');
          url.searchParams.set('isrc', identity.isrc);
          url.searchParams.set('trackId', identity.trackId);
          url.searchParams.set('userId', userHash);
          if (identity.metadata?.title) url.searchParams.set('title', identity.metadata.title);
          if (identity.metadata?.artists?.length) url.searchParams.set('artist', identity.metadata.artists.join(', '));
          if (identity.metadata?.album) url.searchParams.set('album', identity.metadata.album);
          url.searchParams.set('_t', String(Date.now()));
          const response = await request(
            url.toString(),
            {
              cache: 'no-store',  // 브라우저 캐시 완전히 우회
              ...(signal ? { signal } : {}),
              headers: getApiHeaders({
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
              })
            }
          );
          const data = await response.json();
          if (signal?.aborted) return null;

          if (data.success) {
            return data.data;
          }
          return null;
        } catch (error) {
          if (!signal?.aborted) console.error("[ivLyrics] Failed to get community videos:", error);
          return null;
        }
      },

      /**
       * 좋아요가 싫어요 이상인 커뮤니티 영상 중 하나를 무작위로 선택합니다.
       * 후보가 여러 개면 같은 곡에서 직전에 선택한 영상은 한 번 피합니다.
       */
      async getRandomCommunityVideo(trackUri, options) {
        const data = await this.getCommunityVideos(trackUri, options);
        if (options?.signal?.aborted) return null;
        const videos = Array.isArray(data?.videos) ? data.videos : [];
        const seenVideoIds = new Set();
        const eligibleVideos = videos.filter((video) => {
          const videoId = typeof video?.youtubeVideoId === "string"
            ? video.youtubeVideoId.trim()
            : "";
          if (!videoId || seenVideoIds.has(videoId)) return false;

          const likes = Number(video.likes) || 0;
          const dislikes = Number(video.dislikes) || 0;
          if (dislikes > likes) return false;
          if (
            shouldHideDisliked() &&
            video.userVote === -1
          ) {
            return false;
          }

          seenVideoIds.add(videoId);
          return true;
        });

        if (eligibleVideos.length === 0) return null;

        const trackKey = extractTrackId(trackUri) || trackUri;
        const previousVideoId = lastRandomVideoByTrack.get(trackKey);
        const selectionPool = eligibleVideos.length > 1
          ? eligibleVideos.filter((video) => video.youtubeVideoId !== previousVideoId)
          : eligibleVideos;
        const selectedVideo = selectionPool[
          Math.floor(Math.random() * selectionPool.length)
        ];

        lastRandomVideoByTrack.set(trackKey, selectedVideo.youtubeVideoId);

        return {
          ...this.getCommunityVideoSelectionInfo(selectedVideo),
          isRandomCommunity: true,
        };
      },

      getCommunityVideoSelectionInfo(video) {
        if (!video?.youtubeVideoId) return null;
        return {
          youtubeVideoId: video.youtubeVideoId,
          youtubeTitle: video.youtubeTitle,
          captionStartTime: Number(video.startTime) || 0,
          skipSegments: normalizeVideoSkipSegments(video.skipSegments),
          communityEntryId: video.id || null,
          isAutoGenerated:
            video.submitterId === "system" || video.isAutoGenerated === true,
        };
      },

      /**
       * Revalidates a saved community selection against the current user's votes.
       * If the selected entry is now hidden by a dislike, returns the highest-ranked
       * remaining visible entry, or null when the video background must fall back.
       */
      async resolveHiddenCommunityVideo(trackUri, selectedVideo, skipCache = true, options) {
        if (!selectedVideo?.youtubeVideoId) {
          return { hidden: false, replacement: null };
        }

        const data = await this.getCommunityVideos(trackUri, options ?? skipCache);
        const videos = Array.isArray(data?.videos) ? data.videos : [];
        const selectedEntry = videos.find((video) =>
          (selectedVideo.communityEntryId && video.id === selectedVideo.communityEntryId) ||
          video.youtubeVideoId === selectedVideo.youtubeVideoId
        );

        if (selectedEntry?.userVote !== -1) {
          return { hidden: false, replacement: null };
        }

        const seenVideoIds = new Set([selectedVideo.youtubeVideoId]);
        const replacementEntry = videos.find((video) => {
          const videoId = typeof video?.youtubeVideoId === "string"
            ? video.youtubeVideoId.trim()
            : "";
          if (!videoId || seenVideoIds.has(videoId) || video.userVote === -1) {
            return false;
          }
          seenVideoIds.add(videoId);
          return true;
        });

        return {
          hidden: true,
          replacement: this.getCommunityVideoSelectionInfo(replacementEntry),
        };
      },

      /**
       * 커뮤니티 영상 등록
       */
      async submitCommunityVideo(trackUri, videoId, videoTitle, startTime = 0, skipSegments = [], { signal } = {}) {
        signal?.throwIfAborted();
        const identity = await this.getCommunityVideoIdentity(trackUri);
        signal?.throwIfAborted();
        if (!identity) {
          throw new Error("이 곡의 ISRC를 확인할 수 없어 커뮤니티 영상을 등록할 수 없습니다.");
        }

        await requireDiscordAuth(
          translate("communityVideo.loginRequired")
        );
        // After sending, the submission can be committed even if the dialog closes.
        signal?.throwIfAborted();

        try {
          const response = await request('https://lyrics.api.ivl.is/lyrics/youtube/community', {
            method: 'POST',
            headers: getApiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              action: 'submit',
              isrc: identity.isrc,
              trackId: identity.trackId,
              title: identity.metadata?.title || '',
              artist: identity.metadata?.artists?.join(', ') || '',
              album: identity.metadata?.album || '',
              videoId,
              videoTitle,
              startTime,
              skipSegments: normalizeVideoSkipSegments(skipSegments)
            })
          });
          const data = await response.json();

          if (!response.ok || !data.success) {
            throw new Error(data.error || 'Failed to submit community video');
          }

          logDebug(`[ivLyrics] Community video submitted: ${videoId}`);
          return data;
        } catch (error) {
          console.error("[ivLyrics] Failed to submit community video:", error);
          throw error;
        }
      },

      /**
       * 커뮤니티 영상 투표
       * @param {number} videoEntryId - 영상 엔트리 ID
       * @param {number} voteType - 1=like, -1=dislike, 0=remove
       */
      async voteCommunityVideo(videoEntryId, voteType) {
        const userHash = getUserHash();

        try {
          const response = await request('https://lyrics.api.ivl.is/lyrics/youtube/community', {
            method: 'POST',
            headers: getApiHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              action: 'vote',
              videoEntryId,
              voterId: userHash,
              voteType // 1=like, -1=dislike, 0=remove
            })
          });
          const data = await response.json();

          if (data.success) {
            logDebug(`[ivLyrics] Community vote submitted: ${voteType > 0 ? '👍' : voteType < 0 ? '👎' : '취소'}`);
            return data;
          }
          return null;
        } catch (error) {
          console.error("[ivLyrics] Failed to vote community video:", error);
          return null;
        }
      },

      /**
       * 커뮤니티 영상 삭제 (본인만 가능)
       * @param {number} videoEntryId - 영상 엔트리 ID
       */
      async deleteCommunityVideo(videoEntryId) {
        const userHash = getUserHash();

        try {
          const response = await request(
            `https://lyrics.api.ivl.is/lyrics/youtube/community`,
            {
              method: 'POST',
              headers: getApiHeaders({
                'Content-Type': 'application/json'
              }),
              body: JSON.stringify({
                action: 'delete',
                id: videoEntryId,
                submitterId: userHash
              })
            }
          );
          const data = await response.json();

          if (data.success) {
            logDebug(`[ivLyrics] Community video deleted: ${videoEntryId}`);
            return data;
          }
          return null;
        } catch (error) {
          console.error("[ivLyrics] Failed to delete community video:", error);
          return null;
        }
      },
    };
}
