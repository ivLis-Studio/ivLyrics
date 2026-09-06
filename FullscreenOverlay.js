// Fullscreen Overlay Component - Enhanced UI/UX
const FullscreenOverlay = (() => {
    const react = Spicetify.React;
    const { useState, useEffect, useCallback, useMemo, useRef } = react;

    // Format time helper (ms to mm:ss)
    const formatTime = (ms) => {
        if (!ms || ms < 0) return "0:00";
        const totalSeconds = Math.floor(ms / 1000);
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    };

    // Format current time helper
    const formatClock = (date, showSeconds = false) => {
        const hours = date.getHours();
        const minutes = date.getMinutes();
        const seconds = date.getSeconds();
        if (showSeconds) {
            return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        }
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    };

    // Trim title helper - removes (Remaster), [feat. xxx], - Live Version, etc.
    const trimTitle = (title) => {
        if (!title) return title;
        const trimmed = title
            .replace(/\(.+?\)/g, "")  // Remove (...)
            .replace(/\[.+?\]/g, "")  // Remove [...]
            .replace(/\s-\s.+?$/g, "") // Remove - suffix
            .trim();
        return trimmed || title;
    };

    const isUnknownTrackMetadata = (meta) => {
        if (!meta) return true;
        const title = meta.title || '';
        const artist = meta.artist_name || '';
        return (title.toLowerCase() === 'unknown' && artist.toLowerCase() === 'unknown') ||
            (!title && !artist) ||
            (title === '' && artist === '');
    };

    const QUEUE_EMPTY_GRACE_MS = 1500;
    const PLAYER_SEEK_END_GUARD_MIN_MS = 250;
    const PLAYER_SEEK_END_GUARD_MAX_MS = 500;
    const RESEARCH_TOKEN_CONSENT_STORAGE_KEY = "ivLyrics:research-token-consent:v1";
    const hasResearchTokenConsent = () => {
        try {
            const value = window.ivLyricsStoragePersistence?.getItem?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY)
                ?? Spicetify.LocalStorage?.get?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY)
                ?? window.localStorage?.getItem?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY);
            return value === "true" || value === "1";
        } catch (_) {
            return false;
        }
    };
    const saveResearchTokenConsent = () => {
        try {
            if (window.ivLyricsStoragePersistence?.setItem) {
                window.ivLyricsStoragePersistence.setItem(RESEARCH_TOKEN_CONSENT_STORAGE_KEY, "true");
            } else if (Spicetify.LocalStorage?.set) {
                Spicetify.LocalStorage.set(RESEARCH_TOKEN_CONSENT_STORAGE_KEY, "true");
            } else {
                window.localStorage?.setItem?.(RESEARCH_TOKEN_CONSENT_STORAGE_KEY, "true");
            }
        } catch (error) {
            console.warn("[Research] Failed to remember token consent:", error);
        }
    };
    const FOCUSED_PRESENTATION_IDS = new Set([
        "vinyl",
        "compact-vinyl",
        "video"
    ]);
    const normalizeFocusedPresentation = (value, fallback = "standard") => {
        const normalized = String(value || "").trim();
        return normalized === "standard" || FOCUSED_PRESENTATION_IDS.has(normalized)
            ? normalized
            : fallback;
    };
    const getDefaultFocusedPresentation = () => {
        const normalized = normalizeFocusedPresentation(
            CONFIG?.visual?.["fullscreen-focus-presentation"],
            "vinyl"
        );
        return normalized === "standard" ? "vinyl" : normalized;
    };

    const clampSeekPositionToLiveDuration = (value, duration) => {
        const safeDuration = Math.max(Number(duration) || 0, 0);
        const safeValue = Math.max(Number(value) || 0, 0);
        if (safeDuration <= 0) return safeValue;

        const endGuard = Math.min(
            safeDuration,
            Math.max(
                PLAYER_SEEK_END_GUARD_MIN_MS,
                Math.min(PLAYER_SEEK_END_GUARD_MAX_MS, safeDuration * 0.02)
            )
        );
        return Math.min(safeValue, Math.max(safeDuration - endGuard, 0));
    };

    const getNonEmptyString = (...values) => {
        for (const value of values) {
            if (typeof value === "string" && value.trim()) {
                return value.trim();
            }
        }
        return "";
    };

    const createQueueTrackInfo = (meta, track, options = {}) => {
        const uri = getNonEmptyString(track?.uri, meta?.uri);
        const uid = getNonEmptyString(track?.uid, meta?.uid);
        const explicitContextUri = getNonEmptyString(
            meta?.context_uri,
            track?.contextUri,
            track?.context_uri,
            track?.context?.uri
        );
        const contextUri = explicitContextUri || (options.allowFallbackContext ? options.fallbackContextUri : "");
        const queueSource = options.source || "";
        const canPlayInContext = Boolean(
            uri &&
            contextUri &&
            contextUri !== uri &&
            options.allowContextPlayback !== false
        );

        return {
            title: meta?.title || "Unknown",
            artist: meta?.artist_name || "Unknown",
            image: meta?.image_url || "",
            uri,
            uid,
            contextUri,
            queueSource,
            canPlayInContext,
            index: options.index || 0,
            key: `${queueSource}:${uid || uri || "unknown"}:${options.index || 0}`
        };
    };

    const isRecommendedQueueTrack = (track) => Boolean(
        track &&
        track.queueSource !== "queued" &&
        !track.canPlayInContext
    );

    const areTrackInfoEqual = (prev, next) => {
        if (prev === next) return true;
        if (!prev || !next) return false;

        return prev.title === next.title &&
            prev.artist === next.artist &&
            prev.image === next.image &&
            prev.uri === next.uri &&
            prev.uid === next.uid &&
            prev.contextUri === next.contextUri &&
            prev.queueSource === next.queueSource &&
            prev.canPlayInContext === next.canPlayInContext &&
            prev.index === next.index;
    };

    const areTrackListsEqual = (prev, next) => {
        if (prev === next) return true;
        if (!Array.isArray(prev) || !Array.isArray(next) || prev.length !== next.length) {
            return false;
        }

        for (let i = 0; i < prev.length; i++) {
            if (!areTrackInfoEqual(prev[i], next[i])) {
                return false;
            }
        }

        return true;
    };

    const PLAYLIST_ADD_ICON_PATH = '<path d="M5 6h8"/><path d="M5 12h8"/><path d="M5 18h6"/><path d="M17 10v8"/><path d="M13 14h8"/>';
    const PLAYLIST_METADATA_BATCH_SIZE = 12;
    const PLAYLIST_STATUS_BATCH_SIZE = 4;

    const getPlaylistIdFromUri = (uri) => {
        const uriString = String(uri || "");
        const modernMatch = uriString.match(/^spotify:(?:playlist|playlist-v2):([^:]+)/);
        if (modernMatch?.[1]) return modernMatch[1];
        const legacyMatch = uriString.match(/^spotify:user:[^:]+:playlist:([^:]+)/);
        return legacyMatch?.[1] || "";
    };

    const getTrackIdFromUri = (uri) => {
        const match = String(uri || "").match(/^spotify:track:([^:]+)/);
        return match?.[1] || "";
    };

    const getPlaylistUriFromItem = (playlist) => {
        const rawUri = getFirstSpotifyUri(playlist?.uri, playlist?.link) || "";
        const id = playlist?.id || getPlaylistIdFromUri(rawUri);
        return id ? `spotify:playlist:${id}` : rawUri;
    };

    const normalizeSpotifyImageUrl = (image) => {
        const rawUrl = getNonEmptyString(image?.url, image?.uri, image?.sources?.[0]?.url, image);
        if (!rawUrl) return "";
        if (rawUrl.startsWith("spotify:image:")) {
            return `https://i.scdn.co/image/${rawUrl.split(":").pop()}`;
        }
        if (rawUrl.startsWith("spotify:mosaic:")) {
            return `https://mosaic.scdn.co/640/${rawUrl.replace("spotify:mosaic:", "").replace(/:/g, "")}`;
        }
        return rawUrl;
    };

    const getPlaylistImage = (...sources) => {
        for (const source of sources) {
            if (Array.isArray(source)) {
                for (const image of source) {
                    const imageUrl = normalizeSpotifyImageUrl(image);
                    if (imageUrl) return imageUrl;
                }
                continue;
            }

            const imageUrl = normalizeSpotifyImageUrl(source);
            if (imageUrl) return imageUrl;
        }
        return "";
    };

    const getCurrentSpotifyUserId = () => {
        const rawUserId = getNonEmptyString(
            Spicetify?.Platform?.LocalStorageAPI?.namespace,
            Spicetify?.Config?.username,
            Spicetify?.Platform?.Session?.username
        );
        return rawUserId.replace(/^spotify:user:/, "");
    };

    const getPlaylistOwnerId = (...owners) => {
        for (const owner of owners) {
            const rawOwner = getNonEmptyString(owner?.username, owner?.id, owner?.uri, owner);
            if (!rawOwner) continue;
            const match = rawOwner.match(/^spotify:user:(.+)$/);
            return match?.[1] || rawOwner;
        }
        return "";
    };

    const isPlaylistItem = (item) => item?.type === "playlist" || String(item?.uri || "").startsWith("spotify:playlist");

    const flattenRootlistItems = (rootlist) => {
        const flattened = [];
        const visit = (item) => {
            if (!item) return;
            if (Array.isArray(item)) {
                item.forEach(visit);
                return;
            }
            if (isPlaylistItem(item)) {
                flattened.push(item);
            }
            visit(item.items);
            visit(item.rows);
            visit(item.children);
            visit(item.contents);
        };

        visit(rootlist?.items || rootlist?.rows || rootlist);
        return flattened;
    };

    const isWritablePlaylist = (playlist, metadata, currentUserId) => {
        const candidates = [playlist, metadata];
        if (candidates.some((item) =>
            item?.isOwnedBySelf ||
            item?.ownedBySelf ||
            item?.collaborative ||
            item?.isCollaborative ||
            item?.editable ||
            item?.isEditable ||
            item?.canEdit ||
            item?.canWrite ||
            item?.canAddTracks ||
            item?.capabilities?.canAddTracks ||
            item?.capabilities?.canWrite ||
            item?.permissions?.canAdd ||
            item?.permissions?.canAddTracks ||
            item?.permissions?.canWrite
        )) {
            return true;
        }

        const ownerId = getPlaylistOwnerId(
            playlist?.owner,
            metadata?.owner,
            playlist?.ownerUri,
            metadata?.ownerUri,
            playlist?.ownerUsername,
            metadata?.ownerUsername
        );
        return !currentUserId || !ownerId || ownerId === currentUserId;
    };

    const getPlaylistTotal = (playlist, metadata) => Number(
        metadata?.tracks?.total ||
        playlist?.tracks?.total ||
        metadata?.totalLength ||
        playlist?.totalLength ||
        metadata?.trackCount ||
        playlist?.trackCount ||
        metadata?.length ||
        playlist?.length ||
        0
    );

    const getRootlistContents = async () => {
        const rootlistApi = Spicetify?.Platform?.RootlistAPI;
        if (rootlistApi?.getContents) {
            try {
                return await rootlistApi.getContents({ flatten: true });
            } catch (error) {
                try {
                    return await rootlistApi.getContents();
                } catch (fallbackError) {
                    console.warn("[FullscreenOverlay] RootlistAPI failed; falling back to Cosmos rootlist.", fallbackError);
                }
            }
        }

        if (Spicetify?.CosmosAsync?.get) {
            return await Spicetify.CosmosAsync.get("sp://core-playlist/v1/rootlist");
        }

        throw new Error("Rootlist API is unavailable.");
    };

    const fetchPlaylistMetadata = async (playlistUri) => {
        const playlistApi = Spicetify?.Platform?.PlaylistAPI;
        if (!playlistApi?.getMetadata || !playlistUri) return null;

        try {
            return await playlistApi.getMetadata(playlistUri, { limit: 1 });
        } catch (error) {
            console.warn("[FullscreenOverlay] Failed to load playlist metadata:", playlistUri, error);
            return null;
        }
    };

    const normalizeRootlistPlaylist = async (playlist, currentUserId) => {
        const uri = getPlaylistUriFromItem(playlist);
        const id = playlist?.id || getPlaylistIdFromUri(uri);
        if (!id) return null;

        const metadata = await fetchPlaylistMetadata(uri);
        if (!isWritablePlaylist(playlist, metadata, currentUserId)) return null;

        return {
            id,
            uri,
            name: getNonEmptyString(metadata?.name, playlist?.name, playlist?.title) || "Playlist",
            image: getPlaylistImage(metadata?.images, playlist?.images, metadata?.image, playlist?.image),
            total: getPlaylistTotal(playlist, metadata)
        };
    };

    const fetchWritableUserPlaylists = async () => {
        const rootlist = await getRootlistContents();
        const currentUserId = getCurrentSpotifyUserId();
        const seenIds = new Set();
        const rootlistPlaylists = flattenRootlistItems(rootlist).filter((playlist) => {
            const uri = getPlaylistUriFromItem(playlist);
            const id = playlist?.id || getPlaylistIdFromUri(uri);
            if (!id || seenIds.has(id)) return false;
            seenIds.add(id);
            return true;
        });

        const normalizedPlaylists = [];
        for (let index = 0; index < rootlistPlaylists.length; index += PLAYLIST_METADATA_BATCH_SIZE) {
            const batch = rootlistPlaylists.slice(index, index + PLAYLIST_METADATA_BATCH_SIZE);
            const normalizedBatch = await Promise.all(
                batch.map((playlist) => normalizeRootlistPlaylist(playlist, currentUserId))
            );
            for (const normalizedPlaylist of normalizedBatch) {
                if (normalizedPlaylist) {
                    normalizedPlaylists.push(normalizedPlaylist);
                }
            }
        }

        return normalizedPlaylists;
    };

    const getPlaylistContentItems = (contents) => {
        const candidates = [
            contents?.items?.data,
            contents?.items,
            contents?.data?.items,
            contents?.data,
            contents
        ];
        return candidates.find((candidate) => Array.isArray(candidate)) || [];
    };

    const createPlaylistTrackMatch = (contains = false, uids = []) => ({
        contains,
        uids: [...new Set(uids.filter(Boolean).map(String))]
    });

    const getPlaylistStatusValue = (state) => typeof state === "string" ? state : state?.status;

    const getPlaylistStatusUids = (state) => Array.isArray(state?.uids) ? state.uids : [];

    const isSameTrackUri = (candidateUri, trackUri) => {
        if (!candidateUri || !trackUri) return false;
        if (candidateUri === trackUri) return true;

        const candidateTrackId = getTrackIdFromUri(candidateUri);
        const trackId = getTrackIdFromUri(trackUri);
        return Boolean(candidateTrackId && trackId && candidateTrackId === trackId);
    };

    const getPlaylistItemUid = (item) => getNonEmptyString(
        item?.uid,
        item?.rowId,
        item?.row_id,
        item?.track?.uid,
        item?.track?.rowId,
        item?.track?.row_id,
        item?.item?.uid,
        item?.item?.rowId,
        item?.item?.row_id
    );

    const getPlaylistFindTrackMatch = (matches, trackUri) => {
        const trackId = getTrackIdFromUri(trackUri);
        if (!matches) return createPlaylistTrackMatch();

        if (!Array.isArray(matches) && typeof matches === "object") {
            const directMatch = matches[trackUri] || matches[trackId];
            if (Array.isArray(directMatch)) {
                return createPlaylistTrackMatch(directMatch.length > 0, directMatch);
            }
            if (directMatch && typeof directMatch === "object") {
                const uids = [
                    ...(Array.isArray(directMatch.uids) ? directMatch.uids : []),
                    directMatch.uid
                ];
                return createPlaylistTrackMatch(Boolean(
                    directMatch.found ||
                    directMatch.contains ||
                    directMatch.exists ||
                    directMatch.uid ||
                    directMatch.count > 0 ||
                    directMatch.uids?.length > 0
                ), uids);
            }
            return createPlaylistTrackMatch(Boolean(directMatch));
        }

        if (!Array.isArray(matches)) return createPlaylistTrackMatch();

        for (const match of matches) {
            if (typeof match === "string" && isSameTrackUri(match, trackUri)) {
                return createPlaylistTrackMatch(true);
            }
            if (!match || typeof match !== "object") continue;

            const matchUri = getFirstSpotifyUri(match.uri, match.track?.uri, match.item?.uri, match.linkedUri);
            if (matchUri && !isSameTrackUri(matchUri, trackUri)) continue;

            const uids = [
                ...(Array.isArray(match.uids) ? match.uids : []),
                ...(Array.isArray(match.items) ? match.items.map(getPlaylistItemUid) : []),
                match.uid
            ];
            const contains = Boolean(
                match.uids?.length > 0 ||
                match.items?.length > 0 ||
                match.found ||
                match.contains ||
                match.exists ||
                match.uid ||
                match.count > 0
            );
            if (contains) return createPlaylistTrackMatch(true, uids);
        }

        return createPlaylistTrackMatch();
    };

    const playlistItemContainsTrack = (item, trackUri) => {
        const itemUris = [
            item?.uri,
            item?.track?.uri,
            item?.item?.uri,
            item?.linkedUri,
            item?.linked_uri,
            item?.linkedFrom?.uri,
            item?.track?.linkedFrom?.uri,
            item?.track?.linked_from?.uri
        ];
        return itemUris.some((uri) => isSameTrackUri(getFirstSpotifyUri(uri), trackUri));
    };

    const getPlaylistTrackMatchFromItems = (items, trackUri) => {
        const uids = [];
        let contains = false;

        for (const item of items) {
            if (!playlistItemContainsTrack(item, trackUri)) continue;
            contains = true;
            uids.push(getPlaylistItemUid(item));
        }

        return createPlaylistTrackMatch(contains, uids);
    };

    const getPlaylistTrackMatch = async (playlist, trackUri) => {
        const playlistUri = playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
        const playlistApi = Spicetify?.Platform?.PlaylistAPI;
        if (!playlistUri || !trackUri) return createPlaylistTrackMatch();

        if (playlistApi?.find) {
            try {
                const matches = await playlistApi.find(playlistUri, [trackUri]);
                const findMatch = getPlaylistFindTrackMatch(matches, trackUri);
                if (findMatch.contains) return findMatch;
            } catch (error) {
                console.warn("[FullscreenOverlay] Failed to check playlist membership with find:", playlistUri, error);
            }
        }

        if (playlistApi?.getContents) {
            try {
                const contents = await playlistApi.getContents(playlistUri, { limit: 9999999 });
                const contentsMatch = getPlaylistTrackMatchFromItems(getPlaylistContentItems(contents), trackUri);
                if (contentsMatch.contains) return contentsMatch;
            } catch (error) {
                console.warn("[FullscreenOverlay] Failed to check playlist membership with getContents:", playlistUri, error);
            }
        }

        if (playlistApi?.getListContents) {
            try {
                const contents = await playlistApi.getListContents(playlistUri, { limit: 10000 });
                const listContentsMatch = getPlaylistTrackMatchFromItems(getPlaylistContentItems(contents), trackUri);
                if (listContentsMatch.contains) return listContentsMatch;
            } catch (error) {
                console.warn("[FullscreenOverlay] Failed to check playlist membership with contents:", playlistUri, error);
            }
        }

        return createPlaylistTrackMatch();
    };

    const playlistContainsTrack = async (playlist, trackUri) => {
        return (await getPlaylistTrackMatch(playlist, trackUri)).contains;
    };

    const addTrackToSpotifyPlaylist = async (playlist, trackUri) => {
        const playlistUri = playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
        if (Spicetify?.Platform?.PlaylistAPI?.add && playlistUri) {
            return await Spicetify.Platform.PlaylistAPI.add(playlistUri, [trackUri], { after: "end" });
        }

        throw new Error("Spicetify PlaylistAPI.add is unavailable.");
    };

    const removeTrackFromSpotifyPlaylist = async (playlist, trackUri, knownUids = []) => {
        const playlistUri = playlist?.uri || (playlist?.id ? `spotify:playlist:${playlist.id}` : "");
        const playlistApi = Spicetify?.Platform?.PlaylistAPI;
        if (!playlistApi?.remove || !playlistUri) {
            throw new Error("Spicetify PlaylistAPI.remove is unavailable.");
        }

        let targetUids = [...new Set(knownUids.filter(Boolean).map(String))];
        if (targetUids.length === 0) {
            const trackMatch = await getPlaylistTrackMatch(playlist, trackUri);
            targetUids = trackMatch.uids;
        }

        if (targetUids.length === 0) {
            throw new Error("Playlist item UID is unavailable.");
        }

        return await playlistApi.remove(
            playlistUri,
            targetUids.map((uid) => ({ uri: trackUri, uid }))
        );
    };

    const getFirstSpotifyUri = (...values) => {
        for (const value of values) {
            if (!value) continue;

            if (Array.isArray(value)) {
                const nestedUri = getFirstSpotifyUri(...value);
                if (nestedUri) return nestedUri;
                continue;
            }

            if (typeof value === "object") {
                const nestedUri = getFirstSpotifyUri(value.uri, value.link);
                if (nestedUri) return nestedUri;
                continue;
            }

            const legacyPlaylistMatch = String(value).match(/spotify:user:[^:]+:playlist:[A-Za-z0-9]+/);
            if (legacyPlaylistMatch) return legacyPlaylistMatch[0];

            const match = String(value).match(/spotify:(track|artist|album|playlist|playlist-v2):[A-Za-z0-9]+/);
            if (match) return match[0];
        }

        return "";
    };

    const spotifyUriToPath = (uri) => {
        const match = String(uri || "").match(/^spotify:(track|artist|album):([A-Za-z0-9]+)$/);
        return match ? `/${match[1]}/${match[2]}` : "";
    };

    const getCurrentAlbumUri = () => {
        const item = Spicetify.Player.data?.item;
        const metadata = item?.metadata || {};
        return getFirstSpotifyUri(
            item?.album?.uri,
            metadata.album_uri,
            metadata.album?.uri
        );
    };

    const getCurrentArtistUri = () => {
        const item = Spicetify.Player.data?.item;
        const metadata = item?.metadata || {};
        return getFirstSpotifyUri(
            item?.artists,
            metadata.artist_uri,
            metadata.artist_uris
        );
    };

    // These fields are read directly while rendering the overlay. Keep their
    // polling fallback even when playback position is not used by this layout,
    // including metadata that arrives after songchange or mutates in place.
    const getOverlayMetadataSnapshot = () => {
        const item = Spicetify.Player.data?.item;
        const metadata = item?.metadata;
        return [
            getFirstSpotifyUri(item?.uri),
            getCurrentArtistUri(),
            getCurrentAlbumUri(),
            metadata?.title,
            metadata?.artist_name,
            metadata?.album_title,
            metadata?.album_disc_number,
            metadata?.year,
            metadata?.image_xlarge_url,
            metadata?.image_large_url,
            item?.album?.images?.[0]?.url,
            metadata?.image_url
        ];
    };

    // Clock Component
    const Clock = ({ show, showSeconds = false, size = 48 }) => {
        const [time, setTime] = useState(new Date());

        useEffect(() => {
            if (!show) return;

            if (showSeconds) {
                const timer = setInterval(() => setTime(new Date()), 1000);
                return () => clearInterval(timer);
            }

            let intervalId = null;
            const syncToMinute = () => {
                setTime(new Date());
                intervalId = setInterval(() => setTime(new Date()), 60000);
            };
            const now = new Date();
            const msUntilNextMinute =
                (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
            const timeoutId = setTimeout(syncToMinute, Math.max(msUntilNextMinute, 0));

            return () => {
                clearTimeout(timeoutId);
                if (intervalId) {
                    clearInterval(intervalId);
                }
            };
        }, [show, showSeconds]);

        if (!show) return null;

        return react.createElement("div", {
            className: "fullscreen-clock",
            style: { fontSize: `${size}px` }
        },
            formatClock(time, showSeconds)
        );
    };

    // Context Info Component (Playlist/Album name)
    const ContextInfo = ({ show, showImage = true }) => {
        const [contextName, setContextName] = useState("");
        const [contextType, setContextType] = useState("");
        const [contextImage, setContextImage] = useState("");

        useEffect(() => {
            if (!show) return;

            const updateContext = async () => {
                try {
                    const context = Spicetify.Player.data?.context;
                    if (context?.metadata) {
                        setContextName(context.metadata.context_description || "");

                        // Get image URL - try multiple sources
                        let imageUrl = context.metadata.image_url || "";

                        // Helper function to convert image ID to full URL
                        const toFullImageUrl = (url) => {
                            if (!url) return "";
                            // Already a full URL
                            if (url.startsWith("http://") || url.startsWith("https://")) {
                                return url;
                            }
                            // spotify:image: format
                            if (url.startsWith("spotify:image:")) {
                                const imageId = url.replace("spotify:image:", "");
                                return `https://i.scdn.co/image/${imageId}`;
                            }
                            // Just an image ID (hex string like ab67706c...)
                            if (/^[a-f0-9]+$/i.test(url)) {
                                return `https://i.scdn.co/image/${url}`;
                            }
                            // Unknown format, return as-is
                            return url;
                        };

                        imageUrl = toFullImageUrl(imageUrl);

                        // If still no valid image, try Spicetify's internal playlist metadata.
                        if (!imageUrl && context.uri) {
                            try {
                                const uri = context.uri;
                                if (uri.includes("playlist:")) {
                                    const playlistData = await fetchPlaylistMetadata(getPlaylistUriFromItem({ uri }));
                                    imageUrl = getPlaylistImage(playlistData?.images, playlistData?.image);
                                }
                            } catch (fetchErr) {
                                console.debug("Failed to fetch context image:", fetchErr);
                            }
                        }

                        setContextImage(imageUrl);

                        // Determine context type
                        const uri = context.uri || "";
                        if (uri.includes("playlist")) setContextType(I18n.t("fullscreen.contextType.playlist"));
                        else if (uri.includes("album")) setContextType(I18n.t("fullscreen.contextType.album"));
                        else if (uri.includes("artist")) setContextType(I18n.t("fullscreen.contextType.artist"));
                        else if (uri.includes("collection")) setContextType(I18n.t("fullscreen.contextType.collection"));
                        else if (uri.includes("station")) setContextType(I18n.t("fullscreen.contextType.station"));
                        else setContextType("");
                    }
                } catch (e) {
                    console.error("Context update error:", e);
                }
            };

            updateContext();
            Spicetify.Player.addEventListener("songchange", updateContext);
            return () => Spicetify.Player.removeEventListener("songchange", updateContext);
        }, [show]);

        if (!show || !contextName) return null;

        return react.createElement("div", { className: "fullscreen-context-info" },
            showImage && contextImage && react.createElement("img", {
                src: contextImage,
                className: "fullscreen-context-image"
            }),
            react.createElement("div", { className: "fullscreen-context-text" },
                contextType && react.createElement("span", { className: "fullscreen-context-type" }, contextType),
                react.createElement("span", { className: "fullscreen-context-name" }, contextName)
            )
        );
    };

    // Next Track Preview Component
    const NextTrackPreview = ({ show, secondsBeforeEnd = 15 }) => {
        const [visible, setVisible] = useState(false);
        const [nextTrack, setNextTrack] = useState(null);

        useEffect(() => {
            if (!show) return;

            const checkNextTrack = () => {
                try {
                    // 반복 모드 확인: 0=off, 1=context(전체반복), 2=track(한곡반복)
                    const repeatMode = Spicetify.Player.getRepeat?.() || 0;

                    // 한 곡 반복 모드일 때는 다음 곡 미리보기를 표시하지 않음
                    if (repeatMode === 2) {
                        setVisible(false);
                        return;
                    }

                    const duration = Spicetify.Player.getDuration();
                    const position = window.Utils?.getSafePlayerProgress?.()
                        ?? (Spicetify.Player.getProgress?.() || 0);
                    const remaining = (duration - position) / 1000;

                    // Show when less than secondsBeforeEnd remaining
                    if (remaining <= secondsBeforeEnd && remaining > 0) {
                        // Get next track from queue
                        const queue = Spicetify.Queue;
                        if (queue?.nextTracks?.length > 0) {
                            // Unknown 트랙이 아닌 첫 번째 유효한 트랙 찾기
                            const validNext = queue.nextTracks.find((track) => {
                                const meta = track?.contextTrack?.metadata;
                                return !isUnknownTrackMetadata(meta);
                            });

                            if (validNext?.contextTrack?.metadata) {
                                const nextTrackData = {
                                    title: validNext.contextTrack.metadata.title,
                                    artist: validNext.contextTrack.metadata.artist_name,
                                    image: validNext.contextTrack.metadata.image_url
                                };
                                setNextTrack((prev) => (
                                    prev &&
                                        prev.title === nextTrackData.title &&
                                        prev.artist === nextTrackData.artist &&
                                        prev.image === nextTrackData.image
                                ) ? prev : nextTrackData);
                                setVisible(true);
                                return;
                            }
                        }
                    }
                    setVisible(false);
                } catch (e) {
                    setVisible(false);
                }
            };

            const interval = setInterval(checkNextTrack, 500);
            return () => clearInterval(interval);
        }, [show, secondsBeforeEnd]);

        if (!show || !visible || !nextTrack) return null;

        return react.createElement("div", { className: "fullscreen-next-track" },
            react.createElement("div", { className: "fullscreen-next-track-label" }, I18n.t("fullscreen.controls.nextTrackLabel")),
            react.createElement("div", { className: "fullscreen-next-track-content" },
                nextTrack.image && react.createElement("img", {
                    src: nextTrack.image,
                    className: "fullscreen-next-track-image"
                }),
                react.createElement("div", { className: "fullscreen-next-track-info" },
                    react.createElement("div", { className: "fullscreen-next-track-title" }, nextTrack.title),
                    react.createElement("div", { className: "fullscreen-next-track-artist" }, nextTrack.artist)
                )
            )
        );
    };

    // Progress Bar Component (독립형 - 컨트롤과 별개로 표시 가능)
    const ProgressBar = ({ show }) => {
        const [progress, setProgress] = useState(0);
        const [duration, setDuration] = useState(0);
        const progressRef = useRef(null);
        const isDragging = useRef(false);

        useEffect(() => {
            if (!show) return;
            const updateInterval = 200; // ms

            const updateProgress = () => {
                if (!isDragging.current) {
                    setProgress(window.Utils?.getSafePlayerProgress?.()
                        ?? (Spicetify.Player.getProgress?.() || 0));
                }
                setDuration(Spicetify.Player.getDuration() || 0);
            };

            updateProgress();
            const intervalId = setInterval(updateProgress, updateInterval);

            return () => {
                clearInterval(intervalId);
            };
        }, [show]);

        const handleProgressClick = useCallback((e) => {
            if (!progressRef.current) return;
            const rect = progressRef.current.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            const newProgress = percent * duration;
            window.Utils?.clearSafePlayerProgressCorrection?.();
            Spicetify.Player.seek(newProgress);
            setProgress(newProgress);
        }, [duration]);

        const handleProgressDrag = useCallback((e) => {
            if (!isDragging.current || !progressRef.current) return;
            const rect = progressRef.current.getBoundingClientRect();
            const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setProgress(percent * duration);
        }, [duration]);

        const handleMouseUp = useCallback((e) => {
            if (isDragging.current && progressRef.current) {
                const rect = progressRef.current.getBoundingClientRect();
                const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                window.Utils?.clearSafePlayerProgressCorrection?.();
                Spicetify.Player.seek(percent * duration);
            }
            isDragging.current = false;
            document.removeEventListener('mousemove', handleProgressDrag);
            document.removeEventListener('mouseup', handleMouseUp);
        }, [duration, handleProgressDrag]);

        const handleMouseDown = useCallback(() => {
            isDragging.current = true;
            document.addEventListener('mousemove', handleProgressDrag);
            document.addEventListener('mouseup', handleMouseUp);
        }, [handleProgressDrag, handleMouseUp]);

        if (!show) return null;

        const progressPercent = duration > 0 ? (progress / duration) * 100 : 0;

        return react.createElement("div", { className: "fullscreen-progress-standalone" },
            react.createElement("span", { className: "fullscreen-time" }, formatTime(progress)),
            react.createElement("div", {
                className: "fullscreen-progress-bar",
                ref: progressRef,
                onClick: handleProgressClick,
                onMouseDown: handleMouseDown
            },
                react.createElement("div", {
                    className: "fullscreen-progress-fill",
                    style: { transform: `scaleX(${Math.max(0, Math.min(1, progressPercent / 100))})` }
                }),
                react.createElement("div", {
                    className: "fullscreen-progress-handle",
                    style: { left: `${progressPercent}%` }
                })
            ),
            react.createElement("span", { className: "fullscreen-time" }, formatTime(duration))
        );
    };

    // Player Controls Component (개선된 UI/UX)
    const PlayerControls = ({ show, showVolume = true, buttonSize = 36, showBackground = false }) => {
        const [isPlaying, setIsPlaying] = useState(false);
        const [isShuffle, setIsShuffle] = useState(false);
        const [repeatMode, setRepeatMode] = useState(0);
        const [isLiked, setIsLiked] = useState(false);
        const [volume, setVolume] = useState(Spicetify.Player.getVolume?.() ?? 1);
        const [isMuted, setIsMuted] = useState(false);
        const [isVolumeHovered, setIsVolumeHovered] = useState(false);
        const [isVolumeChanging, setIsVolumeChanging] = useState(false);
        const [isPlaylistPickerOpen, setIsPlaylistPickerOpen] = useState(false);
        const [playlists, setPlaylists] = useState([]);
        const [isPlaylistsLoading, setIsPlaylistsLoading] = useState(false);
        const [playlistError, setPlaylistError] = useState("");
        const [addingPlaylistId, setAddingPlaylistId] = useState("");
        const [playlistTrackUri, setPlaylistTrackUri] = useState(Spicetify.Player.data?.item?.uri || "");
        const [playlistTrackStatus, setPlaylistTrackStatus] = useState({});
        const volumeChangeTimeoutRef = useRef(null);
        const playlistPickerRef = useRef(null);
        const playlistStatusCheckRef = useRef(0);
        const likeRequestGenerationRef = useRef(0);

        // 재생 상태를 Spicetify.Player.data.isPaused에서 직접 가져옴
        useEffect(() => {
            if (!show) return;

            const updatePlayState = () => {
                // Spicetify.Player.data.isPaused가 가장 신뢰할 수 있는 소스
                const isPaused = Spicetify.Player.data?.isPaused ?? true;
                setIsPlaying(!isPaused);
            };
            const updateShuffle = () => setIsShuffle(Spicetify.Player.getShuffle?.() || false);
            const updateRepeat = () => setRepeatMode(Spicetify.Player.getRepeat?.() || 0);

            const checkLiked = async () => {
                const requestGeneration = ++likeRequestGenerationRef.current;
                const uri = Spicetify.Player.data?.item?.uri;
                try {
                    if (uri && Spicetify.Platform?.LibraryAPI) {
                        const result = await Spicetify.Platform.LibraryAPI.contains(uri);
                        if (requestGeneration !== likeRequestGenerationRef.current || Spicetify.Player.data?.item?.uri !== uri) return;
                        setIsLiked(Array.isArray(result) ? result[0] : result);
                    }
                } catch (e) {
                    if (requestGeneration !== likeRequestGenerationRef.current || Spicetify.Player.data?.item?.uri !== uri) return;
                }
            };

            // 볼륨 변경 감지 (Spotify 단축키로 변경 시에도 반영)
            let lastVolume = -1;
            const updateVolume = () => {
                const currentVolume = Spicetify.Player.getVolume?.() ?? 1;
                if (currentVolume !== lastVolume) {
                    lastVolume = currentVolume;
                    setVolume(currentVolume);
                    setIsMuted(currentVolume === 0);
                }
            };

            // 초기 상태 설정
            updatePlayState();
            updateShuffle();
            updateRepeat();
            checkLiked();
            updateVolume();

            // Spotify can change repeat outside this component (including the
            // temporary Research playback guard), so keep both controls in sync.
            const controlStateCheckInterval = 500;
            const controlStateIntervalId = setInterval(() => {
                updateVolume();
                updateRepeat();
            }, controlStateCheckInterval);

            Spicetify.Player.addEventListener("onplaypause", updatePlayState);
            Spicetify.Player.addEventListener("songchange", checkLiked);

            return () => {
                clearInterval(controlStateIntervalId);
                Spicetify.Player.removeEventListener("onplaypause", updatePlayState);
                Spicetify.Player.removeEventListener("songchange", checkLiked);
            };
        }, [show]);

        useEffect(() => {
            if (!isPlaylistPickerOpen) return;

            const handleOutsidePointer = (event) => {
                if (playlistPickerRef.current?.contains?.(event.target)) return;
                setIsPlaylistPickerOpen(false);
            };

            document.addEventListener("mousedown", handleOutsidePointer, true);
            return () => document.removeEventListener("mousedown", handleOutsidePointer, true);
        }, [isPlaylistPickerOpen]);

        useEffect(() => {
            if (!show) return;

            const updatePlaylistTrackUri = () => {
                const nextTrackUri = Spicetify.Player.data?.item?.uri || "";
                setPlaylistTrackUri((previousTrackUri) => {
                    if (previousTrackUri !== nextTrackUri) {
                        setPlaylistTrackStatus({});
                    }
                    return nextTrackUri;
                });
            };

            updatePlaylistTrackUri();
            Spicetify.Player.addEventListener("songchange", updatePlaylistTrackUri);
            return () => Spicetify.Player.removeEventListener("songchange", updatePlaylistTrackUri);
        }, [show]);

        const toggleLike = async () => {
            const requestGeneration = ++likeRequestGenerationRef.current;
            const uri = Spicetify.Player.data?.item?.uri;
            const nextLiked = !isLiked;
            try {
                if (uri && Spicetify.Platform?.LibraryAPI) {
                    if (isLiked) {
                        await Spicetify.Platform.LibraryAPI.remove({ uris: [uri] });
                    } else {
                        await Spicetify.Platform.LibraryAPI.add({ uris: [uri] });
                    }
                    if (requestGeneration !== likeRequestGenerationRef.current || Spicetify.Player.data?.item?.uri !== uri) return;
                    setIsLiked(nextLiked);
                }
            } catch (e) {
                if (requestGeneration !== likeRequestGenerationRef.current || Spicetify.Player.data?.item?.uri !== uri) return;
                console.error("Toggle like error:", e);
            }
        };

        const cycleRepeat = () => {
            const nextMode = (repeatMode + 1) % 3;
            Spicetify.Player.setRepeat(nextMode);
            setRepeatMode(nextMode);
        };

        const loadPlaylists = useCallback(async () => {
            if (isPlaylistsLoading) return;

            setIsPlaylistsLoading(true);
            setPlaylistError("");
            try {
                const writablePlaylists = await fetchWritableUserPlaylists();
                setPlaylists(writablePlaylists);
                if (writablePlaylists.length === 0) {
                    setPlaylistError(I18n.t("fullscreen.controls.playlistEmpty") || "No editable playlists found.");
                }
            } catch (error) {
                console.warn("[FullscreenOverlay] Failed to load playlists:", error);
                setPlaylistError(I18n.t("fullscreen.controls.playlistLoadFailed") || "Failed to load playlists.");
            } finally {
                setIsPlaylistsLoading(false);
            }
        }, [isPlaylistsLoading]);

        const togglePlaylistPicker = useCallback(() => {
            setIsPlaylistPickerOpen((open) => {
                const nextOpen = !open;
                if (nextOpen && playlists.length === 0 && !isPlaylistsLoading) {
                    loadPlaylists();
                }
                return nextOpen;
            });
        }, [playlists.length, isPlaylistsLoading, loadPlaylists]);

        const loadPlaylistTrackStatuses = useCallback(async (targetPlaylists, trackUri) => {
            const checkToken = ++playlistStatusCheckRef.current;
            const validPlaylists = Array.isArray(targetPlaylists) ? targetPlaylists.filter((playlist) => playlist?.id) : [];

            if (!trackUri.startsWith("spotify:track:") || validPlaylists.length === 0) {
                setPlaylistTrackStatus({});
                return;
            }

            const initialStatus = {};
            for (const playlist of validPlaylists) {
                initialStatus[playlist.id] = { status: "checking", uids: [] };
            }
            setPlaylistTrackStatus(initialStatus);

            for (let index = 0; index < validPlaylists.length; index += PLAYLIST_STATUS_BATCH_SIZE) {
                const batch = validPlaylists.slice(index, index + PLAYLIST_STATUS_BATCH_SIZE);
                const batchResults = await Promise.all(batch.map(async (playlist) => {
                    try {
                        const trackMatch = await getPlaylistTrackMatch(playlist, trackUri);
                        return [
                            playlist.id,
                            {
                                status: trackMatch.contains ? "contains" : "missing",
                                uids: trackMatch.uids
                            }
                        ];
                    } catch (error) {
                        console.warn("[FullscreenOverlay] Failed to check playlist track status:", playlist?.uri || playlist?.id, error);
                        return [playlist.id, { status: "missing", uids: [] }];
                    }
                }));

                if (playlistStatusCheckRef.current !== checkToken) return;

                setPlaylistTrackStatus((previousStatus) => {
                    const nextStatus = { ...previousStatus };
                    for (const [playlistId, status] of batchResults) {
                        nextStatus[playlistId] = status;
                    }
                    return nextStatus;
                });
            }
        }, []);

        useEffect(() => {
            if (!isPlaylistPickerOpen || isPlaylistsLoading || playlistError || playlists.length === 0) return;

            loadPlaylistTrackStatuses(playlists, playlistTrackUri);
            return () => {
                playlistStatusCheckRef.current += 1;
            };
        }, [isPlaylistPickerOpen, isPlaylistsLoading, playlistError, playlists, playlistTrackUri, loadPlaylistTrackStatuses]);

        const handlePlaylistItemAction = useCallback(async (playlist) => {
            const trackUri = playlistTrackUri || Spicetify.Player.data?.item?.uri || "";
            if (!trackUri.startsWith("spotify:track:")) {
                Toast.error(I18n.t("fullscreen.controls.playlistNoTrack") || "Only Spotify tracks can be added to playlists.");
                return;
            }
            if (!playlist?.id || addingPlaylistId) return;

            setAddingPlaylistId(playlist.id);
            let attemptedPlaylistRemoval = false;
            try {
                if (getPlaylistStatusValue(playlistTrackStatus[playlist.id]) === "contains") {
                    attemptedPlaylistRemoval = true;
                    await removeTrackFromSpotifyPlaylist(playlist, trackUri, getPlaylistStatusUids(playlistTrackStatus[playlist.id]));
                    setPlaylistTrackStatus((previousStatus) => ({
                        ...previousStatus,
                        [playlist.id]: { status: "missing", uids: [] }
                    }));
                    Toast.success(
                        (I18n.t("fullscreen.controls.playlistRemoved") || "Removed from {playlist}.")
                            .replace("{playlist}", playlist.name || "playlist")
                    );
                    return;
                }

                const trackMatch = await getPlaylistTrackMatch(playlist, trackUri);
                if (trackMatch.contains) {
                    setPlaylistTrackStatus((previousStatus) => ({
                        ...previousStatus,
                        [playlist.id]: { status: "contains", uids: trackMatch.uids }
                    }));
                    attemptedPlaylistRemoval = true;
                    await removeTrackFromSpotifyPlaylist(playlist, trackUri, trackMatch.uids);
                    setPlaylistTrackStatus((previousStatus) => ({
                        ...previousStatus,
                        [playlist.id]: { status: "missing", uids: [] }
                    }));
                    Toast.success(
                        (I18n.t("fullscreen.controls.playlistRemoved") || "Removed from {playlist}.")
                            .replace("{playlist}", playlist.name || "playlist")
                    );
                    return;
                }

                await addTrackToSpotifyPlaylist(playlist, trackUri);
                setPlaylistTrackStatus((previousStatus) => ({
                    ...previousStatus,
                    [playlist.id]: { status: "contains", uids: [] }
                }));
                setIsPlaylistPickerOpen(false);
                Toast.success(
                    (I18n.t("fullscreen.controls.playlistAdded") || "Added to {playlist}.")
                        .replace("{playlist}", playlist.name || "playlist")
                );
            } catch (error) {
                console.warn("[FullscreenOverlay] Failed to update playlist track:", error);
                Toast.error(
                    attemptedPlaylistRemoval
                        ? (I18n.t("fullscreen.controls.playlistRemoveFailed") || "Failed to remove from playlist.")
                        : (I18n.t("fullscreen.controls.playlistAddFailed") || "Failed to add to playlist.")
                );
            } finally {
                setAddingPlaylistId("");
            }
        }, [addingPlaylistId, playlistTrackStatus, playlistTrackUri]);

        if (!show) return null;

        const buttonStyle = useMemo(() => ({
            width: `${buttonSize}px`,
            height: `${buttonSize}px`
        }), [buttonSize]);
        const mainButtonStyle = useMemo(() => ({
            width: `${buttonSize + 12}px`,
            height: `${buttonSize + 12}px`
        }), [buttonSize]);
        const smallButtonStyle = useMemo(() => ({
            width: `${buttonSize - 4}px`,
            height: `${buttonSize - 4}px`
        }), [buttonSize]);

        const handleVolumeChange = (e) => {
            const newVolume = parseFloat(e.target.value);
            setVolume(newVolume);
            Spicetify.Player.setVolume(newVolume);
            setIsMuted(newVolume === 0);

            setIsVolumeChanging(true);
            if (volumeChangeTimeoutRef.current) clearTimeout(volumeChangeTimeoutRef.current);
            volumeChangeTimeoutRef.current = setTimeout(() => setIsVolumeChanging(false), 1000);
        };

        const handleVolumeWheel = (e) => {
            if (!isVolumeHovered) return;
            e.preventDefault();
            const step = 0.05;
            const delta = e.deltaY > 0 ? -step : step;
            const newVolume = Math.min(1, Math.max(0, volume + delta));

            setVolume(newVolume);
            Spicetify.Player.setVolume(newVolume);
            setIsMuted(newVolume === 0);

            setIsVolumeChanging(true);
            if (volumeChangeTimeoutRef.current) clearTimeout(volumeChangeTimeoutRef.current);
            volumeChangeTimeoutRef.current = setTimeout(() => setIsVolumeChanging(false), 1000);
        };

        const toggleMute = () => {
            if (isMuted || volume === 0) {
                const newVol = 0.5;
                Spicetify.Player.setVolume(newVol);
                setVolume(newVol);
                setIsMuted(false);
            } else {
                Spicetify.Player.setVolume(0);
                setVolume(0);
                setIsMuted(true);
            }
        };

        return react.createElement("div", {
            className: `fullscreen-player-controls ${showBackground ? 'with-background' : ''}`
        },
            // Main control row: like, shuffle, prev, play, next, repeat, add-to-playlist
            react.createElement("div", { className: "fullscreen-control-row fullscreen-control-main-row" },
                // Like button (left side)
                react.createElement("button", {
                    className: `fullscreen-control-btn fullscreen-like-btn ${isLiked ? 'liked' : ''}`,
                    style: smallButtonStyle,
                    onClick: toggleLike,
                    title: isLiked ? I18n.t("fullscreen.controls.unlike") : I18n.t("fullscreen.controls.like")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: isLiked ? "currentColor" : "none",
                        stroke: "currentColor",
                        strokeWidth: isLiked ? "0" : "1.5",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["heart"] }
                    })
                ),
                // Shuffle
                react.createElement("button", {
                    className: `fullscreen-control-btn ${isShuffle ? 'active' : ''}`,
                    style: smallButtonStyle,
                    onClick: () => {
                        Spicetify.Player.setShuffle(!isShuffle);
                        setIsShuffle(!isShuffle);
                    },
                    title: I18n.t("fullscreen.controls.shuffle")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons.shuffle }
                    })
                ),
                // Previous
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: buttonStyle,
                    onClick: () => Spicetify.Player.back(),
                    title: I18n.t("fullscreen.controls.previous")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["skip-back"] }
                    })
                ),
                // Play/Pause (main button)
                react.createElement("button", {
                    className: "fullscreen-control-btn fullscreen-control-play",
                    style: mainButtonStyle,
                    onClick: () => Spicetify.Player.togglePlay(),
                    title: isPlaying ? I18n.t("fullscreen.controls.pause") : I18n.t("fullscreen.controls.play")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: isPlaying ? Spicetify.SVGIcons.pause : Spicetify.SVGIcons.play }
                    })
                ),
                // Next
                react.createElement("button", {
                    className: "fullscreen-control-btn",
                    style: buttonStyle,
                    onClick: () => Spicetify.Player.next(),
                    title: I18n.t("fullscreen.controls.next")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: Spicetify.SVGIcons["skip-forward"] }
                    })
                ),
                // Repeat
                react.createElement("button", {
                    className: `fullscreen-control-btn ${repeatMode > 0 ? 'active' : ''}`,
                    style: smallButtonStyle,
                    onClick: cycleRepeat,
                    title: repeatMode === 0 ? I18n.t("fullscreen.controls.repeatOff") : repeatMode === 1 ? I18n.t("fullscreen.controls.repeatAll") : I18n.t("fullscreen.controls.repeatOne")
                },
                    react.createElement("svg", {
                        viewBox: "0 0 16 16",
                        fill: "currentColor",
                        dangerouslySetInnerHTML: { __html: repeatMode === 2 ? (Spicetify.SVGIcons["repeat-once"] || Spicetify.SVGIcons.repeat) : Spicetify.SVGIcons.repeat }
                    })
                ),
                // Add to playlist
                react.createElement("div", {
                    className: "fullscreen-playlist-control",
                    ref: playlistPickerRef
                },
                    react.createElement("button", {
                        className: `fullscreen-control-btn ${isPlaylistPickerOpen ? 'active' : ''}`,
                        style: smallButtonStyle,
                        onClick: togglePlaylistPicker,
                        title: I18n.t("fullscreen.controls.addToPlaylist") || "Add to playlist",
                        "aria-haspopup": "menu",
                        "aria-expanded": isPlaylistPickerOpen ? "true" : "false"
                    },
                        react.createElement("svg", {
                            viewBox: "0 0 24 24",
                            fill: "none",
                            stroke: "currentColor",
                            strokeWidth: "2",
                            strokeLinecap: "round",
                            strokeLinejoin: "round",
                            dangerouslySetInnerHTML: { __html: PLAYLIST_ADD_ICON_PATH }
                        })
                    ),
                    isPlaylistPickerOpen && react.createElement("div", {
                        className: "fullscreen-playlist-popover",
                        role: "menu"
                    },
                        react.createElement("div", { className: "fullscreen-playlist-popover-title" },
                            I18n.t("fullscreen.controls.addToPlaylist") || "Add to playlist"
                        ),
                        isPlaylistsLoading && react.createElement("div", { className: "fullscreen-playlist-state" },
                            I18n.t("fullscreen.controls.playlistLoading") || "Loading playlists..."
                        ),
                        !isPlaylistsLoading && playlistError && react.createElement("div", { className: "fullscreen-playlist-state error" }, playlistError),
                        !isPlaylistsLoading && !playlistError && playlists.map((playlist) => {
                            const playlistState = playlistTrackStatus[playlist.id];
                            const playlistStatus = getPlaylistStatusValue(playlistState);
                            const isCheckingPlaylist = playlistStatus === "checking";
                            const alreadyContainsTrack = playlistStatus === "contains";
                            const isAddingPlaylist = addingPlaylistId === playlist.id;

                            return react.createElement("button", {
                                key: playlist.id,
                                className: `fullscreen-playlist-item ${alreadyContainsTrack ? 'contains-current-track' : ''}`,
                                onClick: () => handlePlaylistItemAction(playlist),
                                disabled: !!addingPlaylistId || isCheckingPlaylist,
                                role: "menuitem"
                            },
                                playlist.image
                                    ? react.createElement("img", {
                                        src: playlist.image,
                                        className: "fullscreen-playlist-item-image",
                                        alt: ""
                                    })
                                    : react.createElement("span", { className: "fullscreen-playlist-item-fallback" }, "♪"),
                                react.createElement("span", { className: "fullscreen-playlist-item-text" },
                                    react.createElement("span", { className: "fullscreen-playlist-item-name" }, playlist.name),
                                    react.createElement("span", { className: "fullscreen-playlist-item-count" },
                                        `${playlist.total} ${I18n.t("fullscreen.controls.playlistTracks") || "tracks"}`
                                    )
                                ),
                                isAddingPlaylist
                                    ? react.createElement("span", { className: "fullscreen-playlist-item-loading" }, "...")
                                    : isCheckingPlaylist
                                        ? react.createElement("span", { className: "fullscreen-playlist-item-status checking" },
                                            I18n.t("fullscreen.controls.playlistChecking") || "Checking..."
                                        )
                                        : alreadyContainsTrack && react.createElement("span", { className: "fullscreen-playlist-item-status contains" },
                                            react.createElement("span", { className: "fullscreen-playlist-item-status-default" },
                                                I18n.t("fullscreen.controls.playlistAlreadyInList") || "Already in"
                                            ),
                                            react.createElement("span", { className: "fullscreen-playlist-item-status-remove" },
                                                I18n.t("fullscreen.controls.playlistRemove") || "Remove"
                                            )
                                        )
                            );
                        })
                    )
                )
            ),
            // Volume row
            showVolume && react.createElement("div", { className: "fullscreen-control-row fullscreen-control-volume-row" },
                react.createElement("div", {
                    className: "fullscreen-volume-wrapper",
                    onMouseEnter: () => setIsVolumeHovered(true),
                    onMouseLeave: () => setIsVolumeHovered(false),
                    onWheel: handleVolumeWheel
                },
                    react.createElement("button", {
                        className: "fullscreen-control-btn",
                        style: smallButtonStyle,
                        onClick: toggleMute,
                        title: isMuted ? I18n.t("fullscreen.controls.unmute") : I18n.t("fullscreen.controls.mute")
                    },
                        react.createElement("svg", {
                            viewBox: "0 0 16 16",
                            fill: "currentColor",
                            dangerouslySetInnerHTML: {
                                __html: (isMuted || volume === 0)
                                    ? Spicetify.SVGIcons["volume-off"]
                                    : volume < 0.5
                                        ? Spicetify.SVGIcons["volume-one-wave"]
                                        : Spicetify.SVGIcons["volume-two-wave"]
                            }
                        })
                    ),
                    react.createElement("input", {
                        type: "range",
                        className: "fullscreen-volume-slider",
                        min: 0,
                        max: 1,
                        step: 0.01,
                        value: volume,
                        onChange: handleVolumeChange
                    }),
                    (isVolumeChanging || isVolumeHovered) && react.createElement("span", {
                        className: "fullscreen-volume-percent",
                        style: {
                            marginLeft: "8px",
                            minWidth: "35px",
                            textAlign: "left",
                            fontSize: "12px",
                            opacity: 0.8
                        }
                    }, `${Math.round(volume * 100)}%`)
                )
            )
        );
    };

    // Lyrics Progress Indicator
    const LyricsProgress = ({ show, currentLine, totalLines }) => {
        if (!show || totalLines <= 0) return null;

        const percent = Math.round(((currentLine + 1) / totalLines) * 100);

        return react.createElement("div", { className: "fullscreen-lyrics-progress" },
            react.createElement("div", { className: "fullscreen-lyrics-progress-bar" },
                react.createElement("div", {
                    className: "fullscreen-lyrics-progress-fill",
                    style: { transform: `scaleX(${Math.max(0, Math.min(1, percent / 100))})` }
                })
            ),
            react.createElement("span", { className: "fullscreen-lyrics-progress-text" },
                `${currentLine + 1} / ${totalLines}`
            )
        );
    };

    const renderQueueItem = (track, key, onTrackClick) => react.createElement("div", {
        key,
        className: "fullscreen-queue-item",
        onClick: () => onTrackClick(track)
    },
        track.image && react.createElement("img", {
            src: track.image,
            className: "fullscreen-queue-item-image"
        }),
        react.createElement("div", { className: "fullscreen-queue-item-info" },
            react.createElement("div", { className: "fullscreen-queue-item-title" }, track.title),
            react.createElement("div", { className: "fullscreen-queue-item-artist" }, track.artist)
        )
    );

    // Queue Panel Component - 오른쪽 hover 시 재생 대기열 표시
    const QueuePanel = ({ show, isFullscreen }) => {
        const [isHovered, setIsHovered] = useState(false);
        const [currentTrack, setCurrentTrack] = useState(null);
        const [nextTracks, setNextTracks] = useState([]);
        const [recentTracks, setRecentTracks] = useState([]);
        const [activeTab, setActiveTab] = useState('queue'); // 'queue' or 'recent'
        const nextTracksRef = useRef([]);
        const emptyQueueTimerRef = useRef(null);
        const queuePlayRequestSeqRef = useRef(0);

        const commitNextTracks = useCallback((tracks, { deferEmpty = false } = {}) => {
            const next = Array.isArray(tracks) ? tracks : [];
            if (deferEmpty && next.length === 0 && nextTracksRef.current.length > 0) {
                if (emptyQueueTimerRef.current) {
                    clearTimeout(emptyQueueTimerRef.current);
                }
                emptyQueueTimerRef.current = setTimeout(() => {
                    emptyQueueTimerRef.current = null;
                    nextTracksRef.current = [];
                    setNextTracks((prev) => prev.length === 0 ? prev : []);
                }, QUEUE_EMPTY_GRACE_MS);
                return;
            }

            if (emptyQueueTimerRef.current) {
                clearTimeout(emptyQueueTimerRef.current);
                emptyQueueTimerRef.current = null;
            }
            nextTracksRef.current = next;
            setNextTracks((prev) => areTrackListsEqual(prev, next) ? prev : next);
        }, []);

        // 재생 대기열 업데이트
        useEffect(() => {
            if (!show || !isFullscreen) return;

            const updateQueue = (queueData = null) => {
                try {
                    const playerData = Spicetify.Player.data;
                    const currentContextUri =
                        playerData?.context?.uri ||
                        playerData?.item?.metadata?.context_uri ||
                        "";
                    const queueState = queueData?.data || Spicetify.Queue || {};
                    const prevSource = queueState.prevTracks || Spicetify.Queue?.prevTracks || [];

                    // 현재 재생 중인 곡
                    if (playerData?.item) {
                        const meta = playerData.item.metadata;
                        const currentTrackData = {
                            title: meta?.title || "Unknown",
                            artist: meta?.artist_name || "Unknown",
                            image: meta?.image_url || "",
                            uri: playerData.item.uri
                        };
                        setCurrentTrack((prev) => areTrackInfoEqual(prev, currentTrackData) ? prev : currentTrackData);
                    }

                    // 다음 곡들 (최대 15곡) - Unknown 트랙 이후 필터링
                    const next = [];
                    const appendNextTracks = (items, source, allowContextPlayback = true) => {
                        if (!Array.isArray(items) || next.length >= 15) {
                            return false;
                        }

                        // Unknown 트랙의 인덱스 찾기 (컨텍스트 끝 마커)
                        for (const track of items) {
                            const contextTrack = track?.contextTrack || track || {};
                            const meta = contextTrack.metadata || track?.metadata || {};
                            if (isUnknownTrackMetadata(meta)) {
                                return true;
                            }

                            next.push(createQueueTrackInfo(
                                meta,
                                {
                                    uri: contextTrack.uri || track?.uri || "",
                                    uid: contextTrack.uid || track?.uid || "",
                                    contextUri:
                                        contextTrack.contextUri ||
                                        contextTrack.context_uri ||
                                        contextTrack.context?.uri ||
                                        track?.contextUri ||
                                        track?.context_uri ||
                                        track?.context?.uri ||
                                        ""
                                },
                                {
                                    source,
                                    fallbackContextUri: currentContextUri,
                                    allowFallbackContext: false,
                                    allowContextPlayback,
                                    index: next.length + 1
                                }
                            ));

                            if (next.length >= 15) {
                                return true;
                            }
                        }
                        return false;
                    };

                    const hasModernQueueShape =
                        Array.isArray(queueState?.queued) || Array.isArray(queueState?.nextUp);
                    if (hasModernQueueShape) {
                        const stopped = appendNextTracks(queueState.queued || [], "queued", false);
                        if (!stopped) {
                            appendNextTracks(queueState.nextUp || [], "nextUp", true);
                        }
                    } else {
                        appendNextTracks(queueState.nextTracks || [], "nextTracks", true);
                    }
                    commitNextTracks(next, { deferEmpty: true });

                    // 최근 재생 곡들 (이전 곡 기록)
                    if (prevSource.length > 0) {
                        const prev = [];
                        for (let i = prevSource.length - 1; i >= 0 && prev.length < 10; i--) {
                            const track = prevSource[i];
                            const contextTrack = track?.contextTrack || track || {};
                            const meta = contextTrack.metadata || track?.metadata || {};
                            prev.push(createQueueTrackInfo(
                                meta,
                                {
                                    uri: contextTrack.uri || track?.uri || "",
                                    uid: contextTrack.uid || track?.uid || "",
                                    contextUri:
                                        contextTrack.contextUri ||
                                        contextTrack.context_uri ||
                                        contextTrack.context?.uri ||
                                        track?.contextUri ||
                                        track?.context_uri ||
                                        track?.context?.uri ||
                                        ""
                                },
                                {
                                    source: "recent",
                                    fallbackContextUri: currentContextUri,
                                    allowFallbackContext: false,
                                    allowContextPlayback: false,
                                    index: prev.length + 1
                                }
                            ));
                        }
                        setRecentTracks((current) => areTrackListsEqual(current, prev) ? current : prev);
                    } else {
                        setRecentTracks((current) => current.length === 0 ? current : []);
                    }
                } catch (e) {
                    console.warn('[FullscreenOverlay] Queue update failed:', e);
                }
            };

            updateQueue();
            // 백업용 interval (이벤트 기반 업데이트가 주, interval은 보조)
            const interval = setInterval(updateQueue, 5000);

            // 곡 변경 이벤트 리스너 (주요 업데이트 트리거)
            const songChangeHandler = () => updateQueue();
            Spicetify.Player.addEventListener("songchange", songChangeHandler);
            const queueUpdateHandler = (payload) => updateQueue(payload);
            Spicetify.Player.origin?._events?.addListener?.("queue_update", queueUpdateHandler);

            return () => {
                clearInterval(interval);
                if (emptyQueueTimerRef.current) {
                    clearTimeout(emptyQueueTimerRef.current);
                    emptyQueueTimerRef.current = null;
                }
                Spicetify.Player.removeEventListener("songchange", songChangeHandler);
                Spicetify.Player.origin?._events?.removeListener?.("queue_update", queueUpdateHandler);
            };
        }, [show, isFullscreen, commitNextTracks]);

        // 곡 클릭 시 재생
        const handleTrackClick = useCallback((track) => {
            if (!track?.uri) return;
            try {
                const selectedIndex = nextTracks.findIndex((t) =>
                    (track.key && t.key === track.key) ||
                    (track.uid && t.uid === track.uid) || t.uri === track.uri
                );
                if (selectedIndex >= 0) {
                    const selected = nextTracks[selectedIndex];
                    const selectedTrackData = {
                        title: selected.title || "Unknown",
                        artist: selected.artist || "Unknown",
                        image: selected.image || "",
                        uri: selected.uri
                    };
                    setCurrentTrack((prev) => areTrackInfoEqual(prev, selectedTrackData) ? prev : selectedTrackData);
                    const remainingTracks = nextTracks.slice(selectedIndex + 1);
                    commitNextTracks(remainingTracks);
                }
                const contextUri = track.canPlayInContext ? track.contextUri : "";
                const playDirectly = () => Spicetify.Player.playUri(track.uri);
                const playRequestSeq = ++queuePlayRequestSeqRef.current;

                if (contextUri) {
                    const options = { skipTo: { uri: track.uri } };
                    if (track.uid) {
                        options.skipTo.uid = track.uid;
                    }
                    Spicetify.Player.playUri(contextUri, {}, options);
                    setTimeout(() => {
                        if (queuePlayRequestSeqRef.current !== playRequestSeq) {
                            return;
                        }
                        const activeUri = Spicetify.Player.data?.item?.uri || "";
                        if (activeUri !== track.uri) {
                            playDirectly();
                        }
                    }, 900);
                    return;
                }

                playDirectly();
            } catch (e) {
                console.warn('[FullscreenOverlay] Failed to play track:', e);
            }
        }, [nextTracks, commitNextTracks]);

        const upNextTracks = useMemo(
            () => nextTracks.filter((track) => !isRecommendedQueueTrack(track)),
            [nextTracks]
        );
        const recommendedTracks = useMemo(
            () => nextTracks.filter(isRecommendedQueueTrack),
            [nextTracks]
        );

        if (!show || !isFullscreen) return null;

        return react.createElement("div", {
            className: "fullscreen-queue-wrapper",
            onMouseLeave: () => setIsHovered(false)
        },
            // Hover trigger area (투명한 오른쪽 영역)
            react.createElement("div", {
                className: "fullscreen-queue-trigger-area",
                onMouseEnter: () => setIsHovered(true)
            }),

            // Queue panel (항상 렌더링, visible 클래스로 애니메이션 제어)
            react.createElement("div", {
                className: `fullscreen-queue-panel ${isHovered ? 'visible' : ''}`,
                onMouseEnter: () => setIsHovered(true)
            },
                // Content
                react.createElement("div", { className: "fullscreen-queue-content" },
                    activeTab === 'queue' ? react.createElement(react.Fragment, null,
                        // 현재 재생 중
                        currentTrack && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                I18n.t("fullscreen.queue.nowPlaying")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                react.createElement("div", { className: "fullscreen-queue-item current" },
                                    currentTrack.image && react.createElement("img", {
                                        src: currentTrack.image,
                                        className: "fullscreen-queue-item-image"
                                    }),
                                    react.createElement("div", { className: "fullscreen-queue-item-info" },
                                        react.createElement("div", { className: "fullscreen-queue-item-title" }, currentTrack.title),
                                        react.createElement("div", { className: "fullscreen-queue-item-artist" }, currentTrack.artist)
                                    ),
                                    react.createElement("div", { className: "fullscreen-queue-item-playing" },
                                        react.createElement("span", { className: "fullscreen-queue-playing-icon" }, "♪")
                                    )
                                )
                            )
                        ),

                        // 다음 재생 곡들
                        upNextTracks.length > 0 && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                I18n.t("fullscreen.queue.upNext")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                upNextTracks.map((track, idx) =>
                                    renderQueueItem(track, track.key || `next-${track.uid || track.uri || idx}`, handleTrackClick)
                                )
                            )
                        ),

                        // 추천곡
                        recommendedTracks.length > 0 && react.createElement("div", { className: "fullscreen-queue-section" },
                            react.createElement("div", { className: "fullscreen-queue-section-title" },
                                I18n.t("fullscreen.queue.recommended")
                            ),
                            react.createElement("div", { className: "fullscreen-queue-list" },
                                recommendedTracks.map((track, idx) =>
                                    renderQueueItem(track, track.key || `recommended-${track.uid || track.uri || idx}`, handleTrackClick)
                                )
                            )
                        ),

                        // 대기열이 비어있는 경우
                        nextTracks.length === 0 && react.createElement("div", { className: "fullscreen-queue-empty" },
                            I18n.t("fullscreen.queue.empty")
                        )
                    ) : react.createElement(react.Fragment, null,
                        // 최근 재생 곡들
                        recentTracks.length > 0 ? react.createElement("div", { className: "fullscreen-queue-list" },
                            recentTracks.map((track, idx) =>
                                renderQueueItem(track, `recent-${idx}`, handleTrackClick)
                            )
                        ) : react.createElement("div", { className: "fullscreen-queue-empty" },
                            I18n.t("fullscreen.queue.noRecent")
                        )
                    )
                ),

                // Footer with tabs (하단에 탭 버튼)
                react.createElement("div", { className: "fullscreen-queue-footer" },
                    react.createElement("button", {
                        className: `fullscreen-queue-tab ${activeTab === 'queue' ? 'active' : ''}`,
                        type: "button",
                        "aria-pressed": activeTab === 'queue',
                        onClick: () => setActiveTab('queue')
                    }, I18n.t("fullscreen.queue.title")),
                    react.createElement("button", {
                        className: `fullscreen-queue-tab ${activeTab === 'recent' ? 'active' : ''}`,
                        type: "button",
                        "aria-pressed": activeTab === 'recent',
                        onClick: () => setActiveTab('recent')
                    }, I18n.t("fullscreen.queue.recentlyPlayed"))
                )
            )
        );
    };

    const ResearchTokenConsentDialog = react.memo(({ onAgree, onCancel }) => {
        const dialogRef = useRef(null);
        const agreeButtonRef = useRef(null);

        useEffect(() => {
            const previouslyFocused = document.activeElement;
            const focusFrame = window.requestAnimationFrame(() => agreeButtonRef.current?.focus?.());
            const handleKeyDown = (event) => {
                if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    onCancel();
                    return;
                }

                if (event.key !== "Tab") return;
                const focusable = Array.from(dialogRef.current?.querySelectorAll?.("button:not(:disabled)") || []);
                if (focusable.length === 0) return;

                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (event.shiftKey && document.activeElement === first) {
                    event.preventDefault();
                    last.focus();
                } else if (!event.shiftKey && document.activeElement === last) {
                    event.preventDefault();
                    first.focus();
                }
            };

            window.addEventListener("keydown", handleKeyDown, true);
            return () => {
                window.cancelAnimationFrame(focusFrame);
                window.removeEventListener("keydown", handleKeyDown, true);
                previouslyFocused?.focus?.();
            };
        }, [onCancel]);

        return react.createElement("div", {
            className: "research-consent-overlay",
            onMouseDown: (event) => {
                if (event.target === event.currentTarget) onCancel();
            }
        },
            react.createElement("section", {
                ref: dialogRef,
                className: "research-consent-dialog",
                role: "dialog",
                "aria-modal": "true",
                "aria-labelledby": "research-consent-title",
                "aria-describedby": "research-consent-description research-consent-note"
            },
                react.createElement("div", {
                    className: "research-consent-icon",
                    "aria-hidden": "true"
                },
                    react.createElement("svg", {
                        viewBox: "0 0 24 24",
                        width: 24,
                        height: 24,
                        fill: "none",
                        stroke: "currentColor",
                        strokeWidth: 1.8,
                        strokeLinecap: "round",
                        strokeLinejoin: "round"
                    },
                        react.createElement("path", { d: "M10.3 3.7 2.5 17.2A2 2 0 0 0 4.2 20h15.6a2 2 0 0 0 1.7-2.8L13.7 3.7a2 2 0 0 0-3.4 0Z" }),
                        react.createElement("path", { d: "M12 9v4" }),
                        react.createElement("path", { d: "M12 17h.01" })
                    )
                ),
                react.createElement("span", { className: "research-consent-eyebrow" }, I18n.t("research.title")),
                react.createElement("h2", { id: "research-consent-title" }, I18n.t("research.tokenConsentTitle")),
                react.createElement("p", {
                    id: "research-consent-description",
                    className: "research-consent-description"
                }, I18n.t("research.tokenConsentBody")),
                react.createElement("div", { className: "research-consent-note" },
                    react.createElement("span", { className: "research-consent-note-dot", "aria-hidden": "true" }),
                    react.createElement("p", { id: "research-consent-note" }, I18n.t("research.tokenConsentNote"))
                ),
                react.createElement("div", { className: "research-consent-actions" },
                    react.createElement("button", {
                        type: "button",
                        className: "research-consent-button research-consent-button-secondary",
                        onClick: onCancel
                    }, I18n.t("research.cancel")),
                    react.createElement("button", {
                        ref: agreeButtonRef,
                        type: "button",
                        className: "research-consent-button research-consent-button-primary",
                        onClick: onAgree
                    }, I18n.t("research.tokenConsentAgree"))
                )
            )
        );
    });

    // Center standard fullscreen lyrics in the space beside the rendered album,
    // including configured album sizes and the album's visibility transforms.
    // Keep observation away from the frequently changing karaoke subtree.
    const observeFullscreenAlbumLyricsRegion = (panel) => {
        const root = panel?.closest?.(".lyrics-lyricsContainer-LyricsContainer");
        if (!root) return () => {};
        const view = panel.ownerDocument?.defaultView || window;
        const attribute = "data-album-centered-lyrics";
        const leftVariable = "--lyrics-fullscreen-region-left";
        const rightVariable = "--lyrics-fullscreen-region-right";
        const excludedClasses = [
            "tv-mode-active", "portrait-mode", "fullscreen-single-column",
            "fullscreen-focus-active", "fullscreen-no-lyrics", "marketplace-active",
        ];
        let frame = null;
        let disposed = false;
        let observedAlbum = null;
        let resizeObserver = null;
        const reset = () => {
            if (root.hasAttribute(attribute)) root.removeAttribute(attribute);
            for (const name of [leftVariable, rightVariable]) {
                if (root.style.getPropertyValue(name)) root.style.removeProperty(name);
            }
        };
        const measure = () => {
            frame = null;
            if (disposed) return;
            const album = panel.querySelector(".lyrics-fullscreen-album-art");
            if (album !== observedAlbum) {
                if (observedAlbum) resizeObserver?.unobserve(observedAlbum);
                observedAlbum = album;
                if (album) resizeObserver?.observe(album);
            }
            if (!root.isConnected || !panel.isConnected ||
                !root.classList.contains("fullscreen-active") ||
                excludedClasses.some(name => root.classList.contains(name)) ||
                panel.classList.contains("tmi-mode") ||
                (CONFIG?.visual?.alignment || "center") !== "center" || !album) {
                reset();
                return;
            }
            const rootBox = root.getBoundingClientRect();
            const albumBox = album.getBoundingClientRect();
            const albumStyle = view.getComputedStyle(album);
            if (rootBox.width <= 0 || rootBox.height <= 0 ||
                albumBox.width <= 0 || albumBox.height <= 0 ||
                albumStyle.visibility === "hidden" || albumStyle.visibility === "collapse" ||
                albumStyle.display === "none") {
                reset();
                return;
            }
            const reversed = root.classList.contains("layout-reversed");
            const inset = reversed
                ? rootBox.right - albumBox.left
                : albumBox.right - rootBox.left;
            if (!Number.isFinite(inset) || inset <= 0 || inset >= rootBox.width) {
                reset();
                return;
            }
            const insets = reversed ? [0, inset] : [inset, 0];
            for (const [index, name] of [leftVariable, rightVariable].entries()) {
                const value = `${Math.round(insets[index] * 1000) / 1000}px`;
                if (root.style.getPropertyValue(name) !== value) root.style.setProperty(name, value);
            }
            if (root.getAttribute(attribute) !== "true") root.setAttribute(attribute, "true");
        };
        const schedule = () => {
            if (!disposed && frame === null) frame = view.requestAnimationFrame(measure);
        };
        if (typeof view.ResizeObserver === "function") {
            resizeObserver = new view.ResizeObserver(schedule);
            resizeObserver.observe(root);
            resizeObserver.observe(panel);
        }
        const mutationObserver = typeof view.MutationObserver === "function"
            ? new view.MutationObserver(schedule)
            : null;
        mutationObserver?.observe(root, { attributes: true, attributeFilter: ["class", "style"] });
        mutationObserver?.observe(panel, {
            attributes: true, attributeFilter: ["class", "style", "hidden"],
            childList: true, subtree: true,
        });
        // ResizeObserver does not report CSS transforms. Recheck their settled
        // image edge after hover and controls-hidden transitions, without polling.
        panel.addEventListener("transitionend", schedule);
        panel.addEventListener("transitioncancel", schedule);
        view.addEventListener("resize", schedule);
        schedule();
        return () => {
            disposed = true;
            if (frame !== null) view.cancelAnimationFrame(frame);
            mutationObserver?.disconnect();
            resizeObserver?.disconnect();
            panel.removeEventListener("transitionend", schedule);
            panel.removeEventListener("transitioncancel", schedule);
            view.removeEventListener("resize", schedule);
            reset();
        };
    };

    // Main Overlay Component
    const Overlay = ({
        coverUrl,
        title,
        artist,
        isFullscreen,
        currentLyricIndex = 0,
        totalLyrics = 0,
        activeLyric = "",
        activeLyrics = [],
        activeLyricsKaraoke = false,
        karaokeSource = null,
        lyricsSettingsRevision = 0,
        translatedMetadata = null,
        trackUri = null,
        trackAccent = "",
        trackAccentUri = "",
        presentationMode = "standard",
        onPresentationModeChange = null,
        onExitFullscreen = null
    }) => {
        const [uiVisible, setUiVisible] = useState(true);
        const [tmiMode, setTmiMode] = useState(false);
        const [tmiData, setTmiData] = useState(null);
        const [tmiLoading, setTmiLoading] = useState(false);
        const [tmiWebSearchFallback, setTmiWebSearchFallback] = useState(false);
        const [researchConsentAccepted, setResearchConsentAccepted] = useState(hasResearchTokenConsent);
        const [showResearchConsent, setShowResearchConsent] = useState(false);
        const [lpModeClosing, setLpModeClosing] = useState(false);
        const [isPlaying, setIsPlaying] = useState(false);
        const [position, setPosition] = useState(0);
        const [duration, setDuration] = useState(0);
        const [, setMetadataRevision] = useState(0);
        const metadataSnapshotRef = useRef(null);
        const albumLyricsRegionCleanupRef = useRef(null);
        const setAlbumLyricsPanelRef = useCallback((panel) => {
            albumLyricsRegionCleanupRef.current?.();
            albumLyricsRegionCleanupRef.current = panel
                ? observeFullscreenAlbumLyricsRegion(panel)
                : null;
        }, []);
        const [isPortraitViewport, setIsPortraitViewport] = useState(() => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
                return false;
            }
            return window.matchMedia("(orientation: portrait)").matches;
        });
        const hideTimerRef = useRef(null);
        const uiVisibleRef = useRef(true);
        const tmiOpeningRef = useRef(false);
        const tmiRequestRef = useRef(0);
        const tmiPlaybackGuardRef = useRef({
            active: false,
            previousRepeat: null,
            trackUri: ""
        });
        const albumPressTimerRef = useRef(null);
        const albumPressStartRef = useRef(null);
        const suppressAlbumClickRef = useRef(false);
        const suppressAlbumClickTimerRef = useRef(null);
        const lpModeExitTimerRef = useRef(null);
        const lpViewTransitionRef = useRef(null);
        const normalizedPresentationMode = normalizeFocusedPresentation(
            presentationMode
        );
        const presentationModeActive =
            normalizedPresentationMode !== "standard";
        const focusModeActive =
            normalizedPresentationMode === "vinyl"
            || normalizedPresentationMode === "video";
        const compactPresentationActive =
            normalizedPresentationMode === "compact-vinyl";

        const runLpSharedTransition = useCallback((direction, updateMode) => {
            const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
            const animationsEnabled = CONFIG?.visual?.["fullscreen-vinyl-animations"] !== false;
            if (!animationsEnabled || reducedMotion || typeof document?.startViewTransition !== "function") return false;
            if (lpViewTransitionRef.current) return true;

            const root = document.documentElement;
            const directionClass = "is-lp-view-" + direction;
            root.classList.add("is-lp-view-transition", directionClass);
            let committed = false;
            let transition = null;
            const cleanup = () => {
                if (lpViewTransitionRef.current === transition) lpViewTransitionRef.current = null;
                root.classList.remove("is-lp-view-transition", directionClass);
            };

            try {
                transition = document.startViewTransition(() => {
                    const reactDom = window.ivLyricsEnsureReactDOM?.()
                        || window.Spicetify?.ReactDOM
                        || window.ReactDOM;
                    if (typeof reactDom?.flushSync === "function") {
                        reactDom.flushSync(updateMode);
                        committed = true;
                        return undefined;
                    }

                    updateMode();
                    committed = true;
                    return new Promise((resolve) => window.requestAnimationFrame(resolve));
                });
                lpViewTransitionRef.current = transition;
                Promise.resolve(transition.finished).catch(() => undefined).finally(cleanup);
                return true;
            } catch (_) {
                cleanup();
                if (!committed) updateMode();
                return true;
            }
        }, []);

        const navigateSpotifyUri = useCallback((uri) => {
            const path = spotifyUriToPath(uri);
            if (!path) return;

            onExitFullscreen?.();
            setTimeout(() => {
                Spicetify.Platform?.History?.push?.(path);
            }, 0);
        }, [onExitFullscreen]);

        const createNavigationProps = useCallback((uri, className) => {
            const path = spotifyUriToPath(uri);
            if (!path) {
                return { className };
            }

            const handleNavigate = (event) => {
                event?.preventDefault?.();
                event?.stopPropagation?.();
                navigateSpotifyUri(uri);
            };

            return {
                className: `${className} fullscreen-navigation-link`,
                role: "link",
                tabIndex: 0,
                onClick: handleNavigate,
                onKeyDown: (event) => {
                    if (event.key === "Enter" || event.key === " ") {
                        handleNavigate(event);
                    }
                }
            };
        }, [navigateSpotifyUri]);

        // Standard and compact layouts own progress in ProgressBar; changing
        // unused root position state would rebuild the entire overlay twice a second.
        const trackRootPosition = isFullscreen && (
            CONFIG?.visual?.["fullscreen-tv-mode"] === true
                ? CONFIG?.visual?.["fullscreen-tv-show-progress"] !== false
                : focusModeActive && !tmiMode
        );
        useEffect(() => {
            const updatePlaybackState = () => {
                const isPaused = Spicetify.Player?.data?.isPaused ?? true;
                setIsPlaying(!isPaused);
                if (trackRootPosition) {
                    setPosition(Spicetify.Player?.getProgress?.() || 0);
                }
                setDuration(Spicetify.Player?.data?.item?.metadata?.duration_ms || Spicetify.Player?.getDuration?.() || 0);

                const nextMetadata = getOverlayMetadataSnapshot();
                const previousMetadata = metadataSnapshotRef.current;
                metadataSnapshotRef.current = nextMetadata;
                if (previousMetadata && nextMetadata.some((value, index) => !Object.is(value, previousMetadata[index]))) {
                    setMetadataRevision((revision) => revision + 1);
                }
            };

            updatePlaybackState();

            const updateInterval = 500;
            const intervalId = setInterval(updatePlaybackState, updateInterval);

            Spicetify.Player?.addEventListener?.("songchange", updatePlaybackState);
            Spicetify.Player?.addEventListener?.("onplaypause", updatePlaybackState);

            return () => {
                clearInterval(intervalId);
                Spicetify.Player?.removeEventListener?.("songchange", updatePlaybackState);
                Spicetify.Player?.removeEventListener?.("onplaypause", updatePlaybackState);
            };
        }, [trackRootPosition]);

        useEffect(() => {
            uiVisibleRef.current = uiVisible;
        }, [uiVisible]);

        // Get settings from CONFIG
        const showAlbum = CONFIG?.visual?.["fullscreen-show-album"] !== false;
        const showInfo = CONFIG?.visual?.["fullscreen-show-info"] !== false;
        const albumSize = Number(CONFIG?.visual?.["fullscreen-album-size"]) || 400;
        const albumRadiusValue = Number(CONFIG?.visual?.["fullscreen-album-radius"]);
        const albumRadius = isNaN(albumRadiusValue) ? 12 : albumRadiusValue;
        const vinylAnimationsEnabled = CONFIG?.visual?.["fullscreen-vinyl-animations"] !== false;
        const titleSize = Number(CONFIG?.visual?.["fullscreen-title-size"]) || 48;
        const artistSize = Number(CONFIG?.visual?.["fullscreen-artist-size"]) || 24;

        // UI element settings
        const showClock = CONFIG?.visual?.["fullscreen-show-clock"] !== false;
        const clockShowSeconds = CONFIG?.visual?.["fullscreen-clock-show-seconds"] === true;
        const clockSize = Number(CONFIG?.visual?.["fullscreen-clock-size"]) || 48;
        const showContext = CONFIG?.visual?.["fullscreen-show-context"] !== false;
        const showContextImage = CONFIG?.visual?.["fullscreen-show-context-image"] !== false;
        const showNextTrack = CONFIG?.visual?.["fullscreen-show-next-track"] !== false;
        const nextTrackSeconds = Number(CONFIG?.visual?.["fullscreen-next-track-seconds"]) || 15;
        const showControls = CONFIG?.visual?.["fullscreen-show-controls"] !== false;
        const showVolume = CONFIG?.visual?.["fullscreen-show-volume"] !== false;
        const showProgress = CONFIG?.visual?.["fullscreen-show-progress"] !== false;
        const showLyricsProgress = CONFIG?.visual?.["fullscreen-show-lyrics-progress"] === true;
        const showQueue = CONFIG?.visual?.["fullscreen-show-queue"] !== false;
        const autoHideUI = CONFIG?.visual?.["fullscreen-auto-hide-ui"] !== false;
        const autoHideDelay = (Number(CONFIG?.visual?.["fullscreen-auto-hide-delay"]) || 3) * 1000;

        // TMI Font size settings
        const tmiScale = (Number(CONFIG?.visual?.["fullscreen-tmi-font-size"]) || 100) / 100;

        // Control style settings
        const controlButtonSize = Number(CONFIG?.visual?.["fullscreen-control-button-size"]) || 36;
        const controlsBackground = CONFIG?.visual?.["fullscreen-controls-background"] === true;
        const controlsCompact = CONFIG?.visual?.["fullscreen-controls-compact"] === true;

        // Layout settings
        const controlsPosition = CONFIG?.visual?.["fullscreen-controls-position"] || "left-panel";
        const albumShadow = CONFIG?.visual?.["fullscreen-album-shadow"] !== false;
        const infoGapVal = CONFIG?.visual?.["fullscreen-info-gap"];
        const infoGap = (infoGapVal !== undefined && infoGapVal !== null) ? Number(infoGapVal) : 24;

        // TV Mode settings
        const tvModeEnabled = CONFIG?.visual?.["fullscreen-tv-mode"] === true;
        const tvAlbumSize = Number(CONFIG?.visual?.["fullscreen-tv-album-size"]) || 140;
        const trimTitleEnabled = CONFIG?.visual?.["fullscreen-trim-title"] === true;

        // Normal mode settings
        const normalShowAlbumName = CONFIG?.visual?.["fullscreen-show-album-name"] !== false;

        // TV Mode specific settings
        const tvShowAlbumName = CONFIG?.visual?.["fullscreen-tv-show-album-name"] !== false;
        const tvShowControls = CONFIG?.visual?.["fullscreen-tv-show-controls"] !== false;
        const tvShowProgress = CONFIG?.visual?.["fullscreen-tv-show-progress"] !== false;
        const isLayoutReversed = CONFIG?.visual?.["fullscreen-layout-reverse"] === true;

        useEffect(() => {
            if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

            const media = window.matchMedia("(orientation: portrait)");
            const handleChange = (event) => setIsPortraitViewport(!!event.matches);

            setIsPortraitViewport(media.matches);

            if (typeof media.addEventListener === "function") {
                media.addEventListener("change", handleChange);
                return () => media.removeEventListener("change", handleChange);
            }

            if (typeof media.addListener === "function") {
                media.addListener(handleChange);
                return () => media.removeListener(handleChange);
            }
        }, []);

        // Auto-hide UI on mouse inactivity
        useEffect(() => {
            if (!isFullscreen || !autoHideUI || showResearchConsent) {
                uiVisibleRef.current = true;
                setUiVisible(true);
                return;
            }

            const handleMouseMove = () => {
                if (!uiVisibleRef.current) {
                    uiVisibleRef.current = true;
                    setUiVisible(true);
                }
                if (hideTimerRef.current) {
                    clearTimeout(hideTimerRef.current);
                }
                hideTimerRef.current = setTimeout(() => {
                    uiVisibleRef.current = false;
                    setUiVisible(false);
                }, autoHideDelay);
            };

            hideTimerRef.current = setTimeout(() => {
                uiVisibleRef.current = false;
                setUiVisible(false);
            }, autoHideDelay);

            document.addEventListener('mousemove', handleMouseMove, { passive: true });

            return () => {
                document.removeEventListener('mousemove', handleMouseMove);
                if (hideTimerRef.current) {
                    clearTimeout(hideTimerRef.current);
                }
            };
        }, [isFullscreen, autoHideUI, autoHideDelay, showResearchConsent]);

        const clearAlbumPressTimer = useCallback(() => {
            if (albumPressTimerRef.current) {
                window.clearTimeout(albumPressTimerRef.current);
                albumPressTimerRef.current = null;
            }
            albumPressStartRef.current = null;
        }, []);

        const suppressNextAlbumClick = useCallback(() => {
            suppressAlbumClickRef.current = true;
            if (suppressAlbumClickTimerRef.current) {
                window.clearTimeout(suppressAlbumClickTimerRef.current);
            }
            suppressAlbumClickTimerRef.current = window.setTimeout(() => {
                suppressAlbumClickRef.current = false;
                suppressAlbumClickTimerRef.current = null;
            }, 800);
        }, []);

        const loadResearch = useCallback(async (trackId, regenerate = false) => {
            if (!trackId) return null;

            const requestId = ++tmiRequestRef.current;
            setTmiData(null);
            setTmiLoading(true);
            setTmiWebSearchFallback(false);

            try {
                const data = await window.SongInfoTMI?.fetchSongInfo(trackId, regenerate, {
                    onProgress: (partial, details = {}) => {
                        if (requestId !== tmiRequestRef.current) return;
                        if (details.webSearchStatus === 'fallback') {
                            setTmiWebSearchFallback(true);
                        } else if (details.webSearchStatus === 'searching') {
                            setTmiWebSearchFallback(false);
                        }
                        if (!partial || details.reset) {
                            setTmiData(null);
                            return;
                        }
                        setTmiData(partial);
                    }
                });
                if (requestId === tmiRequestRef.current) setTmiData(data);
                return data;
            } catch (error) {
                console.error('[Research] Fetch error:', error);
                if (requestId === tmiRequestRef.current) setTmiData(null);
                return null;
            } finally {
                if (requestId === tmiRequestRef.current) setTmiLoading(false);
            }
        }, []);

        const enableResearchPlaybackGuard = useCallback((researchTrackUri) => {
            const guard = tmiPlaybackGuardRef.current;

            if (!guard.active) {
                guard.active = true;
                guard.trackUri = researchTrackUri || "";

                try {
                    const currentRepeat = Number(Spicetify.Player?.getRepeat?.());
                    guard.previousRepeat = [0, 1, 2].includes(currentRepeat)
                        ? currentRepeat
                        : null;
                } catch (error) {
                    guard.previousRepeat = null;
                    console.warn("[Research] Failed to read repeat mode:", error);
                }
            }

            try {
                if (Spicetify.Player?.getRepeat?.() !== 2) {
                    Spicetify.Player?.setRepeat?.(2);
                }
            } catch (error) {
                console.warn("[Research] Failed to enable repeat-one mode:", error);
            }
        }, []);

        const restoreResearchPlaybackGuard = useCallback(() => {
            const guard = tmiPlaybackGuardRef.current;
            if (!guard.active) return;

            const previousRepeat = guard.previousRepeat;
            guard.active = false;
            guard.previousRepeat = null;
            guard.trackUri = "";

            if (previousRepeat === null) return;

            try {
                if (Spicetify.Player?.getRepeat?.() !== previousRepeat) {
                    Spicetify.Player?.setRepeat?.(previousRepeat);
                }
            } catch (error) {
                console.warn("[Research] Failed to restore repeat mode:", error);
            }
        }, []);

        const beginResearch = useCallback(async () => {
            if (tmiMode || tmiOpeningRef.current) return;

            const trackId = trackUri?.split(":")[2];
            if (!trackId) return;

            tmiOpeningRef.current = true;
            enableResearchPlaybackGuard(trackUri);
            setTmiMode(true);

            try {
                await loadResearch(trackId);
            } finally {
                tmiOpeningRef.current = false;
            }
        }, [enableResearchPlaybackGuard, loadResearch, tmiMode, trackUri]);

        // Research is intentionally opened only through context click or a long press.
        const openTmiMode = useCallback(() => {
            if (tmiMode || tmiOpeningRef.current || showResearchConsent) return;

            const hasAIProvider = window.AIAddonManager?.getEnabledProvidersFor('research')?.length > 0;
            if (!hasAIProvider) {
                Toast.error(I18n.t("tmi.requireKey"));
                return;
            }

            if (!researchConsentAccepted) {
                setShowResearchConsent(true);
                return;
            }

            beginResearch();
        }, [beginResearch, researchConsentAccepted, showResearchConsent, tmiMode]);

        const closeResearchConsent = useCallback(() => {
            setShowResearchConsent(false);
        }, []);

        const acceptResearchConsent = useCallback(() => {
            saveResearchTokenConsent();
            setResearchConsentAccepted(true);
            setShowResearchConsent(false);
            beginResearch();
        }, [beginResearch]);

        const handleAlbumModeClick = useCallback((event) => {
            event?.preventDefault?.();
            event?.stopPropagation?.();

            // TV mode always uses the plain album artwork presentation.
            if (tvModeEnabled) return;

            if (suppressAlbumClickRef.current) {
                suppressAlbumClickRef.current = false;
                if (suppressAlbumClickTimerRef.current) {
                    window.clearTimeout(suppressAlbumClickTimerRef.current);
                    suppressAlbumClickTimerRef.current = null;
                }
                return;
            }

            if (presentationModeActive) {
                if (lpModeClosing) return;
                if (!vinylAnimationsEnabled) {
                    setLpModeClosing(false);
                    onPresentationModeChange?.("standard");
                    return;
                }
                if (runLpSharedTransition("exit", () => {
                    if (lpModeExitTimerRef.current) {
                        window.clearTimeout(lpModeExitTimerRef.current);
                        lpModeExitTimerRef.current = null;
                    }
                    setLpModeClosing(false);
                    onPresentationModeChange?.("standard");
                })) return;

                setLpModeClosing(true);
                lpModeExitTimerRef.current = window.setTimeout(() => {
                    lpModeExitTimerRef.current = null;
                    setLpModeClosing(false);
                    onPresentationModeChange?.("standard");
                }, 420);
                return;
            }

            if (lpModeExitTimerRef.current) {
                window.clearTimeout(lpModeExitTimerRef.current);
                lpModeExitTimerRef.current = null;
            }
            setLpModeClosing(false);
            const nextPresentation = getDefaultFocusedPresentation();
            if (!vinylAnimationsEnabled) {
                onPresentationModeChange?.(nextPresentation);
                return;
            }
            if (runLpSharedTransition(
                "enter",
                () => onPresentationModeChange?.(nextPresentation)
            )) return;
            onPresentationModeChange?.(nextPresentation);
        }, [
            presentationModeActive,
            lpModeClosing,
            onPresentationModeChange,
            runLpSharedTransition,
            tvModeEnabled,
            vinylAnimationsEnabled
        ]);

        const handlePresentationModeChange = useCallback((nextMode) => {
            const normalized = normalizeFocusedPresentation(nextMode);
            if (normalized === "standard") {
                handleAlbumModeClick();
                return;
            }

            if (lpModeExitTimerRef.current) {
                window.clearTimeout(lpModeExitTimerRef.current);
                lpModeExitTimerRef.current = null;
            }
            setLpModeClosing(false);
            onPresentationModeChange?.(normalized);
        }, [handleAlbumModeClick, onPresentationModeChange]);

        const handleAlbumContextMenu = useCallback((event) => {
            event.preventDefault();
            event.stopPropagation();
            clearAlbumPressTimer();
            suppressNextAlbumClick();
            openTmiMode();
        }, [clearAlbumPressTimer, openTmiMode, suppressNextAlbumClick]);

        const handleAlbumPointerDown = useCallback((event) => {
            if (event.button !== undefined && event.button !== 0) return;

            clearAlbumPressTimer();
            albumPressStartRef.current = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY
            };
            albumPressTimerRef.current = window.setTimeout(() => {
                albumPressTimerRef.current = null;
                albumPressStartRef.current = null;
                suppressNextAlbumClick();
                openTmiMode();
            }, 650);
        }, [clearAlbumPressTimer, openTmiMode, suppressNextAlbumClick]);

        const handleAlbumPointerMove = useCallback((event) => {
            const start = albumPressStartRef.current;
            if (!start || start.pointerId !== event.pointerId) return;
            if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 12) {
                clearAlbumPressTimer();
            }
        }, [clearAlbumPressTimer]);

        const handleAlbumPointerEnd = useCallback(() => {
            clearAlbumPressTimer();
        }, [clearAlbumPressTimer]);

        const handleAlbumKeyDown = useCallback((event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                handleAlbumModeClick(event);
                return;
            }

            if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                handleAlbumContextMenu(event);
            }
        }, [handleAlbumContextMenu, handleAlbumModeClick]);

        useEffect(() => () => {
            tmiRequestRef.current += 1;
            restoreResearchPlaybackGuard();
            clearAlbumPressTimer();
            if (suppressAlbumClickTimerRef.current) {
                window.clearTimeout(suppressAlbumClickTimerRef.current);
            }
            if (lpModeExitTimerRef.current) {
                window.clearTimeout(lpModeExitTimerRef.current);
            }
            lpViewTransitionRef.current?.skipTransition?.();
            lpViewTransitionRef.current = null;
            document.documentElement?.classList.remove(
                "is-lp-view-transition",
                "is-lp-view-enter",
                "is-lp-view-exit"
            );
        }, [clearAlbumPressTimer, restoreResearchPlaybackGuard]);

        // Handle Regenerate
        const handleRegenerate = useCallback(async () => {
            const trackId = trackUri?.split(":")[2];
            if (!trackId) return;

            await loadResearch(trackId, true);
        }, [loadResearch, trackUri]);

        // Close TMI mode
        const closeTmiMode = useCallback(() => {
            tmiRequestRef.current += 1;
            tmiOpeningRef.current = false;
            setTmiMode(false);
            setTmiData(null);
            setTmiLoading(false);
            setTmiWebSearchFallback(false);
            restoreResearchPlaybackGuard();
        }, [restoreResearchPlaybackGuard]);

        // Research belongs to the track it was opened for. If playback is changed
        // externally or with the next/previous controls, close instead of silently
        // starting another long-running request for the new track.
        useEffect(() => {
            if (!tmiMode || !trackUri) return;

            const researchTrackUri = tmiPlaybackGuardRef.current.trackUri;
            if (researchTrackUri && researchTrackUri !== trackUri) {
                closeTmiMode();
            }
        }, [closeTmiMode, tmiMode, trackUri]);

        const currentPlayerItem = Spicetify.Player.data?.item;
        const currentPlayerMetadata = currentPlayerItem?.metadata;
        const currentTrackUri = getFirstSpotifyUri(currentPlayerItem?.uri, trackUri);
        const currentArtistUri = getCurrentArtistUri();
        const currentAlbumUri = getCurrentAlbumUri();
        const currentCoverUrl = currentPlayerMetadata?.image_xlarge_url
            || currentPlayerMetadata?.image_large_url
            || currentPlayerItem?.album?.images?.[0]?.url
            || currentPlayerMetadata?.image_url
            || coverUrl;
        const currentVinylTitle = currentPlayerMetadata?.title || title || "LP";
        const currentVinylArtist = currentPlayerMetadata?.artist_name || artist || "";
        const currentVinylAlbum = currentPlayerMetadata?.album_title || currentVinylTitle;
        const liveVinylTrack = {
            uri: currentTrackUri || `${currentVinylTitle}\u0000${currentVinylArtist}`,
            coverUrl: currentCoverUrl,
            title: currentVinylTitle,
            artist: currentVinylArtist,
            album: currentVinylAlbum,
            accent: currentTrackUri && currentTrackUri === trackAccentUri
                ? String(trackAccent || "").trim()
                : ""
        };

        const albumActionCopy = {
            click: I18n.t("vinyl.click"),
            lpTitle: I18n.t("vinyl.mode"),
            lpHint: presentationModeActive
                ? I18n.t("vinyl.closeHint")
                : I18n.t("vinyl.openHint"),
            tmiGesture: I18n.t("vinyl.tmiGesture")
        };
        const tmiTitle = I18n.t("tmi.title");
        const vinylTmiHint = I18n.t("vinyl.tmiHint");
        const tmiDisclaimer = I18n.t("tmi.disclaimer");
        const albumInteractionLabel = [
            tvModeEnabled ? null : albumActionCopy.lpHint,
            vinylTmiHint,
            tmiDisclaimer
        ]
            .filter(Boolean)
            .join(". ");

        const albumInteractionProps = {
            onClick: handleAlbumModeClick,
            onContextMenu: handleAlbumContextMenu,
            onPointerDown: handleAlbumPointerDown,
            onPointerMove: handleAlbumPointerMove,
            onPointerUp: handleAlbumPointerEnd,
            onPointerCancel: handleAlbumPointerEnd,
            onPointerLeave: handleAlbumPointerEnd,
            onDragStart: (event) => event.preventDefault(),
            onKeyDown: handleAlbumKeyDown,
            role: "button",
            tabIndex: 0,
            "aria-label": albumInteractionLabel,
            "aria-keyshortcuts": "Enter Space Shift+F10",
            title: albumInteractionLabel
        };

        const renderAlbumModeHint = () => react.createElement("div", {
            className: "album-mode-hint",
            style: { borderRadius: `${albumRadius}px` },
            "aria-hidden": "true"
        },
            react.createElement("div", { className: "album-mode-hint-layout" },
                react.createElement("div", { className: "album-mode-actions" },
                    react.createElement("div", { className: "album-mode-action is-primary" },
                        react.createElement("div", { className: "album-mode-action-header" },
                            react.createElement("span", { className: "album-mode-action-title" }, albumActionCopy.lpTitle),
                            react.createElement("span", { className: "album-mode-action-gesture" }, albumActionCopy.click)
                        ),
                        react.createElement("span", { className: "album-mode-action-description" }, albumActionCopy.lpHint)
                    ),
                    react.createElement("div", { className: "album-mode-action is-secondary" },
                        react.createElement("div", { className: "album-mode-action-header" },
                            react.createElement("span", { className: "album-mode-action-title" }, tmiTitle),
                            react.createElement("span", { className: "album-mode-action-gesture" }, albumActionCopy.tmiGesture)
                        ),
                        react.createElement("span", {
                            className: "album-mode-action-description album-mode-tmi-disclaimer"
                        }, tmiDisclaimer)
                    )
                )
            )
        );

        const renderResearchConsentDialog = () => showResearchConsent && react.createElement(ResearchTokenConsentDialog, {
            onAgree: acceptResearchConsent,
            onCancel: closeResearchConsent
        });

        if (!isFullscreen) return null;

        const VinylMode = window.ivLyricsVinylPlayerMode;
        if (!tvModeEnabled && focusModeActive && !tmiMode && VinylMode) {
            return react.createElement(react.Fragment, null,
                react.createElement(VinylMode, {
                track: liveVinylTrack,
                albumRadius,
                isClosing: lpModeClosing,
                isPortraitLayout: isPortraitViewport,
                presentationMode: normalizedPresentationMode,
                controlsVisible: uiVisible,
                onPresentationModeChange: handlePresentationModeChange,
                isPlaying,
                position,
                duration,
                interactionProps: albumInteractionProps,
                activeLyric,
                activeLyrics,
                lyricsTrackUri: trackUri,
                activeLineIndex: currentLyricIndex,
                activeLyricsKaraoke,
                karaokeSource,
                lyricsSettingsRevision,
                showStageControls: showControls,
                showStageProgress: showProgress,
                vinylSettings: {
                    albumSize: CONFIG?.visual?.["fullscreen-vinyl-album-size"] ?? 100,
                    recordSize: CONFIG?.visual?.["fullscreen-vinyl-record-size"] ?? 100,
                    backgroundBlur: CONFIG?.visual?.["fullscreen-vinyl-background-blur"] ?? 0,
                    animations: CONFIG?.visual?.["fullscreen-vinyl-animations"] !== false,
                    centerRotation: CONFIG?.visual?.["fullscreen-vinyl-center-rotation"] !== false,
                    lyricsEnabled: CONFIG?.visual?.["fullscreen-vinyl-lyrics-enabled"] !== false,
                    tonearmStyle: CONFIG?.visual?.["fullscreen-vinyl-tonearm-style"] || "s",
                    tonearmFinish: CONFIG?.visual?.["fullscreen-vinyl-tonearm-finish"] || "white",
                    tonearmSize: CONFIG?.visual?.["fullscreen-vinyl-tonearm-size"] ?? 100,
                    originalFontFamily: CONFIG?.visual?.["fullscreen-vinyl-original-font-family"] || "Pretendard Variable",
                    originalFontSize: CONFIG?.visual?.["fullscreen-vinyl-original-font-size"] ?? 31,
                    originalFontWeight: CONFIG?.visual?.["fullscreen-vinyl-original-font-weight"] ?? 600,
                    originalOpacity: CONFIG?.visual?.["fullscreen-vinyl-original-opacity"] ?? 95,
                    originalLetterSpacing: CONFIG?.visual?.["fullscreen-vinyl-original-letter-spacing"] ?? 0,
                    originalOutlineWidth: CONFIG?.visual?.["fullscreen-vinyl-original-outline-width"] ?? 0,
                    originalOutlineColor: CONFIG?.visual?.["fullscreen-vinyl-original-outline-color"] || "#000000",
                    phoneticFontFamily: CONFIG?.visual?.["fullscreen-vinyl-phonetic-font-family"] || "Pretendard Variable",
                    phoneticFontSize: CONFIG?.visual?.["fullscreen-vinyl-phonetic-font-size"] ?? 11,
                    phoneticFontWeight: CONFIG?.visual?.["fullscreen-vinyl-phonetic-font-weight"] ?? 100,
                    phoneticOpacity: CONFIG?.visual?.["fullscreen-vinyl-phonetic-opacity"] ?? 70,
                    phoneticSpacing: CONFIG?.visual?.["fullscreen-vinyl-phonetic-spacing"] ?? -1,
                    phoneticLetterSpacing: CONFIG?.visual?.["fullscreen-vinyl-phonetic-letter-spacing"] ?? 0,
                    phoneticOutlineWidth: CONFIG?.visual?.["fullscreen-vinyl-phonetic-outline-width"] ?? 0,
                    phoneticOutlineColor: CONFIG?.visual?.["fullscreen-vinyl-phonetic-outline-color"] || "#000000",
                    translationFontFamily: CONFIG?.visual?.["fullscreen-vinyl-translation-font-family"] || "Pretendard Variable",
                    translationFontSize: CONFIG?.visual?.["fullscreen-vinyl-translation-font-size"] ?? 15,
                    translationFontWeight: CONFIG?.visual?.["fullscreen-vinyl-translation-font-weight"] ?? 300,
                    translationOpacity: CONFIG?.visual?.["fullscreen-vinyl-translation-opacity"] ?? 85,
                    translationSpacing: CONFIG?.visual?.["fullscreen-vinyl-translation-spacing"] ?? 0,
                    translationLetterSpacing: CONFIG?.visual?.["fullscreen-vinyl-translation-letter-spacing"] ?? 0,
                    translationOutlineWidth: CONFIG?.visual?.["fullscreen-vinyl-translation-outline-width"] ?? 0,
                    translationOutlineColor: CONFIG?.visual?.["fullscreen-vinyl-translation-outline-color"] || "#000000",
                    culturalFontFamily: CONFIG?.visual?.["cultural-annotations-vinyl-font-family"] || "Pretendard Variable",
                    culturalFontSize: CONFIG?.visual?.["cultural-annotations-vinyl-font-size"] ?? 12,
                    culturalFontWeight: CONFIG?.visual?.["cultural-annotations-vinyl-font-weight"] ?? 300,
                    culturalOpacity: CONFIG?.visual?.["cultural-annotations-vinyl-opacity"] ?? 60,
                    culturalOutlineWidth: CONFIG?.visual?.["cultural-annotations-vinyl-outline-width"] ?? 0,
                    culturalOutlineColor: CONFIG?.visual?.["cultural-annotations-vinyl-outline-color"] || "#000000",
                    videoStageOriginalFontFamily: CONFIG?.visual?.["fullscreen-video-stage-original-font-family"] || CONFIG?.visual?.["fullscreen-vinyl-original-font-family"] || "Pretendard Variable",
                    videoStagePhoneticFontFamily: CONFIG?.visual?.["fullscreen-video-stage-phonetic-font-family"] || CONFIG?.visual?.["fullscreen-vinyl-phonetic-font-family"] || "Pretendard Variable",
                    videoStageTranslationFontFamily: CONFIG?.visual?.["fullscreen-video-stage-translation-font-family"] || CONFIG?.visual?.["fullscreen-vinyl-translation-font-family"] || "Pretendard Variable",
                    videoStageCulturalFontFamily: CONFIG?.visual?.["fullscreen-video-stage-cultural-font-family"] || CONFIG?.visual?.["cultural-annotations-vinyl-font-family"] || "Pretendard Variable",
                    videoStageLyricBackgroundColor: CONFIG?.visual?.["fullscreen-video-stage-lyric-background-color"] || "#000000",
                    videoStageLyricBackgroundOpacity: CONFIG?.visual?.["fullscreen-video-stage-lyric-background-opacity"] ?? 46
                },
                onPrevious: () => Spicetify.Player.back(),
                onSeek: (nextPosition) => {
                    window.Utils?.clearSafePlayerProgressCorrection?.();
                    const liveDuration = Spicetify.Player.getDuration?.() || duration;
                    const safePosition = clampSeekPositionToLiveDuration(nextPosition, liveDuration);
                    Spicetify.Player.seek(Math.floor(safePosition));
                },
                onStopPlayback: () => {
                    if (Spicetify.Player?.data?.isPaused === true) return;
                    if (typeof Spicetify.Player?.pause === "function") Spicetify.Player.pause();
                    else Spicetify.Player?.togglePlay?.();
                },
                onTogglePlayback: () => Spicetify.Player.togglePlay(),
                    onNext: () => Spicetify.Player.next()
                }),
                renderResearchConsentDialog()
            );
        }

        const CompactAlbumVinyl = VinylMode?.CompactAlbumVinyl;
        const renderAlbumVisual = ({
            coverClassName,
            coverStyle
        }) => {
            if (!tvModeEnabled && compactPresentationActive && CompactAlbumVinyl) {
                return react.createElement(CompactAlbumVinyl, {
                    track: liveVinylTrack,
                    isPlaying,
                    animationsEnabled: vinylAnimationsEnabled,
                    centerRotationEnabled:
                        CONFIG?.visual?.["fullscreen-vinyl-center-rotation"] !== false,
                    albumRadius,
                    coverClassName,
                    coverStyle
                });
            }

            return react.createElement("img", {
                src: currentCoverUrl,
                className: coverClassName,
                style: coverStyle,
                draggable: false
            });
        };

        const isPortraitFullscreen = isFullscreen && isPortraitViewport && !tvModeEnabled;
        const isTwoColumn = CONFIG?.visual?.["fullscreen-two-column"] !== false;
        const hideLeftPanel = !showAlbum && !showInfo && controlsPosition !== "left-panel";
        const showControlsInLeftPanel = controlsPosition === "left-panel" && showControls;
        const showControlsInBottom = controlsPosition === "bottom" && showControls;
        const showContextInOverlay = showContext;
        const showNextTrackInOverlay = showNextTrack;
        const showQueueInOverlay = showQueue;
        const showInfoInOverlay = showInfo;
        const normalShowAlbumNameInOverlay = normalShowAlbumName;
        const showClockInOverlay = showClock;
        const clockSizeInOverlay = clockSize;
        const leftPanelShowVolume = showVolume;
        const leftPanelControlsBackground = controlsBackground;
        const leftPanelControlButtonSize = controlButtonSize;
        const leftControlsClass = [
            "fullscreen-left-controls",
            !uiVisible ? "hidden" : ""
        ].filter(Boolean).join(" ");
        const leftPlayerControlsClass = `${leftControlsClass} left-controls-player`;
        const leftProgressOnlyClass = `${leftControlsClass} left-controls-progress-only`;

        const resolveTvMetadataLines = (mode, originalValue, translatedValue, romanizedValue) => {
            const values = {
                original: getNonEmptyString(originalValue),
                translated: getNonEmptyString(translatedValue),
                romanized: getNonEmptyString(romanizedValue)
            };
            const requestedKinds = (() => {
                switch (mode) {
                    case "translated":
                        return [values.translated ? "translated" : "original"];
                    case "romanized":
                        return [values.romanized ? "romanized" : "original"];
                    case "original-translated":
                        return ["original", "translated"];
                    case "original-romanized":
                        return ["original", "romanized"];
                    case "all":
                        return ["original", "translated", "romanized"];
                    default:
                        return ["original"];
                }
            })();
            const seen = new Set();

            return requestedKinds.reduce((lines, kind) => {
                const value = values[kind];
                if (!value || seen.has(value)) return lines;
                seen.add(value);
                lines.push({ kind, value });
                return lines;
            }, []);
        };

        const renderTvMetadataLines = ({
            type,
            original,
            translated,
            romanized,
            fontSize
        }) => {
            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
            const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;
            const lines = resolveTvMetadataLines(
                mode,
                applyTrim(original),
                applyTrim(translated),
                applyTrim(romanized)
            );
            const secondaryScale = type === "title" ? 0.6 : 0.8;

            return lines.map((line, index) => react.createElement("div", {
                key: `${type}-${line.kind}`,
                className: `fullscreen-tv-${type}${index > 0 ? ` fullscreen-tv-${type}-secondary` : ""}`,
                style: {
                    fontSize: `${index === 0 ? fontSize : Math.round(fontSize * secondaryScale)}px`
                }
            }, line.value));
        };

        // In TV mode, hide the left panel (album/info shown at bottom-left instead)
        const hideLeftPanelForTvMode = tvModeEnabled;
        const PresentationSwitcher = VinylMode?.PresentationSwitcher;

        return react.createElement(react.Fragment, null,
            renderResearchConsentDialog(),
            !tvModeEnabled && !tmiMode && PresentationSwitcher && react.createElement(PresentationSwitcher, {
                activeMode: normalizedPresentationMode,
                visible: true,
                onChange: handlePresentationModeChange
            }),
            // TMI Overlay for TV Mode & Portrait Mode (rendered above everything when active)
            (tvModeEnabled || isPortraitFullscreen) && tmiMode && react.createElement("div", {
                className: "fullscreen-tv-tmi-overlay"
            },
                tmiLoading && !tmiData ?
                    react.createElement(window.SongInfoTMI?.TMILoadingView || 'div', {
                        onClose: closeTmiMode,
                        tmiScale: tmiScale,
                        webSearchFallback: tmiWebSearchFallback
                    }) :
                    react.createElement(window.SongInfoTMI?.TMIFullView || 'div', {
                        info: tmiData,
                        isGenerating: tmiLoading,
                        webSearchFallback: tmiWebSearchFallback,
                        onClose: closeTmiMode,
                        tmiScale: tmiScale,
                        trackName: (() => {
                            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                            const original = title || Spicetify.Player.data?.item?.metadata?.title;
                            const trans = translatedMetadata?.translated?.title;
                            const rom = translatedMetadata?.romanized?.title;
                            if (mode === "translated") return trans || original;
                            if (mode === "romanized") return rom || original;
                            return original;
                        })(),
                        artistName: (() => {
                            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                            const original = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                            const trans = translatedMetadata?.translated?.artist;
                            const rom = translatedMetadata?.romanized?.artist;
                            if (mode === "translated") return trans || original;
                            if (mode === "romanized") return rom || original;
                            return original;
                        })(),
                        coverUrl: coverUrl || Spicetify.Player.data?.item?.metadata?.image_url,
                        onRegenerate: handleRegenerate
                    })
            ),
            // Bottom-left: TV Mode Song Info OR Context info
            tvModeEnabled ? react.createElement(react.Fragment, null,
                react.createElement("div", {
                    className: "fullscreen-tv-song-info"
                },
                    // TV mode keeps the plain album artwork. Context click or hold opens TMI.
                    react.createElement("div", {
                        ...albumInteractionProps,
                        className: "fullscreen-tv-album-wrapper clickable-album-container",
                        style: {
                            width: `${tvAlbumSize}px`,
                            height: `${tvAlbumSize}px`,
                            position: 'relative',
                            cursor: 'pointer',
                            borderRadius: `${albumRadius}px`,
                            flexShrink: 0
                        }
                    },
                        renderAlbumVisual({
                            coverClassName: "fullscreen-tv-album ivlyrics-fullscreen-shared-album",
                            coverStyle: {
                                width: '100%',
                                height: '100%',
                                borderRadius: `${albumRadius}px`
                            }
                        })
                    ),
                    // Track info (Title, Artist, Album)
                    react.createElement("div", { className: "fullscreen-tv-track-info" },
                        // Title (honors the same metadata display mode as normal fullscreen)
                        react.createElement("div", {
                            ...createNavigationProps(currentTrackUri, "fullscreen-tv-title-container")
                        },
                            renderTvMetadataLines({
                                type: "title",
                                original: title || Spicetify.Player.data?.item?.metadata?.title,
                                translated: translatedMetadata?.translated?.title,
                                romanized: translatedMetadata?.romanized?.title,
                                fontSize: Math.round(tvAlbumSize * 0.26)
                            })
                        ),
                        // Artist (honors the same metadata display mode as normal fullscreen)
                        react.createElement("div", {
                            ...createNavigationProps(currentArtistUri, "fullscreen-tv-artist-container")
                        },
                            renderTvMetadataLines({
                                type: "artist",
                                original: artist || Spicetify.Player.data?.item?.metadata?.artist_name,
                                translated: translatedMetadata?.translated?.artist,
                                romanized: translatedMetadata?.romanized?.artist,
                                fontSize: Math.round(tvAlbumSize * 0.16)
                            })
                        ),
                        // Album name (from context)
                        tvShowAlbumName && react.createElement("div", createNavigationProps(currentAlbumUri, "fullscreen-tv-album-name"),
                            (() => {
                                try {
                                    const albumName = Spicetify.Player.data?.item?.metadata?.album_title;
                                    const releaseYear = Spicetify.Player.data?.item?.metadata?.album_disc_number
                                        ? ""
                                        : (Spicetify.Player.data?.item?.metadata?.year || "");
                                    return albumName ? `${albumName}${releaseYear ? ` • ${releaseYear}` : ''}` : '';
                                } catch (e) { return ''; }
                            })()
                        )
                    )
                ),
                // TV Mode Controls & Progress (right side)
                (showLyricsProgress || tvShowControls || tvShowProgress) && react.createElement("div", {
                    className: `fullscreen-tv-controls-wrapper ${!uiVisible ? 'hidden' : ''}`
                },
                    // Keep lyric progress in the same stack so it cannot overlap TV controls.
                    showLyricsProgress && react.createElement(LyricsProgress, {
                        show: true,
                        currentLine: currentLyricIndex,
                        totalLines: totalLyrics
                    }),
                    // TV Mode Controls
                    tvShowControls && react.createElement("div", {
                        className: "fullscreen-tv-controls"
                    },
                        // Previous button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn",
                            onClick: () => Spicetify.Player.back(),
                            title: "Previous"
                        },
                            react.createElement("svg", {
                                width: "24", height: "24", viewBox: "0 0 16 16", fill: "currentColor"
                            },
                                react.createElement("path", { d: "M3.3 1a.7.7 0 0 1 .7.7v5.15l9.95-5.744a.7.7 0 0 1 1.05.606v12.575a.7.7 0 0 1-1.05.607L4 9.149V14.3a.7.7 0 0 1-.7.7H1.7a.7.7 0 0 1-.7-.7V1.7a.7.7 0 0 1 .7-.7h1.6z" })
                            )
                        ),
                        // Play/Pause button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn play-pause",
                            onClick: () => Spicetify.Player.togglePlay()
                        },
                            isPlaying
                                ? react.createElement("svg", {
                                    width: "32", height: "32", viewBox: "0 0 16 16", fill: "currentColor"
                                },
                                    react.createElement("path", { d: "M2.7 1a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7H2.7zm8 0a.7.7 0 0 0-.7.7v12.6a.7.7 0 0 0 .7.7h2.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-2.6z" })
                                )
                                : react.createElement("svg", {
                                    width: "32", height: "32", viewBox: "0 0 16 16", fill: "currentColor"
                                },
                                    react.createElement("path", { d: "M3 1.713a.7.7 0 0 1 1.05-.607l10.89 6.288a.7.7 0 0 1 0 1.212L4.05 14.894A.7.7 0 0 1 3 14.288V1.713z" })
                                )
                        ),
                        // Next button
                        react.createElement("button", {
                            className: "fullscreen-tv-control-btn",
                            onClick: () => Spicetify.Player.next(),
                            title: "Next"
                        },
                            react.createElement("svg", {
                                width: "24", height: "24", viewBox: "0 0 16 16", fill: "currentColor"
                            },
                                react.createElement("path", { d: "M12.7 1a.7.7 0 0 0-.7.7v5.15L2.05 1.107A.7.7 0 0 0 1 1.712v12.575a.7.7 0 0 0 1.05.607L12 9.149V14.3a.7.7 0 0 0 .7.7h1.6a.7.7 0 0 0 .7-.7V1.7a.7.7 0 0 0-.7-.7h-1.6z" })
                            )
                        )
                    ),
                    // TV Mode Progress bar
                    tvShowProgress && react.createElement("div", {
                        className: "fullscreen-tv-progress"
                    },
                        react.createElement("span", { className: "fullscreen-tv-time current" }, formatTime(position)),
                        react.createElement("div", {
                            className: "fullscreen-tv-progress-bar",
                            onClick: (e) => {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const clickX = e.clientX - rect.left;
                                const percentage = clickX / rect.width;
                                const seekPosition = Math.floor(duration * percentage);
                                window.Utils?.clearSafePlayerProgressCorrection?.();
                                Spicetify.Player.seek(seekPosition);
                            }
                        },
                            react.createElement("div", {
                                className: "fullscreen-tv-progress-fill",
                                style: { width: `${duration > 0 ? (position / duration) * 100 : 0}%` }
                            })
                        ),
                        react.createElement("span", { className: "fullscreen-tv-time total" }, formatTime(duration))
                    )
                )
            ) : react.createElement("div", {
                className: `fullscreen-bottom-left ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(ContextInfo, { show: showContextInOverlay, showImage: showContextImage })
            ),
            // Top-right: Clock & Next track
            react.createElement("div", {
                className: `fullscreen-top-right ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement("div", {
                    className: "fullscreen-clock-wrapper"
                },
                    react.createElement(Clock, {
                        show: showClockInOverlay,
                        showSeconds: clockShowSeconds,
                        size: clockSizeInOverlay
                    })
                ),
                react.createElement(NextTrackPreview, {
                    show: showNextTrackInOverlay,
                    secondsBeforeEnd: nextTrackSeconds
                })
            ),
            // Portrait mode overlays (세로모드 전용 오버레이)
            isPortraitFullscreen && react.createElement(react.Fragment, null,
                // [상단 오버레이] 앨범아트 + 곡정보
                (showAlbum || showInfo) && react.createElement("div", {
                    className: `portrait-overlay-top ${!uiVisible ? 'hidden' : ''} ${isLayoutReversed ? 'layout-reversed' : ''}`
                },
                    // 앨범 클릭은 LP 모드, 우클릭/롱프레스는 TMI
                    showAlbum && react.createElement("div", {
                        ...albumInteractionProps,
                        className: "portrait-album-container clickable-album-container",
                        style: { borderRadius: `${albumRadius}px` }
                    },
                        renderAlbumVisual({
                            coverClassName: `portrait-album-art ivlyrics-fullscreen-shared-album ${albumShadow ? 'with-shadow' : ''}`,
                            coverStyle: { borderRadius: `${albumRadius}px` }
                        }),
                        renderAlbumModeHint()
                    ),
                    // 곡정보 (메타데이터 번역 지원)
                    showInfo && react.createElement("div", { className: "portrait-track-info" },
                        // 제목
                        (() => {
                            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                            const originalTitle = title || Spicetify.Player.data?.item?.metadata?.title;
                            const translatedTitle = translatedMetadata?.translated?.title;
                            const romanizedTitle = translatedMetadata?.romanized?.title;
                            const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;
                            const elements = [];

                            switch (mode) {
                                case "translated":
                                    elements.push(react.createElement("div", {
                                        key: "pt-title", ...createNavigationProps(currentTrackUri, "portrait-track-title")
                                    }, applyTrim(translatedTitle || originalTitle)));
                                    break;
                                case "romanized":
                                    elements.push(react.createElement("div", {
                                        key: "pt-title", ...createNavigationProps(currentTrackUri, "portrait-track-title")
                                    }, applyTrim(romanizedTitle || originalTitle)));
                                    break;
                                case "original-translated":
                                    elements.push(react.createElement("div", {
                                        key: "pt-title", ...createNavigationProps(currentTrackUri, "portrait-track-title")
                                    }, applyTrim(originalTitle)));
                                    if (translatedTitle && translatedTitle !== originalTitle) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-title-sub", ...createNavigationProps(currentTrackUri, "portrait-track-title-sub")
                                        }, applyTrim(translatedTitle)));
                                    }
                                    break;
                                case "original-romanized":
                                    elements.push(react.createElement("div", {
                                        key: "pt-title", ...createNavigationProps(currentTrackUri, "portrait-track-title")
                                    }, applyTrim(originalTitle)));
                                    if (romanizedTitle && romanizedTitle !== originalTitle) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-title-sub", ...createNavigationProps(currentTrackUri, "portrait-track-title-sub")
                                        }, applyTrim(romanizedTitle)));
                                    }
                                    break;
                                case "all":
                                default:
                                    elements.push(react.createElement("div", {
                                        key: "pt-title", ...createNavigationProps(currentTrackUri, "portrait-track-title")
                                    }, applyTrim(originalTitle)));
                                    if (translatedTitle && translatedTitle !== originalTitle) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-title-trans", ...createNavigationProps(currentTrackUri, "portrait-track-title-sub")
                                        }, applyTrim(translatedTitle)));
                                    }
                                    if (romanizedTitle && romanizedTitle !== originalTitle && romanizedTitle !== translatedTitle) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-title-rom", ...createNavigationProps(currentTrackUri, "portrait-track-title-sub")
                                        }, applyTrim(romanizedTitle)));
                                    }
                                    break;
                            }
                            return elements;
                        })(),
                        // 아티스트
                        (() => {
                            const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                            const originalArtist = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                            const translatedArtist = translatedMetadata?.translated?.artist;
                            const romanizedArtist = translatedMetadata?.romanized?.artist;
                            const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;
                            const elements = [];

                            switch (mode) {
                                case "translated":
                                    elements.push(react.createElement("div", {
                                        key: "pt-artist", ...createNavigationProps(currentArtistUri, "portrait-track-artist")
                                    }, applyTrim(translatedArtist || originalArtist)));
                                    break;
                                case "romanized":
                                    elements.push(react.createElement("div", {
                                        key: "pt-artist", ...createNavigationProps(currentArtistUri, "portrait-track-artist")
                                    }, applyTrim(romanizedArtist || originalArtist)));
                                    break;
                                case "original-translated":
                                    elements.push(react.createElement("div", {
                                        key: "pt-artist", ...createNavigationProps(currentArtistUri, "portrait-track-artist")
                                    }, applyTrim(originalArtist)));
                                    if (translatedArtist && translatedArtist !== originalArtist) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-artist-sub", ...createNavigationProps(currentArtistUri, "portrait-track-artist-sub")
                                        }, applyTrim(translatedArtist)));
                                    }
                                    break;
                                case "original-romanized":
                                    elements.push(react.createElement("div", {
                                        key: "pt-artist", ...createNavigationProps(currentArtistUri, "portrait-track-artist")
                                    }, applyTrim(originalArtist)));
                                    if (romanizedArtist && romanizedArtist !== originalArtist) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-artist-sub", ...createNavigationProps(currentArtistUri, "portrait-track-artist-sub")
                                        }, applyTrim(romanizedArtist)));
                                    }
                                    break;
                                case "all":
                                default:
                                    elements.push(react.createElement("div", {
                                        key: "pt-artist", ...createNavigationProps(currentArtistUri, "portrait-track-artist")
                                    }, applyTrim(originalArtist)));
                                    if (translatedArtist && translatedArtist !== originalArtist) {
                                        elements.push(react.createElement("div", {
                                            key: "pt-artist-trans", ...createNavigationProps(currentArtistUri, "portrait-track-artist-sub")
                                        }, applyTrim(translatedArtist)));
                                    }
                                    break;
                            }
                            return elements;
                        })(),
                        // 앨범명 (옵션)
                        normalShowAlbumName && react.createElement("div", {
                            ...createNavigationProps(currentAlbumUri, "portrait-track-album-name")
                        }, (() => {
                            try {
                                return Spicetify.Player.data?.item?.metadata?.album_title || '';
                            } catch (e) { return ''; }
                        })())
                    )
                ),
                // [하단 오버레이] 컨트롤 + 프로그레스바
                (showControls || showProgress) && react.createElement("div", {
                    className: `portrait-overlay-bottom ${!uiVisible ? 'hidden' : ''} ${isLayoutReversed ? 'layout-reversed' : ''}`
                },
                    showProgress && react.createElement(ProgressBar, { show: true }),
                    showControls && react.createElement(PlayerControls, {
                        show: true,
                        showVolume: showVolume,
                        buttonSize: controlButtonSize,
                        showBackground: controlsBackground
                    })
                )
            ),
            // Left panel (Album, Info & Controls) OR TMI View - Hidden in TV Mode & Portrait Mode
            !isPortraitFullscreen && isTwoColumn && !hideLeftPanel && !hideLeftPanelForTvMode && react.createElement("div", {
                className: `lyrics-fullscreen-left-panel ${!uiVisible && showControlsInLeftPanel ? 'controls-hidden' : ''} ${tmiMode ? 'tmi-mode' : ''}`,
                ref: setAlbumLyricsPanelRef
            },
                // TMI Mode View
                tmiMode ? (
                    tmiLoading && !tmiData ?
                        react.createElement(window.SongInfoTMI?.TMILoadingView || 'div', {
                            onClose: closeTmiMode,
                            tmiScale: tmiScale,
                            webSearchFallback: tmiWebSearchFallback
                        }) :
                        react.createElement(window.SongInfoTMI?.TMIFullView || 'div', {
                            info: tmiData,
                            isGenerating: tmiLoading,
                            webSearchFallback: tmiWebSearchFallback,
                            onClose: closeTmiMode,
                            tmiScale: tmiScale,
                            trackName: (() => {
                                const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                const original = title || Spicetify.Player.data?.item?.metadata?.title;
                                const trans = translatedMetadata?.translated?.title;
                                const rom = translatedMetadata?.romanized?.title;

                                if (mode === "translated") return trans || original;
                                if (mode === "romanized") return rom || original;
                                if (mode === "original-translated") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                if (mode === "original-romanized") return (rom && rom !== original) ? `${original} (${rom})` : original;
                                if (mode === "all") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                return original;
                            })(),
                            artistName: (() => {
                                const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                const original = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                                const trans = translatedMetadata?.translated?.artist;
                                const rom = translatedMetadata?.romanized?.artist;

                                if (mode === "translated") return trans || original;
                                if (mode === "romanized") return rom || original;
                                if (mode === "original-translated") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                if (mode === "original-romanized") return (rom && rom !== original) ? `${original} (${rom})` : original;
                                if (mode === "all") return (trans && trans !== original) ? `${original} (${trans})` : original;
                                return original;
                            })(),
                            coverUrl: coverUrl || Spicetify.Player.data?.item?.metadata?.image_url,
                            onRegenerate: handleRegenerate
                        })
                ) :
                    // Normal Mode
                    react.createElement("div", {
                        className: "lyrics-fullscreen-left-content",
                        style: { gap: `${infoGap}px` }
                    },
                        // Album click toggles LP mode. Context click or hold opens TMI.
                        showAlbum && react.createElement("div", {
                            ...albumInteractionProps,
                            className: `lyrics-fullscreen-album-container clickable-album-container`,
                            style: {
                                width: `${albumSize}px`,
                                height: `${albumSize}px`,
                                maxWidth: `${albumSize}px`,
                                position: 'relative',
                                cursor: 'pointer',
                                borderRadius: `${albumRadius}px`
                            }
                        },
                            renderAlbumVisual({
                                coverClassName: `lyrics-fullscreen-album-art ivlyrics-fullscreen-shared-album ${albumShadow ? 'with-shadow' : ''}`,
                                coverStyle: {
                                    width: '100%',
                                    height: '100%',
                                    borderRadius: `${albumRadius}px`
                                }
                            }),
                            renderAlbumModeHint()
                        ),
                        // Track info with translated metadata support
                        showInfoInOverlay && react.createElement("div", { className: "lyrics-fullscreen-track-info" },
                            // Title (based on display mode)
                            react.createElement("div", createNavigationProps(currentTrackUri, "lyrics-fullscreen-title-container"),
                                (() => {
                                    const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                    const originalTitle = title || Spicetify.Player.data?.item?.metadata?.title;
                                    const translatedTitle = translatedMetadata?.translated?.title;
                                    const romanizedTitle = translatedMetadata?.romanized?.title;
                                    const elements = [];

                                    // Apply trimTitle if enabled
                                    const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                                    switch (mode) {
                                        case "translated":
                                            // 번역만 표시 (없으면 원어)
                                            elements.push(react.createElement("div", {
                                                key: "title-main",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(translatedTitle || originalTitle)));
                                            break;

                                        case "romanized":
                                            // 발음만 표시 (없으면 원어)
                                            elements.push(react.createElement("div", {
                                                key: "title-main",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(romanizedTitle || originalTitle)));
                                            break;

                                        case "original-translated":
                                            // 원어 + 번역
                                            elements.push(react.createElement("div", {
                                                key: "title-original",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(originalTitle)));
                                            if (translatedTitle && translatedTitle !== originalTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-translated",
                                                    className: "lyrics-fullscreen-title-translated",
                                                    style: { fontSize: `${Math.round(titleSize * 0.6)}px` }
                                                }, applyTrim(translatedTitle)));
                                            }
                                            break;

                                        case "original-romanized":
                                            // 원어 + 발음
                                            elements.push(react.createElement("div", {
                                                key: "title-original",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(originalTitle)));
                                            if (romanizedTitle && romanizedTitle !== originalTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-romanized",
                                                    className: "lyrics-fullscreen-title-romanized",
                                                    style: { fontSize: `${Math.round(titleSize * 0.5)}px` }
                                                }, applyTrim(romanizedTitle)));
                                            }
                                            break;

                                        case "all":
                                        default:
                                            // 모두 표시 (원어 + 번역 + 발음)
                                            elements.push(react.createElement("div", {
                                                key: "title-original",
                                                className: "lyrics-fullscreen-title",
                                                style: { fontSize: `${titleSize}px` }
                                            }, applyTrim(originalTitle)));
                                            if (translatedTitle && translatedTitle !== originalTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-translated",
                                                    className: "lyrics-fullscreen-title-translated",
                                                    style: { fontSize: `${Math.round(titleSize * 0.6)}px` }
                                                }, applyTrim(translatedTitle)));
                                            }
                                            if (romanizedTitle && romanizedTitle !== originalTitle && romanizedTitle !== translatedTitle) {
                                                elements.push(react.createElement("div", {
                                                    key: "title-romanized",
                                                    className: "lyrics-fullscreen-title-romanized",
                                                    style: { fontSize: `${Math.round(titleSize * 0.5)}px` }
                                                }, applyTrim(romanizedTitle)));
                                            }
                                            break;
                                    }

                                    return elements;
                                })()
                            ),
                            // Artist (based on display mode)
                            react.createElement("div", createNavigationProps(currentArtistUri, "lyrics-fullscreen-artist-container"),
                                (() => {
                                    const mode = CONFIG?.visual?.["translate-metadata-mode"] || "translated";
                                    const originalArtist = artist || Spicetify.Player.data?.item?.metadata?.artist_name;
                                    const translatedArtist = translatedMetadata?.translated?.artist;
                                    const romanizedArtist = translatedMetadata?.romanized?.artist;
                                    const elements = [];

                                    // Apply trimTitle if enabled
                                    const applyTrim = (text) => trimTitleEnabled ? trimTitle(text) : text;

                                    switch (mode) {
                                        case "translated":
                                            elements.push(react.createElement("div", {
                                                key: "artist-main",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(translatedArtist || originalArtist)));
                                            break;

                                        case "romanized":
                                            elements.push(react.createElement("div", {
                                                key: "artist-main",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(romanizedArtist || originalArtist)));
                                            break;

                                        case "original-translated":
                                            elements.push(react.createElement("div", {
                                                key: "artist-original",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(originalArtist)));
                                            if (translatedArtist && translatedArtist !== originalArtist) {
                                                elements.push(react.createElement("div", {
                                                    key: "artist-translated",
                                                    className: "lyrics-fullscreen-artist-translated",
                                                    style: { fontSize: `${Math.round(artistSize * 0.8)}px` }
                                                }, applyTrim(translatedArtist)));
                                            }
                                            break;

                                        case "original-romanized":
                                            elements.push(react.createElement("div", {
                                                key: "artist-original",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(originalArtist)));
                                            if (romanizedArtist && romanizedArtist !== originalArtist) {
                                                elements.push(react.createElement("div", {
                                                    key: "artist-romanized",
                                                    className: "lyrics-fullscreen-artist-romanized",
                                                    style: { fontSize: `${Math.round(artistSize * 0.8)}px` }
                                                }, applyTrim(romanizedArtist)));
                                            }
                                            break;

                                        case "all":
                                        default:
                                            elements.push(react.createElement("div", {
                                                key: "artist-original",
                                                className: "lyrics-fullscreen-artist",
                                                style: { fontSize: `${artistSize}px` }
                                            }, applyTrim(originalArtist)));
                                            if (translatedArtist && translatedArtist !== originalArtist) {
                                                elements.push(react.createElement("div", {
                                                    key: "artist-translated",
                                                    className: "lyrics-fullscreen-artist-translated",
                                                    style: { fontSize: `${Math.round(artistSize * 0.8)}px` }
                                                }, applyTrim(translatedArtist)));
                                            }
                                            break;
                                    }

                                    return elements;
                                })()
                            ),
                            // Album name (optional)
                            normalShowAlbumNameInOverlay && react.createElement("div", {
                                ...createNavigationProps(currentAlbumUri, "lyrics-fullscreen-album-name"),
                                style: { fontSize: `${Math.round(artistSize * 0.85)}px` }
                            },
                                (() => {
                                    try {
                                        const albumName = Spicetify.Player.data?.item?.metadata?.album_title;
                                        return albumName || '';
                                    } catch (e) { return ''; }
                                })()
                            )
                        ),
                        // Controls in left panel (under album)
                        showControlsInLeftPanel && react.createElement("div", {
                            className: leftPlayerControlsClass
                        },
                            // Progress bar (독립적으로 표시)
                            showProgress && react.createElement(ProgressBar, { show: true }),
                            // Player controls
                            react.createElement(PlayerControls, {
                                show: true,
                                showVolume: leftPanelShowVolume,
                                buttonSize: leftPanelControlButtonSize,
                                showBackground: leftPanelControlsBackground
                            })
                        ),
                        // Progress bar only (컨트롤 없이 진행바만 표시)
                        !showControls && showProgress && react.createElement("div", {
                            className: leftProgressOnlyClass
                        },
                            react.createElement(ProgressBar, { show: true })
                        )
                    )
            ),
            // Bottom: Player controls (alternative position) - landscape only
            !isPortraitFullscreen && showControlsInBottom && react.createElement("div", {
                className: `fullscreen-bottom ${!uiVisible ? 'hidden' : ''}`
            },
                showProgress && react.createElement(ProgressBar, { show: true }),
                react.createElement(PlayerControls, {
                    show: true,
                    showVolume: showVolume,
                    buttonSize: controlButtonSize,
                    showBackground: controlsBackground
                })
            ),
            // Progress bar only at bottom (landscape only)
            !isPortraitFullscreen && !showControls && showProgress && controlsPosition === "bottom" && react.createElement("div", {
                className: `fullscreen-bottom ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(ProgressBar, { show: true })
            ),
            // Lyrics progress (always at bottom right if enabled)
            !tvModeEnabled && showLyricsProgress && react.createElement("div", {
                className: `fullscreen-lyrics-progress-container ${!uiVisible ? 'hidden' : ''}`
            },
                react.createElement(LyricsProgress, {
                    show: true,
                    currentLine: currentLyricIndex,
                    totalLines: totalLyrics
                })
            ),
            // Queue panel (right side hover)
            react.createElement(QueuePanel, {
                show: showQueueInOverlay,
                isFullscreen: isFullscreen
            })
        );
    };

    return Overlay;
})();

window.FullscreenOverlay = FullscreenOverlay;
