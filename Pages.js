function getCreatorProfileCopy() {
	return {
		title: I18n.t("creatorProfile.title") || "Sync Creator",
		anonymous: I18n.t("creatorProfile.anonymous") || "Anonymous",
		openProfile: I18n.t("creatorProfile.openProfile") || "Open creator profile",
		loading: I18n.t("creatorProfile.loading") || "Loading creator profile...",
		loadFailed: I18n.t("creatorProfile.loadFailed") || "Failed to load creator profile.",
		back: I18n.t("creatorProfile.back") || "Back",
		themeDark: I18n.t("settingsUi.theme.darkShort") || "Dark",
		themeLight: I18n.t("settingsUi.theme.lightShort") || "Light",
		switchToDark: I18n.t("settingsUi.theme.dark") || "Switch to dark mode",
		switchToLight: I18n.t("settingsUi.theme.light") || "Switch to light mode",
		contributions: I18n.t("creatorProfile.contributions") || "Sync Contributions",
		tracks: I18n.t("creatorProfile.tracks") || "Synced tracks",
		likes: I18n.t("creatorProfile.likes") || "Likes",
		like: I18n.t("creatorProfile.like") || "Like",
		liked: I18n.t("creatorProfile.liked") || "Liked",
		likeActionFailed: I18n.t("creatorProfile.likeActionFailed") || "Failed to update creator like.",
		likeLoginRequired: I18n.t("creatorProfile.likeLoginRequired") || "Discord login is required to like creators.",
		addGreeting: I18n.t("creatorProfile.addGreeting") || "Add greeting",
		editGreeting: I18n.t("creatorProfile.editGreeting") || "Edit greeting",
		saveGreeting: I18n.t("creatorProfile.saveGreeting") || "Save",
		cancelGreeting: I18n.t("creatorProfile.cancelGreeting") || "Cancel",
		greetingPlaceholder: I18n.t("creatorProfile.greetingPlaceholder") || "Write a greeting for your profile.",
		greetingSaveFailed: I18n.t("creatorProfile.greetingSaveFailed") || "Failed to update creator greeting.",
		greetingSaveSuccess: I18n.t("creatorProfile.greetingSaveSuccess") || "Greeting updated.",
		ownProfile: I18n.t("creatorProfile.ownProfile") || "This is your profile.",
		loadMore: I18n.t("creatorProfile.loadMore") || "Load more",
		loadingMore: I18n.t("creatorProfile.loadingMore") || "Loading more...",
		noContributions: I18n.t("creatorProfile.noContributions") || "No sync contributions yet.",
		unknownTrack: I18n.t("creatorProfile.unknownTrack") || "Unknown Track",
		updated: I18n.t("creatorProfile.updated") || "Updated",
		topArtists: I18n.t("creatorProfile.topArtists") || "Top Artists",
		artistGroups: I18n.t("creatorProfile.artistGroups") || "Artist Groups",
		noArtistStats: I18n.t("creatorProfile.noArtistStats") || "No artist stats yet.",
		sortLabel: I18n.t("creatorProfile.sortLabel") || "Sort",
		sortRecent: I18n.t("creatorProfile.sortRecent") || "Recent",
		sortPopular: I18n.t("creatorProfile.sortPopular") || "Popular",
		sortTitle: I18n.t("creatorProfile.sortTitle") || "Title",
		sortArtist: I18n.t("creatorProfile.sortArtist") || "Artist",
		clearArtistFilter: I18n.t("creatorProfile.clearArtistFilter") || "Clear artist filter",
		filteredArtist: I18n.t("creatorProfile.filteredArtist") || "Filtered artist"
	};
}

function mergeCreatorProfileContributions(currentItems, nextItems) {
	const merged = [];
	const seen = new Set();

	const appendUniqueItems = (items) => {
		if (!Array.isArray(items)) {
			return;
		}

		for (const item of items) {
			if (!item || typeof item !== "object") {
				continue;
			}

			const key = `${item.trackId || "unknown"}:${item.provider || "unknown"}`;
			if (seen.has(key)) {
				continue;
			}

			seen.add(key);
			merged.push(item);
		}
	};

	appendUniqueItems(currentItems);
	appendUniqueItems(nextItems);

	return merged;
}

function normalizeContributorEntry(contributor) {
	if (!contributor) {
		return null;
	}

	if (typeof contributor === "string") {
		const name = contributor.trim() || "Anonymous";
		return {
			key: `name:${name.toLowerCase()}`,
			userHash: null,
			name,
			avatarUrl: null,
			linked: false,
			profileAvailable: false
		};
	}

	if (typeof contributor !== "object") {
		return null;
	}

	const name = String(contributor.name || contributor.nickname || contributor.displayName || "Anonymous").trim() || "Anonymous";
	const userHash = typeof contributor.userHash === "string" && contributor.userHash.trim()
		? contributor.userHash.trim()
		: null;

	return {
		key: userHash || `name:${name.toLowerCase()}`,
		userHash,
		name,
		avatarUrl: typeof contributor.avatarUrl === "string" ? contributor.avatarUrl : null,
		linked: !!contributor.linked,
		profileAvailable: contributor.profileAvailable ?? !!userHash
	};
}

function getDisplayContributors(contributors, limit = 3) {
	if (!Array.isArray(contributors) || contributors.length === 0) {
		return [];
	}

	const result = [];
	const seen = new Set();
	let anonymousAdded = false;

	for (const rawContributor of contributors) {
		const contributor = normalizeContributorEntry(rawContributor);
		if (!contributor) {
			continue;
		}

		const isAnonymous = contributor.name.toLowerCase() === "anonymous" && !contributor.profileAvailable;
		if (isAnonymous) {
			if (anonymousAdded) {
				continue;
			}
			anonymousAdded = true;
			result.push(contributor);
		} else {
			const key = contributor.userHash || contributor.key;
			if (seen.has(key)) {
				continue;
			}
			seen.add(key);
			result.push(contributor);
		}

		if (limit > 0 && result.length >= limit) {
			break;
		}
	}

	return result;
}

function formatContributorTimestamp(epochSeconds) {
	if (!epochSeconds) {
		return null;
	}

	try {
		return new Date(epochSeconds * 1000).toLocaleDateString();
	} catch (error) {
		return null;
	}
}

function getCreatorProfileUiTheme() {
	try {
		const storedTheme = window.ivLyricsStoragePersistence?.getItem("ivLyrics:settings-ui-theme")
			?? localStorage.getItem("ivLyrics:settings-ui-theme");
		if (storedTheme === "light" || storedTheme === "dark") {
			return storedTheme;
		}

		return window.matchMedia?.("(prefers-color-scheme: light)")?.matches
			? "light"
			: "dark";
	} catch (error) {
		return "dark";
	}
}

function getCreatorPublicProfileUrl(profileData, contributor) {
	const rawIdentifier = profileData?.account?.username
		|| profileData?.nickname
		|| profileData?.userHash
		|| contributor?.userHash;
	const identifier = typeof rawIdentifier === "string"
		? rawIdentifier.replace(/^@+/, "").trim()
		: "";

	if (!identifier) {
		return null;
	}

	return `https://lyrics.ivl.is/@${encodeURIComponent(identifier)}`;
}

const CREATOR_GREETING_LANGUAGE_CODES = new Set([
	"ar",
	"bn",
	"de",
	"en",
	"es",
	"fa",
	"fr",
	"hi",
	"id",
	"it",
	"ja",
	"ko",
	"ms",
	"pt",
	"ru",
	"sv",
	"th",
	"tr",
	"vi",
	"zh-CN",
	"zh-TW"
]);
const CREATOR_GREETING_LANGUAGE_ALIASES = new Map([
	["zh", "zh-CN"],
	["zh-cn", "zh-CN"],
	["zh-hans", "zh-CN"],
	["zh-sg", "zh-CN"],
	["zh-tw", "zh-TW"],
	["zh-hk", "zh-TW"],
	["zh-mo", "zh-TW"],
	["zh-hant", "zh-TW"],
	["pt-br", "pt"],
	["pt-pt", "pt"]
]);
const CREATOR_GREETING_TRANSLATING_MESSAGES = {
	en: "Translating this greeting...",
	ko: "인삿말을 번역하는 중입니다...",
	ja: "あいさつを翻訳しています...",
	"zh-CN": "正在翻译这段问候语...",
	"zh-TW": "正在翻譯這段問候語...",
	de: "Diese Begrüßung wird übersetzt...",
	es: "Traduciendo este saludo...",
	fr: "Traduction de ce message...",
	it: "Traduzione del saluto...",
	pt: "Traduzindo esta saudação...",
	ru: "Переводим это приветствие...",
	ar: "تتم ترجمة هذه التحية...",
	fa: "در حال ترجمه این پیام...",
	bn: "এই শুভেচ্ছাটি অনুবাদ করা হচ্ছে...",
	hi: "इस अभिवादन का अनुवाद हो रहा है...",
	id: "Menerjemahkan sapaan ini...",
	ms: "Menterjemah ucapan ini...",
	sv: "Översätter hälsningen...",
	th: "กำลังแปลคำทักทายนี้...",
	tr: "Bu karşılama çevriliyor...",
	vi: "Đang dịch lời chào này..."
};

function normalizeCreatorGreetingLocale(value) {
	const raw = String(value || "").trim();
	if (!raw) {
		return null;
	}

	const normalized = raw.replace(/_/g, "-");
	if (CREATOR_GREETING_LANGUAGE_CODES.has(normalized)) {
		return normalized;
	}

	const lower = normalized.toLowerCase();
	if (CREATOR_GREETING_LANGUAGE_ALIASES.has(lower)) {
		return CREATOR_GREETING_LANGUAGE_ALIASES.get(lower);
	}

	const base = lower.split("-")[0];
	return CREATOR_GREETING_LANGUAGE_CODES.has(base) ? base : null;
}

function getCreatorProfileLocale() {
	const candidates = [
		window.I18n?.getCurrentLanguage?.(),
		typeof I18n !== "undefined" ? I18n.getCurrentLanguage?.() : null,
		window.StorageManager?.getItem?.("ivLyrics:visual:language"),
		Spicetify?.LocalStorage?.get?.("ivLyrics:visual:language"),
		Spicetify?.Locale?.getLocale?.()
	];

	for (const candidate of candidates) {
		const locale = normalizeCreatorGreetingLocale(candidate);
		if (locale) {
			return locale;
		}
	}

	return normalizeCreatorGreetingLocale(window.I18n?.DEFAULT_LANGUAGE) || "ko";
}

function getCreatorGreetingTranslatingMessage(locale) {
	const normalizedLocale = normalizeCreatorGreetingLocale(locale);
	return CREATOR_GREETING_TRANSLATING_MESSAGES[normalizedLocale]
		|| CREATOR_GREETING_TRANSLATING_MESSAGES.en;
}

function prepareCreatorGreetingTranslationState(profileData, locale, currentProfile = null) {
	if (!profileData || typeof profileData !== "object") {
		return profileData;
	}

	const targetLocale = normalizeCreatorGreetingLocale(locale) || getCreatorProfileLocale();
	const sourceLocale = normalizeCreatorGreetingLocale(profileData.greetingLang);
	const rawGreeting = typeof profileData.greeting === "string" ? profileData.greeting : "";
	const nextProfile = {
		...profileData,
		localizedGreeting: null,
		greetingTranslationLocale: targetLocale,
		greetingTranslationStatus: rawGreeting.trim() ? "idle" : "empty",
		greetingTranslationSourceLocale: sourceLocale || null
	};

	if (!rawGreeting.trim()) {
		return nextProfile;
	}

	if (sourceLocale && targetLocale && sourceLocale === targetLocale) {
		nextProfile.greetingTranslationStatus = "source";
		return nextProfile;
	}

	if (
		currentProfile
		&& currentProfile.userHash === nextProfile.userHash
		&& currentProfile.greeting === rawGreeting
		&& normalizeCreatorGreetingLocale(currentProfile.greetingTranslationLocale) === targetLocale
		&& typeof currentProfile.localizedGreeting === "string"
		&& currentProfile.localizedGreeting.trim()
	) {
		nextProfile.localizedGreeting = currentProfile.localizedGreeting;
		nextProfile.greetingTranslationStatus = currentProfile.greetingTranslationStatus || "ready";
		return nextProfile;
	}

	nextProfile.greetingTranslationStatus = targetLocale ? "loading" : "idle";
	return nextProfile;
}

function shouldFetchCreatorGreetingTranslation(profileData) {
	return !!(
		profileData
		&& profileData.userHash
		&& typeof profileData.greeting === "string"
		&& profileData.greeting.trim()
		&& profileData.greetingTranslationLocale
		&& profileData.greetingTranslationStatus === "loading"
	);
}

const CREATOR_PROFILE_PAGE_SIZE = 12;

function normalizeCreatorCoverText(value) {
	return String(value || "")
		.toLowerCase()
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
		.replace(/[^a-z0-9가-힣ぁ-ゔァ-ヴー一-龯]+/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function getCreatorCoverFirstArtist(value) {
	return String(value || "")
		.split(/,|&|\bfeat\.?\b|\bfeaturing\b|\bwith\b|\bx\b/i)[0]
		.trim();
}

function upgradeCreatorItunesArtwork(url) {
	return String(url || "").replace(/\/\d+x\d+bb(?=\.(jpg|jpeg|png|webp)(\?|$))/i, "/600x600bb");
}

async function fetchCreatorProfileJson(url) {
	const response = await fetch(url, { headers: { Accept: "application/json" } });
	if (!response.ok) {
		throw new Error("Cover lookup failed");
	}
	return await response.json();
}

async function searchCreatorItunesCover(title, artist) {
	const term = [title, getCreatorCoverFirstArtist(artist)].filter(Boolean).join(" ").trim();
	if (!term) return null;

	const url = new URL("https://itunes.apple.com/search");
	url.searchParams.set("term", term);
	url.searchParams.set("media", "music");
	url.searchParams.set("entity", "song");
	url.searchParams.set("limit", "8");

	const data = await fetchCreatorProfileJson(url.toString());
	const results = Array.isArray(data.results) ? data.results : [];
	if (!results.length) return null;

	const wantedTitle = normalizeCreatorCoverText(title);
	const wantedArtist = normalizeCreatorCoverText(getCreatorCoverFirstArtist(artist));
	const best = results.find((item) => {
		const itemTitle = normalizeCreatorCoverText(item.trackName);
		const itemArtist = normalizeCreatorCoverText(item.artistName);
		return itemTitle === wantedTitle && (!wantedArtist || itemArtist.includes(wantedArtist) || wantedArtist.includes(itemArtist));
	}) || results.find((item) => normalizeCreatorCoverText(item.trackName) === wantedTitle) || results[0];

	return best?.artworkUrl100 ? upgradeCreatorItunesArtwork(best.artworkUrl100) : null;
}

function escapeCreatorMusicBrainzQuery(value) {
	return String(value || "").replace(/["\\]/g, " ").trim();
}

async function searchCreatorMusicBrainzCover(title, artist) {
	const safeTitle = escapeCreatorMusicBrainzQuery(title);
	const safeArtist = escapeCreatorMusicBrainzQuery(getCreatorCoverFirstArtist(artist));
	if (!safeTitle) return null;

	const query = safeArtist
		? `recording:"${safeTitle}" AND artist:"${safeArtist}"`
		: `recording:"${safeTitle}"`;
	const url = new URL("https://musicbrainz.org/ws/2/recording/");
	url.searchParams.set("query", query);
	url.searchParams.set("fmt", "json");
	url.searchParams.set("limit", "5");

	const data = await fetchCreatorProfileJson(url.toString());
	const releaseIds = [];
	for (const recording of data.recordings || []) {
		for (const release of recording.releases || []) {
			if (release.id && !releaseIds.includes(release.id)) {
				releaseIds.push(release.id);
			}
		}
	}

	for (const releaseId of releaseIds.slice(0, 4)) {
		try {
			const coverData = await fetchCreatorProfileJson(`https://coverartarchive.org/release/${encodeURIComponent(releaseId)}`);
			const images = Array.isArray(coverData.images) ? coverData.images : [];
			const image = images.find((item) => item.front) || images[0];
			const thumbs = image?.thumbnails || {};
			const coverUrl = thumbs.large || thumbs["500"] || thumbs.small || image?.image;
			if (coverUrl) return coverUrl;
		} catch (error) {
			// Try the next release when Cover Art Archive has no image.
		}
	}

	return null;
}

async function findCreatorTrackCover(title, artist) {
	try {
		const itunesCover = await searchCreatorItunesCover(title, artist);
		if (itunesCover) return itunesCover;
	} catch (error) {
		// Fall through to MusicBrainz.
	}

	try {
		return await searchCreatorMusicBrainzCover(title, artist);
	} catch (error) {
		return null;
	}
}

const CreatorProfileTrackCover = react.memo(({ title, artist }) => {
	const [coverUrl, setCoverUrl] = useState(null);
	const [failed, setFailed] = useState(false);
	const cacheKey = useMemo(() => (
		`${normalizeCreatorCoverText(title)}|${normalizeCreatorCoverText(getCreatorCoverFirstArtist(artist))}`
	), [artist, title]);

	useEffect(() => {
		let cancelled = false;
		setCoverUrl(null);
		setFailed(false);
		if (!title) return undefined;

		findCreatorTrackCover(title, artist).then((url) => {
			if (!cancelled && url) {
				setCoverUrl(url);
			}
		}).catch(() => {
			if (!cancelled) {
				setFailed(true);
			}
		});

		return () => {
			cancelled = true;
		};
	}, [artist, cacheKey, title]);

	return react.createElement(
		"div",
		{ className: `lyrics-creator-profile-track-cover ${coverUrl && !failed ? "is-loaded" : ""}`.trim() },
		react.createElement("div", { className: "lyrics-creator-profile-track-cover-ph" }),
		react.createElement("div", { className: "lyrics-creator-profile-track-cover-glyph" }, "♪"),
		coverUrl && !failed && react.createElement("img", {
			src: coverUrl,
			alt: "",
			loading: "lazy",
			decoding: "async",
			onError: () => setFailed(true)
		})
	);
});

function createCreatorProfileShell(contributor, options = {}) {
	const sort = typeof options.sort === "string" && options.sort.trim() ? options.sort.trim() : "recent";
	const artist = typeof options.artist === "string" && options.artist.trim() ? options.artist.trim() : null;
	const displayName = contributor?.name || "Anonymous";

	return {
		userHash: contributor?.userHash || null,
		displayName,
		account: contributor?.avatarUrl
			? {
				profileImage: contributor.avatarUrl,
				displayName
			}
			: null,
		stats: null,
		viewer: {
			authenticated: false,
			isOwnProfile: false,
			canLike: false,
			liked: false
		},
		artistStats: {
			items: []
		},
		filters: {
			sort,
			artist
		},
		contributions: [],
		pagination: {
			offset: 0,
			limit: CREATOR_PROFILE_PAGE_SIZE,
			returnedCount: 0,
			totalCount: 0,
			hasMore: false,
			nextOffset: null
		}
	};
}

const SyncCreatorProfileModal = react.memo(({
	contributor,
	profile,
	loading,
	error,
	likePending,
	greetingPending,
	loadMorePending,
	listRefreshing,
	onClose,
	onToggleLike,
	onSaveGreeting,
	onLoadMore,
	onTrackClick,
	activeSortMode,
	activeArtistFilter,
	onSortChange,
	onArtistFilterChange
}) => {
	const copy = getCreatorProfileCopy();
	const [uiTheme, setUiTheme] = react.useState(getCreatorProfileUiTheme);
	const profileData = profile || {};
	const contributions = Array.isArray(profileData.contributions) ? profileData.contributions : [];
	const displayName = profileData.displayName || contributor?.name || copy.anonymous;
	const account = profileData.account || null;
	const handle = account?.username ? `@${account.username}` : null;
	const avatarUrl = account?.profileImage || contributor?.avatarUrl || null;
	const initial = (displayName || copy.anonymous).charAt(0).toUpperCase();
	const trackCount = Number(profileData.stats?.trackCount || 0);
	const likeCount = Number(profileData.stats?.likeCount || 0);
	const artistGroupCount = Number(profileData.stats?.artistGroupCount || 0);
	const totalContributionCount = Number(profileData.pagination?.totalCount || trackCount || 0);
	const loadedContributionCount = contributions.length;
	const hasMoreContributions = !!profileData.pagination?.hasMore;
	const bodyRef = react.useRef(null);
	const loadMoreLockRef = react.useRef(false);
	const [failedAvatarUrl, setFailedAvatarUrl] = react.useState(null);
	const rawGreeting = typeof profileData.greeting === "string" ? profileData.greeting : "";
	const localizedGreeting = typeof profileData.localizedGreeting === "string" ? profileData.localizedGreeting : "";
	const displayGreeting = localizedGreeting.trim() ? localizedGreeting : rawGreeting;
	const greetingTranslationStatus = typeof profileData.greetingTranslationStatus === "string"
		? profileData.greetingTranslationStatus
		: null;
	const greetingTranslationLocale = profileData.greetingTranslationLocale || getCreatorProfileLocale();
	const [isEditingGreeting, setIsEditingGreeting] = react.useState(false);
	const [greetingDraft, setGreetingDraft] = react.useState(rawGreeting);
	const canLike = !!profileData.viewer?.canLike;
	const liked = !!profileData.viewer?.liked;
	const isOwnProfile = !!profileData.viewer?.isOwnProfile;
	const avatarFailed = !!avatarUrl && failedAvatarUrl === avatarUrl;
	const subtitle = handle || (account?.displayName && account.displayName !== displayName ? account.displayName : null);
	const greeting = displayGreeting.trim();
	const showGreetingTranslationStatus = greetingTranslationStatus === "loading" && !!rawGreeting.trim();
	const canEditGreeting = isOwnProfile && typeof onSaveGreeting === "function";
	const publicProfileUrl = getCreatorPublicProfileUrl(profileData, contributor);
	const likeButtonLabel = likePending ? "..." : liked ? copy.liked : copy.like;
	const likeButtonTitle = !profileData.viewer?.authenticated && !isOwnProfile
		? copy.likeLoginRequired
		: copy.like;
	const isDarkTheme = uiTheme !== "light";
	const themeButtonTitle = isDarkTheme ? copy.switchToLight : copy.switchToDark;
	const themeButtonLabel = isDarkTheme ? copy.themeLight : copy.themeDark;
	const artistStats = Array.isArray(profileData.artistStats?.items) ? profileData.artistStats.items : [];
	const sortMode = activeSortMode || profileData.filters?.sort || "recent";
	const artistFilter = activeArtistFilter ?? profileData.filters?.artist ?? null;
	const hasLoadedProfileData = !!profileData.stats;
	const showSectionLoading = loading && !error && !hasLoadedProfileData;
	const sortOptions = [
		{ key: "recent", label: copy.sortRecent },
		{ key: "popular", label: copy.sortPopular }
	];
	const handleGreetingSave = react.useCallback(async () => {
		if (!canEditGreeting || typeof onSaveGreeting !== "function") {
			return;
		}

		try {
			await onSaveGreeting(greetingDraft);
			setIsEditingGreeting(false);
		} catch (error) {
			// The parent handler owns user-facing error messaging.
		}
	}, [canEditGreeting, greetingDraft, onSaveGreeting]);
	const closeIcon = react.createElement(
		"svg",
		{
			width: 16,
			height: 16,
			viewBox: "0 0 16 16",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.8,
			strokeLinecap: "round"
		},
		react.createElement("path", { d: "M3 3l10 10" }),
		react.createElement("path", { d: "M13 3L3 13" })
	);
	const themeIcon = isDarkTheme
		? react.createElement(
			"svg",
			{
				width: 16,
				height: 16,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true"
			},
			react.createElement("circle", { cx: 12, cy: 12, r: 4 }),
			react.createElement("path", { d: "M12 2v2" }),
			react.createElement("path", { d: "M12 20v2" }),
			react.createElement("path", { d: "m4.93 4.93 1.41 1.41" }),
			react.createElement("path", { d: "m17.66 17.66 1.41 1.41" }),
			react.createElement("path", { d: "M2 12h2" }),
			react.createElement("path", { d: "M20 12h2" }),
			react.createElement("path", { d: "m6.34 17.66-1.41 1.41" }),
			react.createElement("path", { d: "m19.07 4.93-1.41 1.41" })
		)
		: react.createElement(
			"svg",
			{
				width: 16,
				height: 16,
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: 2,
				strokeLinecap: "round",
				strokeLinejoin: "round",
				"aria-hidden": "true"
			},
			react.createElement("path", { d: "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8 8 0 1 0 11 11Z" })
		);
	const likeIcon = react.createElement(
		"svg",
		{
			width: 14,
			height: 14,
			viewBox: "0 0 16 16",
			fill: liked ? "currentColor" : "none",
			stroke: "currentColor",
			strokeWidth: 1.5,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true"
		},
		react.createElement("path", { d: "M8 13.4 2.9 8.6a3.2 3.2 0 0 1 4.5-4.5L8 4.7l.6-.6a3.2 3.2 0 1 1 4.5 4.5L8 13.4Z" })
	);

	const maybeLoadMore = react.useCallback(() => {
		const body = bodyRef.current;
		if (!body || !hasMoreContributions || loadMorePending || loading || error || typeof onLoadMore !== "function") {
			return;
		}

		const remaining = body.scrollHeight - body.scrollTop - body.clientHeight;
		if (remaining > 160 || loadMoreLockRef.current) {
			return;
		}

		loadMoreLockRef.current = true;
		onLoadMore();
	}, [error, hasMoreContributions, loadMorePending, loading, onLoadMore]);

	react.useEffect(() => {
		if (!loadMorePending) {
			loadMoreLockRef.current = false;
		}
	}, [loadMorePending, loadedContributionCount]);

	react.useEffect(() => {
		maybeLoadMore();
	}, [maybeLoadMore, loadedContributionCount]);

	react.useEffect(() => {
		if (!isEditingGreeting) {
			setGreetingDraft(rawGreeting);
		}
	}, [isEditingGreeting, rawGreeting]);

	react.useEffect(() => {
		if (!canEditGreeting && isEditingGreeting) {
			setIsEditingGreeting(false);
		}
	}, [canEditGreeting, isEditingGreeting]);

	react.useEffect(() => {
		try {
			const normalizedTheme = uiTheme === "light" ? "light" : "dark";
			if (window.ivLyricsStoragePersistence) {
				window.ivLyricsStoragePersistence.setItem("ivLyrics:settings-ui-theme", normalizedTheme);
			} else {
				localStorage.setItem("ivLyrics:settings-ui-theme", normalizedTheme);
			}
		} catch (error) {
			// Ignore storage failures in restricted runtimes.
		}
	}, [uiTheme]);

	const content = react.createElement(
		react.Fragment,
		null,
		react.createElement(
			"div",
			{ className: "lyrics-creator-profile-hero" },
			avatarUrl && !avatarFailed
				? react.createElement("img", {
					key: avatarUrl,
					className: "lyrics-creator-profile-avatar",
					src: avatarUrl,
					alt: displayName,
					onLoad: (event) => {
						event.currentTarget.style.display = "";
					},
					onError: () => {
						setFailedAvatarUrl(avatarUrl);
					}
				})
				: react.createElement(
					"div",
					{ className: "lyrics-creator-profile-avatar lyrics-creator-profile-avatar-fallback" },
					initial
				),
			react.createElement(
				"div",
				{ className: "lyrics-creator-profile-info" },
				react.createElement(
					"div",
					{ className: "lyrics-creator-profile-name-row" },
					react.createElement(
						"div",
						{ className: "lyrics-creator-profile-title-block" },
						react.createElement("h2", { className: "lyrics-creator-profile-name" }, displayName),
						subtitle && react.createElement("div", { className: "lyrics-creator-profile-handle" }, subtitle)
					),
				react.createElement(
					"div",
					{ className: "lyrics-creator-profile-actions" },
					publicProfileUrl && react.createElement(
						"a",
						{
							className: "lyrics-creator-profile-public-link",
							href: publicProfileUrl,
							target: "_blank",
							rel: "noopener noreferrer",
							title: copy.openProfile
						},
						copy.openProfile
					),
					react.createElement(
						"button",
						{
							type: "button",
								className: `lyrics-creator-profile-like-inline ${liked ? "is-liked" : ""} ${likePending ? "is-loading" : ""}`.trim(),
								onClick: onToggleLike,
								disabled: likePending || !canLike,
								title: likeButtonTitle,
								"aria-label": likeButtonLabel
						},
						likeIcon,
						react.createElement("span", null, likeButtonLabel)
					)
				)
				),
			(greeting || canEditGreeting) && react.createElement(
				"div",
				{ className: "lyrics-creator-profile-greeting-block" },
				canEditGreeting && isEditingGreeting
					? react.createElement(
							"div",
							{ className: "lyrics-creator-profile-greeting-editor" },
							react.createElement("textarea", {
								className: "lyrics-creator-profile-greeting-input",
								value: greetingDraft,
								maxLength: 400,
								rows: 4,
								placeholder: copy.greetingPlaceholder,
								disabled: greetingPending,
								onChange: (event) => setGreetingDraft(event.currentTarget.value)
							}),
							react.createElement(
								"div",
								{ className: "lyrics-creator-profile-greeting-editor-bar" },
								react.createElement("span", { className: "lyrics-creator-profile-greeting-count" }, `${greetingDraft.length}/400`),
								react.createElement(
									"div",
									{ className: "lyrics-creator-profile-greeting-editor-actions" },
									react.createElement(
										"button",
										{
											type: "button",
											className: "lyrics-creator-profile-greeting-cancel",
											disabled: greetingPending,
											onClick: () => {
												setGreetingDraft(rawGreeting);
												setIsEditingGreeting(false);
											}
										},
										copy.cancelGreeting
									),
									react.createElement(
										"button",
										{
											type: "button",
											className: "lyrics-creator-profile-greeting-save",
											disabled: greetingPending,
											onClick: handleGreetingSave
										},
										greetingPending ? "..." : copy.saveGreeting
									)
								)
							)
						)
					: react.createElement(
							react.Fragment,
							null,
							greeting && react.createElement("p", { className: "lyrics-creator-profile-bio" }, greeting),
							showGreetingTranslationStatus && react.createElement(
								"p",
								{
									className: "lyrics-creator-profile-greeting-status",
									role: "status"
								},
								getCreatorGreetingTranslatingMessage(greetingTranslationLocale)
							),
							canEditGreeting && react.createElement(
								"button",
								{
									type: "button",
									className: "lyrics-creator-profile-greeting-edit",
									onClick: () => {
										setGreetingDraft(rawGreeting);
										setIsEditingGreeting(true);
									}
								},
								greeting ? copy.editGreeting : copy.addGreeting
							)
						)
			),
			hasLoadedProfileData
				? react.createElement(
						"div",
						{ className: "lyrics-creator-profile-stats" },
						react.createElement(
							"div",
							{ className: "lyrics-creator-profile-stat" },
							react.createElement("strong", null, trackCount.toLocaleString()),
							react.createElement("span", null, copy.tracks)
						),
						react.createElement(
							"div",
							{ className: "lyrics-creator-profile-stat" },
							react.createElement("strong", null, likeCount.toLocaleString()),
							react.createElement("span", null, copy.likes)
						)
					)
					: react.createElement(
						"div",
						{ className: "lyrics-creator-profile-inline-state" },
						copy.loading
					)
			)
		),
		error
			? react.createElement(
				"div",
				{ className: "lyrics-creator-profile-state lyrics-creator-profile-error" },
				error
			)
			: showSectionLoading
				? react.createElement(
					"div",
					{ className: "lyrics-creator-profile-state lyrics-creator-profile-state-compact" },
					copy.loading
				)
				: react.createElement(
					react.Fragment,
					null,
					react.createElement(
						"div",
						{ className: "lyrics-creator-profile-section-header lyrics-creator-profile-section-header-tight" },
						react.createElement("h3", { className: "lyrics-creator-profile-section-title" }, copy.topArtists),
						profileData.stats?.artistGroupCount > 0 && react.createElement(
							"div",
							{ className: "lyrics-creator-profile-section-meta" },
							String(profileData.stats.artistGroupCount)
						)
					),
					artistStats.length
						? react.createElement(
							"div",
							{ className: "lyrics-creator-profile-artist-stats" },
							...artistStats.map((item) => react.createElement(
								"button",
								{
									type: "button",
									key: item.name,
									className: `lyrics-creator-profile-artist-chip ${artistFilter === item.name ? "is-active" : ""}`.trim(),
									onClick: () => onArtistFilterChange?.(artistFilter === item.name ? null : item.name)
								},
								react.createElement("span", { className: "lyrics-creator-profile-artist-chip-name" }, item.name),
								react.createElement("span", { className: "lyrics-creator-profile-artist-chip-count" }, item.count)
							))
						)
						: react.createElement(
							"div",
							{ className: "lyrics-creator-profile-empty lyrics-creator-profile-empty-compact" },
							copy.noArtistStats
						),
					react.createElement(
						"div",
						{ className: "lyrics-creator-profile-toolbar" },
						react.createElement(
							"div",
							{ className: "lyrics-creator-profile-toolbar-group" },
							react.createElement("span", { className: "lyrics-creator-profile-toolbar-label" }, copy.sortLabel),
							react.createElement(
								"div",
								{ className: "lyrics-creator-profile-sort-controls" },
								...sortOptions.map((option) => react.createElement(
									"button",
									{
										type: "button",
										key: option.key,
										className: `lyrics-creator-profile-sort-btn ${sortMode === option.key ? "is-active" : ""}`.trim(),
										onClick: () => onSortChange?.(option.key),
										disabled: loadMorePending || listRefreshing
									},
									option.label
								))
							)
						),
						artistFilter && react.createElement(
							"button",
							{
								type: "button",
								className: "lyrics-creator-profile-filter-badge",
								onClick: () => onArtistFilterChange?.(null),
								disabled: loadMorePending || listRefreshing
							},
							`${copy.filteredArtist}: ${artistFilter} ×`
						)
					),
					react.createElement(
						"div",
						{ className: "lyrics-creator-profile-section-header" },
						react.createElement("h3", { className: "lyrics-creator-profile-section-title" }, copy.contributions),
						totalContributionCount > 0 && react.createElement(
							"div",
							{ className: "lyrics-creator-profile-section-meta" },
							`${loadedContributionCount}/${totalContributionCount}`
						)
					),
					listRefreshing && react.createElement(
						"div",
						{ className: "lyrics-creator-profile-list-status" },
						copy.loadingMore
					),
					contributions.length
						? react.createElement(
							react.Fragment,
							null,
							react.createElement(
								"div",
								{ className: `lyrics-creator-profile-grid ${listRefreshing ? "is-refreshing" : ""}`.trim() },
								...contributions.map((item) => {
									const updatedLabel = formatContributorTimestamp(item.updatedAt || item.createdAt);
									return react.createElement(
										"button",
										{
											type: "button",
											key: `${item.trackId}:${item.provider}`,
											className: "lyrics-creator-profile-track",
											onClick: () => onTrackClick(item.trackId)
						},
						react.createElement(CreatorProfileTrackCover, {
							title: item.trackName || copy.unknownTrack,
							artist: item.artists || item.trackId
						}),
						react.createElement(
							"div",
							{ className: "lyrics-creator-profile-track-main" },
											react.createElement("div", { className: "lyrics-creator-profile-track-title" }, item.trackName || copy.unknownTrack),
											react.createElement("div", { className: "lyrics-creator-profile-track-artist" }, item.artists || item.trackId)
										),
										react.createElement(
											"div",
											{ className: "lyrics-creator-profile-track-side" },
											react.createElement("span", { className: "lyrics-creator-profile-track-provider" }, item.provider),
											updatedLabel && react.createElement("span", { className: "lyrics-creator-profile-track-updated" }, `${copy.updated} ${updatedLabel}`)
										)
									);
								})
							),
							hasMoreContributions && react.createElement(
								"div",
								{ className: "lyrics-creator-profile-grid-footer" },
								loadMorePending
									? react.createElement(
										"div",
										{ className: "lyrics-creator-profile-load-more is-loading" },
										copy.loadingMore
									)
									: null
							)
						)
						: react.createElement(
							"div",
							{ className: "lyrics-creator-profile-empty" },
							copy.noContributions
						)
				)
	);

	return react.createElement(
		"div",
		{
			className: "lyrics-creator-profile-overlay",
			"data-ui-theme": uiTheme,
			onClick: onClose
		},
		react.createElement(
			"div",
			{
				className: "lyrics-creator-profile-modal",
				"data-ui-theme": uiTheme,
				onClick: (event) => event.stopPropagation()
			},
			react.createElement(
				"div",
				{ className: "lyrics-creator-profile-header" },
				react.createElement(
					"div",
					{ className: "lyrics-creator-profile-title-wrap" },
					react.createElement("h2", { className: "lyrics-creator-profile-header-title" }, copy.title)
				),
				react.createElement(
					"div",
					{ className: "lyrics-creator-profile-header-actions" },
					react.createElement(
						"button",
						{
							type: "button",
							className: "lyrics-creator-profile-theme-toggle",
							onClick: () => setUiTheme((currentTheme) => currentTheme === "light" ? "dark" : "light"),
							title: themeButtonTitle,
							"aria-label": themeButtonTitle
						},
						themeIcon,
						react.createElement("span", null, themeButtonLabel)
					),
					react.createElement(
						"button",
						{
							type: "button",
							className: "lyrics-creator-profile-close",
							onClick: onClose,
							title: copy.back
						},
						closeIcon
					)
				)
			),
			react.createElement(
				"div",
				{
					className: "lyrics-creator-profile-body",
					ref: bodyRef,
					onScroll: maybeLoadMore
				},
				content
			),
			react.createElement(
				"div",
				{ className: "lyrics-creator-profile-footer" },
				react.createElement(
					"button",
					{
						type: "button",
						className: "lyrics-creator-profile-footer-btn",
						onClick: onClose
					},
					copy.back
				)
			)
		)
	);
});

// CreditFooter implementing provider and contributor display
const CreditFooter = react.memo(({ provider, contributors }) => {
	const copy = getCreatorProfileCopy();
	const reactDom = window.Spicetify?.ReactDOM ?? window.ReactDOM ?? null;
	const visibleContributors = useMemo(() => getDisplayContributors(contributors, 3), [contributors]);
	const [activeContributor, setActiveContributor] = useState(null);
	const [creatorProfile, setCreatorProfile] = useState(null);
	const [profileLoading, setProfileLoading] = useState(false);
	const [profileError, setProfileError] = useState(null);
	const [likePending, setLikePending] = useState(false);
	const [greetingPending, setGreetingPending] = useState(false);
	const [profileLoadingMore, setProfileLoadingMore] = useState(false);
	const [profileListRefreshing, setProfileListRefreshing] = useState(false);
	const [profileSort, setProfileSort] = useState("recent");
	const [profileArtistFilter, setProfileArtistFilter] = useState(null);
	const requestIdRef = useRef(0);
	const greetingTranslationRequestIdRef = useRef(0);

	const closeProfile = useCallback(() => {
		requestIdRef.current += 1;
		greetingTranslationRequestIdRef.current += 1;
		setActiveContributor(null);
		setCreatorProfile(null);
		setProfileLoading(false);
		setProfileError(null);
		setLikePending(false);
		setGreetingPending(false);
		setProfileLoadingMore(false);
		setProfileListRefreshing(false);
		setProfileSort("recent");
		setProfileArtistFilter(null);
	}, []);

	useEffect(() => {
		if (!activeContributor) {
			return undefined;
		}

		const onKeyDown = (event) => {
			if (event.key === "Escape") {
				closeProfile();
			}
		};

		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [activeContributor, closeProfile]);

	const loadCreatorGreetingTranslation = useCallback(async (profileData) => {
		if (!shouldFetchCreatorGreetingTranslation(profileData)) {
			return;
		}

		const locale = normalizeCreatorGreetingLocale(profileData.greetingTranslationLocale);
		if (!locale) {
			return;
		}

		const requestId = greetingTranslationRequestIdRef.current + 1;
		greetingTranslationRequestIdRef.current = requestId;

		try {
			const result = await Utils.fetchSyncCreatorGreetingTranslation(profileData.userHash, locale);
			if (greetingTranslationRequestIdRef.current !== requestId) {
				return;
			}

			const translatedGreeting = result?.status === "ready" && typeof result.text === "string"
				? result.text
				: "";
			setCreatorProfile((currentProfile) => {
				if (
					!currentProfile
					|| currentProfile.userHash !== profileData.userHash
					|| currentProfile.greeting !== profileData.greeting
					|| normalizeCreatorGreetingLocale(currentProfile.greetingTranslationLocale) !== locale
				) {
					return currentProfile;
				}

				return {
					...currentProfile,
					localizedGreeting: translatedGreeting.trim() ? translatedGreeting : null,
					greetingTranslationStatus: result?.status || (translatedGreeting.trim() ? "ready" : "unavailable"),
					greetingTranslationSourceLocale: result?.sourceLocale || currentProfile.greetingTranslationSourceLocale || null
				};
			});
		} catch (error) {
			if (greetingTranslationRequestIdRef.current !== requestId) {
				return;
			}

			console.error("[ivLyrics] Failed to translate creator greeting:", error);
			setCreatorProfile((currentProfile) => {
				if (
					!currentProfile
					|| currentProfile.userHash !== profileData.userHash
					|| currentProfile.greeting !== profileData.greeting
					|| normalizeCreatorGreetingLocale(currentProfile.greetingTranslationLocale) !== locale
				) {
					return currentProfile;
				}

				return {
					...currentProfile,
					greetingTranslationStatus: "unavailable"
				};
			});
		}
	}, []);

	const loadCreatorProfile = useCallback(async (contributor, options = {}) => {
		if (!contributor?.profileAvailable || !contributor.userHash) {
			return;
		}

		const {
			offset = 0,
			sort = "recent",
			artist = null,
			append = false,
			preserveProfile = false
		} = options;
		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;
		if (append) {
			setProfileLoadingMore(true);
		} else if (preserveProfile) {
			setProfileListRefreshing(true);
		} else {
			setProfileLoading(true);
			setProfileError(null);
			setProfileLoadingMore(false);
		}

		try {
			const data = await Utils.fetchSyncCreatorProfile(contributor.userHash, {
				limit: CREATOR_PROFILE_PAGE_SIZE,
				offset,
				sort,
				artist
			});
			if (requestIdRef.current !== requestId) {
				return;
			}

			const profileLocale = getCreatorProfileLocale();
			const dataWithInitialGreetingState = prepareCreatorGreetingTranslationState(data, profileLocale);
			setCreatorProfile((currentProfile) => {
				const dataWithGreetingState = prepareCreatorGreetingTranslationState(data, profileLocale, currentProfile);
				if (!append || !currentProfile || currentProfile.userHash !== data.userHash) {
					if (preserveProfile && currentProfile && currentProfile.userHash === data.userHash) {
						return {
							...currentProfile,
							...dataWithGreetingState,
							account: data.account || currentProfile.account,
							displayName: data.displayName || currentProfile.displayName
						};
					}

					return dataWithGreetingState;
				}

				return {
					...dataWithGreetingState,
					contributions: mergeCreatorProfileContributions(
						currentProfile.contributions,
						data.contributions
					),
					stats: {
						...currentProfile.stats,
						...data.stats
					},
					viewer: {
						...currentProfile.viewer,
						...data.viewer
					},
					artistStats: data.artistStats || currentProfile.artistStats,
					filters: data.filters || currentProfile.filters
				};
			});
			if (!append && shouldFetchCreatorGreetingTranslation(dataWithInitialGreetingState)) {
				void loadCreatorGreetingTranslation(dataWithInitialGreetingState);
			}
		} catch (error) {
			if (requestIdRef.current !== requestId) {
				return;
			}
			if (append) {
				Toast.error(error.message || copy.loadFailed);
			} else if (preserveProfile) {
				Toast.error(error.message || copy.loadFailed);
			} else {
				setProfileError(error.message || copy.loadFailed);
			}
		} finally {
			if (requestIdRef.current === requestId) {
				if (append) {
					setProfileLoadingMore(false);
				} else if (preserveProfile) {
					setProfileListRefreshing(false);
				} else {
					setProfileLoading(false);
				}
			}
		}
	}, [copy.loadFailed, loadCreatorGreetingTranslation]);

	const openCreatorProfile = useCallback(async (contributor) => {
		if (!contributor?.profileAvailable || !contributor.userHash) {
			return;
		}

		setActiveContributor(contributor);
		setProfileError(null);
		setLikePending(false);
		setProfileSort("recent");
		setProfileArtistFilter(null);
		setProfileListRefreshing(false);
		setCreatorProfile(createCreatorProfileShell(contributor, {
			sort: "recent",
			artist: null
		}));
		void loadCreatorProfile(contributor, {
			offset: 0,
			sort: "recent",
			artist: null,
			append: false
		});
	}, [loadCreatorProfile]);

	const handleLoadMore = useCallback(async () => {
		if (!activeContributor?.userHash || !creatorProfile?.pagination?.hasMore || profileLoadingMore) {
			return;
		}

		await loadCreatorProfile(activeContributor, {
			offset: Number(creatorProfile.pagination?.nextOffset || creatorProfile.contributions?.length || 0),
			sort: profileSort,
			artist: profileArtistFilter,
			append: true
		});
	}, [activeContributor, creatorProfile, loadCreatorProfile, profileArtistFilter, profileLoadingMore, profileSort]);

	const handleSortChange = useCallback(async (nextSort) => {
		if (!activeContributor?.userHash || !nextSort || nextSort === profileSort) {
			return;
		}

		setProfileSort(nextSort);
		void loadCreatorProfile(activeContributor, {
			offset: 0,
			sort: nextSort,
			artist: profileArtistFilter,
			append: false,
			preserveProfile: true
		});
	}, [activeContributor, loadCreatorProfile, profileArtistFilter, profileSort]);

	const handleArtistFilterChange = useCallback(async (nextArtist) => {
		if (!activeContributor?.userHash) {
			return;
		}

		const normalizedArtist = typeof nextArtist === "string" && nextArtist.trim()
			? nextArtist.trim()
			: null;

		if (normalizedArtist === profileArtistFilter) {
			return;
		}

		setProfileArtistFilter(normalizedArtist);
		void loadCreatorProfile(activeContributor, {
			offset: 0,
			sort: profileSort,
			artist: normalizedArtist,
			append: false,
			preserveProfile: true
		});
	}, [activeContributor, loadCreatorProfile, profileArtistFilter, profileSort]);

	const handleToggleLike = useCallback(async () => {
		if (!creatorProfile?.userHash) {
			return;
		}

		if (!creatorProfile.viewer?.authenticated) {
			Toast.error(copy.likeLoginRequired);
			return;
		}

		setLikePending(true);
		try {
			const result = await Utils.setSyncCreatorLike(creatorProfile.userHash, !creatorProfile.viewer?.liked);
			setCreatorProfile((currentProfile) => currentProfile
				? {
					...currentProfile,
					stats: {
						...currentProfile.stats,
						likeCount: result.likeCount
					},
					viewer: {
						...currentProfile.viewer,
						liked: result.liked
					}
				}
				: currentProfile
			);
		} catch (error) {
			Toast.error(error.message || copy.likeActionFailed);
		} finally {
			setLikePending(false);
		}
	}, [copy.likeActionFailed, copy.likeLoginRequired, creatorProfile]);

	const handleSaveGreeting = useCallback(async (nextGreeting) => {
		if (!creatorProfile?.userHash || !creatorProfile.viewer?.isOwnProfile) {
			return null;
		}

		setGreetingPending(true);
		try {
			const result = await Utils.setSyncCreatorGreeting(nextGreeting, {
				creatorUserHash: creatorProfile.userHash
			});
			const savedGreeting = typeof result?.greeting === "string" ? result.greeting : "";
			const savedGreetingLang = typeof result?.greetingLang === "string" ? result.greetingLang : null;
			const profileLocale = getCreatorProfileLocale();
			const nextGreetingState = prepareCreatorGreetingTranslationState({
				...creatorProfile,
				greeting: savedGreeting,
				greetingLang: savedGreetingLang
			}, profileLocale);
			setCreatorProfile((currentProfile) => currentProfile
				? {
					...currentProfile,
					greeting: savedGreeting,
					greetingLang: savedGreetingLang,
					localizedGreeting: nextGreetingState.localizedGreeting,
					greetingTranslationLocale: nextGreetingState.greetingTranslationLocale,
					greetingTranslationStatus: nextGreetingState.greetingTranslationStatus,
					greetingTranslationSourceLocale: nextGreetingState.greetingTranslationSourceLocale
				}
				: currentProfile
			);
			if (shouldFetchCreatorGreetingTranslation(nextGreetingState)) {
				void loadCreatorGreetingTranslation(nextGreetingState);
			}
			Toast.success(copy.greetingSaveSuccess);
			return result;
		} catch (error) {
			Toast.error(error.message || copy.greetingSaveFailed);
			throw error;
		} finally {
			setGreetingPending(false);
		}
	}, [copy.greetingSaveFailed, copy.greetingSaveSuccess, creatorProfile, loadCreatorGreetingTranslation]);

	const handleTrackClick = useCallback((trackId) => {
		if (!trackId) {
			return;
		}

		closeProfile();
		Spicetify?.Platform?.History?.push?.(`/track/${trackId}`);
	}, [closeProfile]);

	if (!provider) {
		return null;
	}

	const footer = react.createElement(
		"div",
		{
			className: "lyrics-credit-footer",
			style: {
				position: "absolute",
				bottom: "40px",
				left: "50%",
				transform: "translateX(-50%)",
				width: "max-content",
				maxWidth: "min(92%, 980px)",
				fontSize: "12px",
				color: "var(--lyrics-color-inactive)",
				opacity: 0.7,
				textAlign: "center",
				zIndex: 200,
				textShadow: "0 0 10px rgba(0,0,0,0.5)",
				pointerEvents: "auto"
			}
		},
		react.createElement(
			"div",
			{
				className: "lyrics-credit-footer-content",
				onPointerDown: (event) => event.stopPropagation(),
				onClick: (event) => event.stopPropagation(),
				onMouseDown: (event) => event.stopPropagation()
			},
			react.createElement(
				"span",
				{ className: "lyrics-credit-footer-group" },
				react.createElement(
					"span",
					{ className: "lyrics-credit-footer-label" },
					I18n.t("misc.lyricsProvider") || "Lyrics Provider"
				),
				react.createElement(
					"span",
					{ className: "lyrics-credit-footer-value" },
					provider
				)
			),
			visibleContributors.length > 0 && react.createElement(
				react.Fragment,
				null,
				react.createElement("span", { className: "lyrics-credit-footer-divider", "aria-hidden": "true" }, "•"),
				react.createElement(
					"span",
					{ className: "lyrics-credit-footer-group" },
					react.createElement(
						"span",
						{ className: "lyrics-credit-footer-label" },
						I18n.t("misc.syncContributor") || "Sync Contributor"
					),
					react.createElement(
						"span",
						{ className: "lyrics-credit-footer-value lyrics-credit-footer-contributors" },
						...visibleContributors.flatMap((contributor, index) => {
							const node = contributor.profileAvailable
								? react.createElement(
									"button",
									{
										type: "button",
										key: contributor.key,
										className: "lyrics-credit-footer-link",
										onPointerDown: (event) => event.stopPropagation(),
										onMouseDown: (event) => event.stopPropagation(),
										onClick: (event) => {
											event.stopPropagation();
											openCreatorProfile(contributor);
										},
										title: copy.openProfile
									},
									contributor.name
								)
								: react.createElement(
									"span",
									{
										key: contributor.key,
										className: "lyrics-credit-footer-name"
									},
									contributor.name
								);

							return index < visibleContributors.length - 1
								? [node, react.createElement("span", { key: `${contributor.key}:comma`, className: "lyrics-credit-footer-separator" }, ", ")]
								: [node];
						})
					)
				)
			)
		)
	);

	const modal = activeContributor
		? react.createElement(SyncCreatorProfileModal, {
			contributor: activeContributor,
			profile: creatorProfile,
			loading: profileLoading,
			error: profileError,
			likePending,
			greetingPending,
			loadMorePending: profileLoadingMore,
			listRefreshing: profileListRefreshing,
			onClose: closeProfile,
			onToggleLike: handleToggleLike,
			onSaveGreeting: handleSaveGreeting,
			onLoadMore: handleLoadMore,
			onTrackClick: handleTrackClick,
			activeSortMode: profileSort,
			activeArtistFilter: profileArtistFilter,
			onSortChange: handleSortChange,
			onArtistFilterChange: handleArtistFilterChange
		})
		: null;

	return react.createElement(
		react.Fragment,
		null,
		footer,
		modal && reactDom?.createPortal && document.body
			? reactDom.createPortal(modal, document.body)
			: modal
	);
});
window.CreditFooter = CreditFooter;

const IdlingIndicator = react.memo(({ isActive = false, delay = 0, durationMs = 0, settingsRevision = 0, lineRef = null }) => {
	const className = useMemo(() =>
		`lyrics-idling-indicator ${!isActive ? "lyrics-idling-indicator-hidden" : ""} lyrics-lyricsContainer-LyricsLine ${isActive ? "lyrics-lyricsContainer-LyricsLine-active" : ""} lyrics-lyricsContainer-LyricsLine-interlude`,
		[isActive]
	);

	const style = useMemo(() => ({
		"--position-index": 0,
		"--animation-index": 1,
		"--indicator-delay": `${delay}ms`,
	}), [delay]);

	if (durationMs <= INTERLUDE_MIN_DURATION_MS) {
		return null;
	}

	return react.createElement(
		"div",
		{ className, style, ref: lineRef },
		react.createElement(
			"p",
			{ className: "lyrics-lyricsContainer-LyricsLine-interludeMain" },
			react.createElement(InterludeIndicator, {
				durationMs,
				kind: "prelude",
				settingsRevision,
			})
		)
	);
});

const emptyLine = {
	startTime: 0,
	endTime: 0,
	text: [],
};

// Safe text renderer that handles objects, null, and undefined
const safeRenderText = (value) => {
	if (value === null || value === undefined) return "";
	if (typeof value === "string") return value;
	if (typeof value === "object") {
		// Handle React elements
		if (value && typeof value === 'object' && value.$$typeof) {
			return value; // React element, return as-is
		}
		// Handle line objects for karaoke
		if (value.text) return value.text;
		if (value.syllables) return value;
		if (value.vocals) return value;
		// Fallback: return empty string for other objects
		return "";
	}
	return String(value);
};

// Unified function to handle lyrics display mode logic
const getLyricsDisplayMode = (isKara, line, text, originalText, text2) => {
	const displayMode = CONFIG.visual["translate:display-mode"];
	const showTranslatedBelow = displayMode === "below";
	const replaceOriginal = displayMode === "replace";

	let mainText, subText, subText2;

	if (isKara) {
		// For karaoke mode, safely handle the line object
		const karaokePhoneticText = line?.phoneticText
			|| line?.phonetic
			|| (line?.originalText && text && text !== line.originalText ? text : null);
		const karaokeTranslationText = line?.translationText || line?.translation || text2;
		mainText = line; // Keep as object for KaraokeLine component
		subText = karaokePhoneticText ? safeRenderText(karaokePhoneticText) : null;
		subText2 = safeRenderText(karaokeTranslationText);
	} else {
		// Default: show original text
		// originalText is the actual original lyrics
		// text is the first translation (can be null)
		// text2 is the second translation (can be null)

		if (showTranslatedBelow) {
			// Show original as main, translations below
			// Apply furigana to original text if enabled
			const processedOriginalText = safeRenderText(originalText);
			mainText = typeof processedOriginalText === 'string' ?
				Utils.applyFuriganaIfEnabled(processedOriginalText) : processedOriginalText;
			subText = text ? safeRenderText(text) : null;
			subText2 = text2 ? safeRenderText(text2) : null;
		} else if (replaceOriginal && text) {
			// Replace original with translation (only if translation exists)
			mainText = safeRenderText(text);
			subText = text2 ? safeRenderText(text2) : null;
			subText2 = null;
		} else {
			// Default: just show original with furigana if enabled
			const processedOriginalText = safeRenderText(originalText);
			mainText = typeof processedOriginalText === 'string' ?
				Utils.applyFuriganaIfEnabled(processedOriginalText) : processedOriginalText;
			subText = null;
			subText2 = null;
		}
	}

	return { mainText, subText, subText2 };
};

function renderLyricsUnavailable(message = I18n.t("messages.noLyrics"), messageClassName = "") {
	const messageClass = [
		"lyrics-lyricsContainer-LyricsUnavailableMessage",
		messageClassName,
	].filter(Boolean).join(" ");

	return react.createElement(
		"div",
		{ className: "lyrics-lyricsContainer-LyricsUnavailablePage" },
		react.createElement(
			"span",
			{ className: messageClass },
			message
		)
	);
}

const getCurrentTrackUri = () => Spicetify.Player?.data?.item?.uri || "";

const useTrackOffsetState = () => {
	const [trackOffset, setTrackOffset] = useState(0);
	const trackUri = getCurrentTrackUri();

	useEffect(() => {
		let cancelled = false;

		const loadOffset = async () => {
			const offset = (await Utils.getTrackSyncOffset(trackUri)) || 0;
			if (!cancelled) {
				setTrackOffset(offset);
			}
		};

		loadOffset();

		const handleOffsetChange = (event) => {
			if (event.detail.trackUri === trackUri) {
				setTrackOffset(event.detail.offset);
			}
		};

		window.addEventListener('ivLyrics:offset-changed', handleOffsetChange);
		return () => {
			cancelled = true;
			window.removeEventListener('ivLyrics:offset-changed', handleOffsetChange);
		};
	}, [trackUri]);

	return trackOffset;
};

const getGlobalSyncOffsetValue = () => {
	if (typeof Utils !== "undefined" && typeof Utils.getGlobalSyncOffset === "function") {
		return Utils.getGlobalSyncOffset();
	}
	const numericValue = Number(CONFIG?.visual?.["global-sync-offset"] ?? 0);
	return Number.isFinite(numericValue) ? numericValue : 0;
};

const useGlobalSyncOffsetState = () => {
	const [globalOffset, setGlobalOffset] = useState(getGlobalSyncOffsetValue);

	useEffect(() => {
		const handleGlobalOffsetChange = (event) => {
			const nextOffset = Number(event.detail?.offset ?? 0);
			setGlobalOffset(Number.isFinite(nextOffset) ? nextOffset : 0);
		};

		window.addEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
		return () => window.removeEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
	}, []);

	return globalOffset;
};

// Quantize playback position so identical values within a step don't trigger
// setState. SyncedLyricsPage's renderItems useMemo depends on `position`, so
// every change there cascades into rebuilding every line's style/className
// object on every frame, defeating LyricsLineBlock/KaraokeLine's react.memo.
const DEFAULT_TRACK_POSITION_FPS = 60;
const MIN_TRACK_POSITION_FPS = 10;
const MAX_TRACK_POSITION_FPS = 60;

const getTrackPositionFPS = () => {
	const configuredFPS = Number(CONFIG?.visual?.["performance-frame-rate"]);
	if (!Number.isFinite(configuredFPS)) return DEFAULT_TRACK_POSITION_FPS;
	return Math.max(
		MIN_TRACK_POSITION_FPS,
		Math.min(MAX_TRACK_POSITION_FPS, Math.round(configuredFPS))
	);
};

const getPositionQuantizeMs = () => Math.max(1, Math.round(1000 / getTrackPositionFPS()));

const getCurrentLyricsPlaybackPosition = (trackOffset = 0, globalOffset = getGlobalSyncOffsetValue()) => {
	const newPos = window.Utils?.getSafePlayerProgress?.()
		?? (Spicetify.Player?.getProgress?.() || 0);
	const delay = CONFIG.visual.delay + trackOffset + globalOffset;
	const quantizeMs = getPositionQuantizeMs();
	return Math.round((newPos + delay) / quantizeMs) * quantizeMs;
};

const useLyricsPlaybackPosition = () => {
	const trackOffset = useTrackOffsetState();
	const globalOffset = useGlobalSyncOffsetState();
	const [position, setPosition] = useState(() => getCurrentLyricsPlaybackPosition(0, getGlobalSyncOffsetValue()));

	useEffect(() => {
		const next = getCurrentLyricsPlaybackPosition(trackOffset, globalOffset);
		setPosition((prev) => (prev === next ? prev : next));
	}, [trackOffset, globalOffset]);

	useTrackPosition(() => {
		const next = getCurrentLyricsPlaybackPosition(trackOffset, globalOffset);
		setPosition((prev) => (prev === next ? prev : next));
	});

	return position;
};

const useScrollActivity = (containerRef, deps = []) => {
	const [isScrolling, setIsScrolling] = useState(false);
	const scrollTimeout = useRef(null);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const handleWheel = () => {
			setIsScrolling(true);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
			scrollTimeout.current = setTimeout(() => {
				setIsScrolling(false);
			}, 3000);
		};

		container.addEventListener("wheel", handleWheel, { passive: true });
		container.addEventListener("touchmove", handleWheel, { passive: true });

		return () => {
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("touchmove", handleWheel);
			if (scrollTimeout.current) {
				clearTimeout(scrollTimeout.current);
				scrollTimeout.current = null;
			}
		};
	}, deps);

	const handleContainerClick = useCallback(() => {
		if (!isScrolling) return;
		setIsScrolling(false);
		if (scrollTimeout.current) {
			clearTimeout(scrollTimeout.current);
			scrollTimeout.current = null;
		}
	}, [isScrolling]);

	return { isScrolling, handleContainerClick };
};

const renderLyricSubLine = (className, text, onContextMenu = null) => {
	if (!text) return null;
	const props = {
		className,
		style: { "--sub-lyric-color": CONFIG.visual["inactive-color"] },
	};
	if (onContextMenu) {
		props.onContextMenu = onContextMenu;
	}

	if (typeof text === "string" && text) {
		props.dangerouslySetInnerHTML = { __html: Utils.rubyTextToHTML(text) };
		return react.createElement("p", props);
	}

	return react.createElement("p", props, safeRenderText(text));
};

const renderLyricMainContent = ({
  isKara = false,
  mainText,
  line,
  position,
	isActive,
	settingsRevision = 0,
	globalCharOffset = 0,
  activeGlobalCharIndex = -1,
  subText = null,
  subText2 = null,
}) => {
  if (isKara) {
          return react.createElement(KaraokeLine, {
                  line,
			// Pin inactive lines to position 0. getKaraokeCharFill already returns 0
			// when isActive is false, so the position value is unused there. Keeping it
			// stable lets KaraokeLine's react.memo skip the re-render for every line
			// except the one currently being sung.
			position: isActive ? position : 0,
			isActive,
			settingsRevision,
			globalCharOffset,
                  activeGlobalCharIndex,
                  phonetic: subText,
                  translation: subText2,
          });
  }

	if (typeof mainText === "string") {
		return null;
	}

	return safeRenderText(mainText);
};

const normalizeUnsyncedLyrics = (lyrics) => {
	if (!lyrics) {
		return [];
	}
	if (Array.isArray(lyrics)) {
		return lyrics.filter(item => item !== null && item !== undefined);
	}
	if (typeof lyrics === "string") {
		return lyrics.split("\n").map((text, index) => ({ text, index }));
	}
	return [];
};

const getUnsyncedLineRenderData = (lyrics, text, originalText, text2) => {
	const { mainText: lineText, subText, subText2: showMode2Translation } =
		getLyricsDisplayMode(false, null, text, originalText, text2);

	const belowOrigin = (typeof originalText === "object"
		? originalText?.props?.children?.[0]
		: originalText)?.replace(/\s+/g, "");
	const belowTxt = (typeof text === "object"
		? text?.props?.children?.[0]
		: text)?.replace(/\s+/g, "");

	const displayMode = CONFIG.visual["translate:display-mode"];
	const showTranslatedBelow = displayMode === "below";
	const replaceOriginal = displayMode === "replace";
	const belowMode = showTranslatedBelow && originalText && belowOrigin !== belowTxt;
	const showMode2 = !!showMode2Translation && (showTranslatedBelow || replaceOriginal);

	return {
		lineText,
		subText,
		showMode2Translation,
		belowMode,
		showMode2,
	};
};

const buildLyricDisplayState = (isKara, line, text, originalText, text2) => {
	const { mainText, subText, subText2 } = getLyricsDisplayMode(
		isKara,
		line,
		text,
		originalText,
		text2
	);

	return {
		mainText,
		subText,
		subText2,
		hasSubLine: !!subText || !!subText2,
		originalText,
	};
};

const getCopyableText = (value) => {
	if (value === null || value === undefined) {
		return "";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (typeof value === "object") {
		if (Array.isArray(value)) {
			return value.map(getCopyableText).join("");
		}

		if (value.props?.children !== undefined) {
			return getCopyableText(value.props.children);
		}

		if (typeof value.text === "string") {
			return value.text;
		}
	}

	return safeRenderText(value) || "";
};

const INTERLUDE_MIN_DURATION_MS = 500;
const INTERLUDE_MARKER_REGEX = /^[\s\u00A0\u200B-\u200D\uFEFF\u2669-\u266C]+$/;
const INSTRUMENTAL_BREAK_ICON_DESIGNS = new Set([
	"equalizer",
	"dotWave",
	"ripples",
	"orbit",
	"diamonds",
	"scan",
	"arcs",
	"signal",
	"pulseDot",
	"stack",
	"spark",
	"splitBars",
	"metronome",
	"vinyl",
	"beat",
	"reels",
	"triangle",
	"morph",
	"strings",
	"piano",
	"bloom",
	"speaker",
	"crossfade",
]);

const getInstrumentalBreakSettings = () => {
	const configuredIcon = CONFIG?.visual?.["instrumental-break-icon"] || "equalizer";
	const speed = Number(CONFIG?.visual?.["instrumental-break-animation-speed"] ?? 100);
	const safeSpeed = Number.isFinite(speed) ? Math.max(50, Math.min(200, speed)) : 100;
	const duration = Math.round(1100 * (100 / safeSpeed));
	const labelFontFamily = CONFIG?.visual?.["instrumental-break-label-font-family"] ||
		CONFIG?.visual?.["original-font-family"] ||
		"var(--lyrics-original-font-family, var(--font-family))";
	const getLabelNumber = (settingKey, fallback, min, max) => {
		const settingValue = CONFIG?.visual?.[settingKey];
		const fallbackValue = settingValue !== undefined && settingValue !== null && settingValue !== ""
			? settingValue
			: fallback;
		const numericValue = Number(fallbackValue);
		const safeValue = Number.isFinite(numericValue) ? numericValue : fallback;

		return Math.max(min, Math.min(max, safeValue));
	};

	return {
		icon: INSTRUMENTAL_BREAK_ICON_DESIGNS.has(configuredIcon) ? configuredIcon : "equalizer",
		showLabel: CONFIG?.visual?.["instrumental-break-show-label"] === true,
		style: {
			"--break-duration": `${duration}ms`,
			"--break-duration-fast": `${Math.round(duration * 0.72)}ms`,
			"--break-duration-slow": `${Math.round(duration * 1.65)}ms`,
			"--break-duration-xslow": `${Math.round(duration * 3.8)}ms`,
			"--break-label-font-family": labelFontFamily,
			"--break-label-font-size": `${getLabelNumber("instrumental-break-label-font-size", 20, 12, 128)}px`,
			"--break-label-font-weight": getLabelNumber("instrumental-break-label-font-weight", 200, 100, 900),
			"--break-label-opacity": getLabelNumber("instrumental-break-label-opacity", 65, 0, 100) / 100,
		},
	};
};

const getInstrumentalBreakKind = (lineIndex, lineCount) => {
	if (lineIndex === 0) {
		return "prelude";
	}
	if (lineIndex === Math.max(0, lineCount - 1)) {
		return "postlude";
	}
	return "break";
};

const getInstrumentalBreakLabel = (kind) => {
	const key = kind === "prelude"
		? "settingsAdvanced.instrumentalBreak.labels.prelude"
		: kind === "postlude"
			? "settingsAdvanced.instrumentalBreak.labels.postlude"
			: "settingsAdvanced.instrumentalBreak.labels.break";

	return I18n.t(key) || (kind === "prelude" ? "Intro" : kind === "postlude" ? "Outro" : "Break");
};

const getPlainLyricText = (value) => {
	if (value === null || value === undefined) {
		return "";
	}

	if (typeof value === "string") {
		return value;
	}

	if (typeof value === "number" || typeof value === "boolean") {
		return String(value);
	}

	if (Array.isArray(value)) {
		return value.map(getPlainLyricText).join("");
	}

	if (typeof value === "object") {
		if (value.props?.children !== undefined) {
			return getPlainLyricText(value.props.children);
		}

		if (typeof value.originalText === "string") {
			return value.originalText;
		}

		if (typeof value.text === "string") {
			return value.text;
		}

		if (typeof value.word === "string") {
			return value.word;
		}

		if (Array.isArray(value.syllables)) {
			return value.syllables.map(getPlainLyricText).join("");
		}

		if (Array.isArray(value.vocals?.lead?.syllables)) {
			const lead = value.vocals.lead.syllables.map(getPlainLyricText).join("");
			const background = Array.isArray(value.vocals.background)
				? value.vocals.background
					.flatMap((entry) => Array.isArray(entry?.syllables) ? entry.syllables : [])
					.map(getPlainLyricText)
					.join("")
				: "";
			return lead || background;
		}
	}

	return "";
};

const getInterludeCandidateText = (line) => {
	if (!line) {
		return "";
	}

	if (line.originalText !== undefined) {
		return getPlainLyricText(line.originalText);
	}

	if (line.text !== undefined) {
		return getPlainLyricText(line.text);
	}

	return getPlainLyricText(line);
};

const isInterludeMarkerText = (text) => {
	const normalized = String(text ?? "")
		.replace(/&nbsp;/gi, " ")
		.replace(/<[^>]+>/g, "")
		.trim();

	return !normalized || INTERLUDE_MARKER_REGEX.test(normalized);
};

const toFiniteTime = (value) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

const getCurrentTrackDurationMs = () => {
	if (typeof Spicetify === "undefined") {
		return null;
	}

	return toFiniteTime(Spicetify.Player?.data?.item?.duration?.milliseconds);
};

const KARAOKE_TRAILING_INTERLUDE_DELAY_MS = 2500;
const isAutoInstrumentalBreakEnabled = () => {
	const value = CONFIG?.visual?.["instrumental-break-auto-detect"];
	if (typeof value === "boolean") return value;
	return !["false", "0", "off", "no"].includes(String(value ?? true).trim().toLowerCase());
};

const getTimedSyllablesFromLine = (line) => {
	const syllables = [];
	const appendSyllables = (items) => {
		if (Array.isArray(items)) {
			syllables.push(...items);
		}
	};

	appendSyllables(line?.syllables);
	appendSyllables(line?.vocals?.lead?.syllables);

	if (Array.isArray(line?.vocals?.background)) {
		line.vocals.background.forEach((entry) => appendSyllables(entry?.syllables));
	}

	return syllables;
};

const getKaraokeSpeakerPresentation = (speaker, speakerColor = "", speakerFallback = "") => {
	const presentation = window.ivLyricsSpeakerColors?.getPresentation?.(speaker, speakerColor, speakerFallback);
	if (presentation) return presentation;
	const normalized = String(speaker || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
	const normalizedFallback = String(speakerFallback || "").trim().replace(/[_-]+/g, " ").replace(/\s+/g, " ").toUpperCase();
	const effectiveSpeaker = normalized === "CUSTOM"
		? (["MALE 1", "FEMALE 1", "DUET 1"].includes(normalizedFallback) ? normalizedFallback : "MALE 1")
		: ({
		"MALE CUSTOM": "MALE 1",
		"FEMALE CUSTOM": "FEMALE 1",
		"DUET CUSTOM": "DUET 1",
	}[normalized] || normalized);
	const normalizedColor = /^#[0-9a-f]{6}$/i.test(String(speakerColor || "").trim())
		? String(speakerColor).trim().toLowerCase()
		: "";
	const creatorColorEnabled = CONFIG?.visual?.["sync-data-custom-speaker-colors-enabled"] !== false;
	return {
		speakerClass: String(effectiveSpeaker || "").trim().toLowerCase().replace(/[_\s]+/g, "-").replace(/[^a-z0-9-]/g, ""),
		creatorColor: (normalized === "CUSTOM" || normalized.endsWith(" CUSTOM")) && creatorColorEnabled ? normalizedColor : "",
	};
};

const normalizeKaraokeSpeakerClass = (speaker, speakerColor = "", speakerFallback = "") => (
	getKaraokeSpeakerPresentation(speaker, speakerColor, speakerFallback).speakerClass
);

const getKaraokeSpeakerStyle = (speaker, speakerColor = "", speakerFallback = "") => {
	const creatorColor = getKaraokeSpeakerPresentation(speaker, speakerColor, speakerFallback).creatorColor;
	return creatorColor ? {
		"--lyrics-color-active": creatorColor,
		"--lyrics-color-inactive": `color-mix(in srgb, ${creatorColor} 50%, transparent)`,
	} : {};
};

const KARAOKE_TEXT_EFFECT_KIND_CLASSES = new Set([
	"effect",
	"adlib",
	"pulse",
	"wave",
	"sparkle",
	"echo",
	"whisper",
	"bounce",
	"sway",
	"glow",
	"glitch",
	"flicker",
	"float",
	"blur",
	"pop",
]);

const areKaraokeTextEffectsEnabled = () => CONFIG?.visual?.["karaoke-text-effects"] !== false;

const getKaraokeKindClassParts = (kind) => {
	const kindClass = String(kind || "").trim().toLowerCase();
	if (!kindClass) {
		return [];
	}

	const classes = [kindClass];
	if (KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(kindClass) && !areKaraokeTextEffectsEnabled()) {
		classes.push("text-effects-disabled");
	}
	return classes;
};

const getKaraokeLineMetaClass = (line) => {
	const classes = [];
	const speakerClass = normalizeKaraokeSpeakerClass(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']);
	if (speakerClass) classes.push(`speaker-${speakerClass}`);
	if (line?.kind) classes.push(...getKaraokeKindClassParts(line.kind));
	return classes.join(" ");
};

const splitRenderableKaraokeSyllables = (syllables) => {
	if (!Array.isArray(syllables) || syllables.length === 0) {
		return [];
	}

	return syllables.flatMap((syllable) => {
		const text = syllable?.text || "";
		if (!text || !/\s/.test(text) || text.trim() === "") {
			return syllable;
		}

		return text
			.split(/(\s+)/)
			.filter((part) => part !== "")
			.map((part) => ({
				...syllable,
				text: part,
			}));
	});
};

const getKaraokeSyllableCharCount = (syllables) => (
	Array.isArray(syllables)
		? syllables.reduce((count, syllable) => count + Array.from(syllable?.text || "").length, 0)
		: 0
);

const getKaraokeVocalRows = (line) => {
	if (!Array.isArray(line?.vocals?.lead?.syllables) || line.vocals.lead.syllables.length === 0) {
		return null;
	}

	const rows = [{
		key: line.vocals.lead.id || "lead",
		role: line.vocals.lead.role || "lead",
		speaker: line.vocals.lead.speaker || "",
		speakerColor: line.vocals.lead['speaker-color'] || "",
		speakerFallback: line.vocals.lead['speaker-fallback'] || "",
		kind: line.vocals.lead.kind || "vocal",
		speakerClass: normalizeKaraokeSpeakerClass(line.vocals.lead.speaker, line.vocals.lead['speaker-color'], line.vocals.lead['speaker-fallback']),
		speakerStyle: getKaraokeSpeakerStyle(line.vocals.lead.speaker, line.vocals.lead['speaker-color'], line.vocals.lead['speaker-fallback']),
		phonetic: line.vocals.lead.phonetic || "",
		translation: line.vocals.lead.translation || "",
		text: line.vocals.lead.text || "",
		syllables: splitRenderableKaraokeSyllables(line.vocals.lead.syllables),
	}];

	if (Array.isArray(line.vocals.background)) {
		line.vocals.background.forEach((part, index) => {
			if (!Array.isArray(part?.syllables) || part.syllables.length === 0) {
				return;
			}

			rows.push({
				key: part.id || `background-${index}`,
				role: part.role || "background",
				speaker: part.speaker || "",
				speakerColor: part['speaker-color'] || "",
				speakerFallback: part['speaker-fallback'] || "",
				kind: part.kind || "vocal",
				speakerClass: normalizeKaraokeSpeakerClass(part.speaker, part['speaker-color'], part['speaker-fallback']),
				speakerStyle: getKaraokeSpeakerStyle(part.speaker, part['speaker-color'], part['speaker-fallback']),
				phonetic: part.phonetic || "",
				translation: part.translation || "",
				text: part.text || "",
				syllables: splitRenderableKaraokeSyllables(part.syllables),
			});
		});
	}

	return rows.length > 1 ? rows : null;
};

const hasKaraokeVocalRows = (line) => Array.isArray(getKaraokeVocalRows(line));

const splitLineByParallelShape = (text, rowCount) => {
	const value = typeof text === "string" ? text.trim() : "";
	if (!value || rowCount <= 1) {
		return [];
	}

	const separatorParts = value.split(/\s*[\/|／｜]\s*/).filter(Boolean);
	if (separatorParts.length === rowCount) {
		return separatorParts;
	}

	const chars = Array.from(value);
	const lead = [];
	const background = [];
	let depth = 0;
	let firstLeadIndex = Number.POSITIVE_INFINITY;
	let firstBackgroundIndex = Number.POSITIVE_INFINITY;

	chars.forEach((char, index) => {
		if (char === "(" || char === "（") {
			depth++;
			return;
		}
		if (char === ")" || char === "）") {
			depth = Math.max(0, depth - 1);
			return;
		}
		if (depth > 0) {
			firstBackgroundIndex = Math.min(firstBackgroundIndex, index);
			background.push(char);
		} else {
			if (!/\s/u.test(char)) {
				firstLeadIndex = Math.min(firstLeadIndex, index);
			}
			lead.push(char);
		}
	});

	if (rowCount === 2 && background.join("").trim()) {
		const leadText = lead.join("").trim();
		const backgroundText = background.join("").trim();
		return firstBackgroundIndex < firstLeadIndex
			? [backgroundText, leadText]
			: [leadText, backgroundText];
	}

	return [];
};

const isKaraokeParenthesisOpen = (char) => char === "(" || char === "\uFF08";
const isKaraokeParenthesisClose = (char) => char === ")" || char === "\uFF09";

const isStandaloneParentheticalText = (text) => {
	const chars = Array.from(String(text || "").trim());
	if (chars.length < 2 || !isKaraokeParenthesisOpen(chars[0])) return false;

	let depth = 0;
	for (let index = 0; index < chars.length; index++) {
		const char = chars[index];
		if (isKaraokeParenthesisOpen(char)) {
			depth++;
			continue;
		}
		if (isKaraokeParenthesisClose(char)) {
			depth--;
			if (depth === 0 && index !== chars.length - 1) return false;
			if (depth < 0) return false;
		}
	}
	return depth === 0 && isKaraokeParenthesisClose(chars[chars.length - 1]);
};

const stripStandaloneParentheticalText = (text) => {
	let value = String(text || "").trim();
	while (isStandaloneParentheticalText(value)) {
		value = Array.from(value).slice(1, -1).join("").trim();
	}
	return value;
};

const splitLineByVocalRowShape = (text, rows) => {
	const value = typeof text === "string" ? text.trim() : "";
	const rowCount = Array.isArray(rows) ? rows.length : 0;
	if (!value || rowCount <= 1) return [];

	const simpleParts = splitLineByParallelShape(value, rowCount);
	if (simpleParts.length === rowCount) return simpleParts;

	const segments = [];
	let buffer = [];
	let depth = 0;
	let parenthetical = false;
	const flush = () => {
		const segmentText = buffer.join("").trim();
		if (segmentText) {
			segments.push({
				parenthetical,
				text: parenthetical ? stripStandaloneParentheticalText(segmentText) : segmentText
			});
		}
		buffer = [];
		parenthetical = depth > 0;
	};

	Array.from(value).forEach((char) => {
		if (isKaraokeParenthesisOpen(char)) {
			if (depth === 0) {
				flush();
				parenthetical = true;
			}
			depth++;
			buffer.push(char);
			return;
		}

		if (isKaraokeParenthesisClose(char)) {
			buffer.push(char);
			if (depth > 0) depth--;
			if (depth === 0 && parenthetical) flush();
			return;
		}

		buffer.push(char);
	});
	flush();

	if (segments.length === rowCount) {
		return segments.map(segment => segment.text);
	}

	const remaining = [...segments];
	const rowShapeParts = rows.map((row) => {
		const rowIsParenthetical = isStandaloneParentheticalText(row?.text);
		const segmentIndex = remaining.findIndex(segment => segment.parenthetical === rowIsParenthetical);
		if (segmentIndex < 0) return "";
		const [segment] = remaining.splice(segmentIndex, 1);
		return segment.text;
	});

	return rowShapeParts.every(Boolean) && remaining.length === 0 ? rowShapeParts : [];
};

const getLastSyllableEndTime = (line) => {
	let lastEndTime = null;
	const lineEndTime = toFiniteTime(line?.endTime);

	getTimedSyllablesFromLine(line).forEach((syllable) => {
		const syllableStart = toFiniteTime(syllable?.startTime);
		const syllableEnd = toFiniteTime(syllable?.endTime)
			?? (lineEndTime !== null && syllableStart !== null && lineEndTime >= syllableStart ? lineEndTime : null)
			?? syllableStart;

		if (syllableEnd !== null) {
			lastEndTime = lastEndTime === null ? syllableEnd : Math.max(lastEndTime, syllableEnd);
		}
	});

	return lastEndTime;
};

const getKaraokeLineFillEndTime = (line) => {
	const timedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));
	const timedCharEndTime = timedChars.reduce((maxEndTime, charInfo) => {
		const endTime = toFiniteTime(charInfo?.endTime);
		return endTime === null ? maxEndTime : Math.max(maxEndTime, endTime);
	}, -Infinity);

	if (Number.isFinite(timedCharEndTime)) {
		return timedCharEndTime;
	}

	const lineBounds = getKaraokeLineBounds(line);
	return toFiniteTime(lineBounds.endTime) ?? getLastSyllableEndTime(line);
};

const getInterludeInfo = (line, nextLine = null, lineIndex = -1, lineCount = 0) => {
	const startTime = toFiniteTime(line?.startTime);
	if (startTime === null || !isInterludeMarkerText(getInterludeCandidateText(line))) {
		return { isInterlude: false, durationMs: 0 };
	}

	const directEndTime = toFiniteTime(line?.endTime);
	const nextStartTime = toFiniteTime(nextLine?.startTime);
	const trackEndTime = lineIndex === Math.max(0, lineCount - 1) ? getCurrentTrackDurationMs() : null;
	const endTime = directEndTime !== null && directEndTime > startTime
		? directEndTime
		: (nextStartTime !== null && nextStartTime > startTime
			? nextStartTime
			: (trackEndTime !== null && trackEndTime > startTime ? trackEndTime : null));
	const durationMs = endTime !== null ? endTime - startTime : 0;

	return {
		isInterlude: durationMs > INTERLUDE_MIN_DURATION_MS,
		durationMs,
		kind: getInstrumentalBreakKind(lineIndex, lineCount),
	};
};

const getTrailingKaraokeInterludeInfo = (line, nextLine = null, lineIndex = -1, lineCount = 0) => {
	if (!isAutoInstrumentalBreakEnabled()) {
		return { isInterlude: false, durationMs: 0, source: "karaoke-trailing-gap" };
	}

	const fillEndTime = getKaraokeLineFillEndTime(line);
	const startTime = fillEndTime !== null ? fillEndTime + KARAOKE_TRAILING_INTERLUDE_DELAY_MS : null;
	const nextStartTime = toFiniteTime(nextLine?.startTime);
	const trackEndTime = lineIndex === Math.max(0, lineCount - 1) ? getCurrentTrackDurationMs() : null;
	const endTime = nextStartTime ?? trackEndTime;
	const durationMs = startTime !== null && endTime !== null && endTime > startTime
		? endTime - startTime
		: 0;

	return {
		isInterlude: durationMs > INTERLUDE_MIN_DURATION_MS,
		durationMs,
		startTime,
		endTime,
		kind: lineIndex >= Math.max(0, lineCount - 1) ? "postlude" : "break",
		source: "karaoke-trailing-gap",
	};
};

const createActiveTrailingKaraokeInterludeLine = ({
	line,
	nextLine = null,
	lineIndex = -1,
	lineCount = 0,
	position = 0,
	isActiveLine = false,
	isKara = false,
}) => {
	if (!isKara || !isActiveLine || line?.interludeInfo?.isInterlude) {
		return null;
	}

	const interludeInfo = getTrailingKaraokeInterludeInfo(line, nextLine, lineIndex, lineCount);
	if (
		!interludeInfo.isInterlude ||
		interludeInfo.startTime === null ||
		interludeInfo.endTime === null ||
		position < interludeInfo.startTime ||
		position >= interludeInfo.endTime
	) {
		return null;
	}

	return {
		startTime: interludeInfo.startTime,
		endTime: interludeInfo.endTime,
		text: "",
		originalText: "",
		text2: "",
		interludeInfo,
		isVirtualTrailingInterlude: true,
	};
};

const createBreakIconChildren = (icon) => {
	const span = (key, props = {}) => react.createElement("span", { key, ...props });

	switch (icon) {
		case "dotWave":
			return [0, 1, 2, 3, 4].map((index) => span(index));
		case "ripples":
		case "orbit":
		case "vinyl":
			return span("main");
		case "diamonds":
		case "stack":
			return [0, 1, 2].map((index) => span(index));
		case "signal":
			return react.createElement(
				"svg",
				{ viewBox: "0 0 112 32", "aria-hidden": "true" },
				react.createElement("path", {
					d: "M2 18 H20 L26 9 L34 25 L43 14 L50 18 H68 L74 9 L82 25 L91 14 L98 18 H110",
				})
			);
		case "spark":
			return [0, 1, 2, 3, 4, 5, 6, 7].map((index) => span(index, { style: { "--i": index } }));
		case "splitBars":
		case "strings":
			return [0, 1, 2, 3].map((index) => span(index));
		case "reels":
			return [0, 1].map((index) => span(index));
		case "piano":
			return [0, 1, 2, 3, 4].map((index) => span(index));
		case "bloom":
			return [0, 1, 2, 3].map((index) => span(index));
		case "scan":
		case "arcs":
		case "pulseDot":
		case "metronome":
		case "beat":
		case "triangle":
		case "morph":
		case "speaker":
		case "crossfade":
			return null;
		case "equalizer":
		default:
			return [0, 1, 2, 3].map((index) => span(index));
	}
};

const InterludeIndicator = react.memo(({ durationMs = 0, kind = "break", settingsRevision = 0 }) => {
	const settings = getInstrumentalBreakSettings();
	const label = getInstrumentalBreakLabel(kind);

	return react.createElement(
		"span",
		{
			className: `lyrics-break-indicator lyrics-break-kind-${kind}`,
			"aria-label": settings.showLabel ? label : undefined,
			"aria-hidden": settings.showLabel ? undefined : "true",
			style: settings.style,
		},
		react.createElement(
			"span",
			{ className: `lyrics-break-icon lyrics-break-icon-${settings.icon}` },
			createBreakIconChildren(settings.icon)
		),
		settings.showLabel && react.createElement("span", { className: "lyrics-break-label" }, label)
	);
});

const copyLyricText = (text, successMessageKey, failureMessageKey) => {
	const copyText = getCopyableText(text);
	if (!copyText) {
		Toast.error(I18n.t(failureMessageKey));
		return;
	}

	Spicetify.Platform.ClipboardAPI.copy(copyText)
		.then(() => Toast.success(I18n.t(successMessageKey)))
		.catch(() => Toast.error(I18n.t(failureMessageKey)));
};

const createCopyHandler = (text, successMessageKey, failureMessageKey) => (event) => {
	event.preventDefault();
	copyLyricText(text, successMessageKey, failureMessageKey);
};

const getLyricsAnchorRatio = (container) => {
  if (!container) {
          return 0.5;
  }

	const rawAnchorRatio = window.getComputedStyle(container).getPropertyValue("--ivfs-lyrics-anchor-ratio").trim();
	const parsedAnchorRatio = Number.parseFloat(rawAnchorRatio);

	return Number.isFinite(parsedAnchorRatio)
          ? Math.min(0.95, Math.max(0.05, parsedAnchorRatio))
          : 0.5;
};

const getElementOffsetTopWithin = (element, container) => {
  if (!element || !container) {
          return 0;
  }

  let top = 0;
  let node = element;
  while (node && node !== container) {
          top += Number(node.offsetTop) || 0;
          node = node.offsetParent;
  }

  if (node === container) {
          return top;
  }

  const elementRect = element.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  return (elementRect.top - containerRect.top) + (container.scrollTop || 0);
};

const scrollSyncedContainerToActiveLine = (container, activeLine, behavior = "smooth") => {
  if (!container || !activeLine) return;

  const anchorRatio = getLyricsAnchorRatio(container);
  const containerHeight = container.clientHeight || 0;
  const lineAnchorCenter = getActiveLineAnchorCenter(activeLine);
  const activeLineTop = getElementOffsetTopWithin(activeLine, container);
  const targetTop = activeLineTop - (containerHeight * anchorRatio - lineAnchorCenter);
	const maxScrollTop = Math.max(0, container.scrollHeight - containerHeight);
	const nextTop = Math.max(0, Math.min(targetTop, maxScrollTop));

	if (typeof container.scrollTo === "function") {
		container.scrollTo({ top: nextTop, behavior });
		return;
	}

	container.scrollTop = nextTop;
};

const getKaraokeVocalAnchorCenterWithinLine = (activeLine) => {
	if (!activeLine || typeof activeLine.querySelector !== "function") {
		return null;
	}

	const stack = activeLine.querySelector(".lyrics-karaoke-stack[data-karaoke-vocal-anchor-position]");
	const anchorPosition = Number(stack?.getAttribute("data-karaoke-vocal-anchor-position"));
	const rowCount = Number(stack?.getAttribute("data-karaoke-vocal-row-count"));
	if (!stack || !Number.isFinite(anchorPosition) || !Number.isFinite(rowCount) || rowCount <= 0) {
		return null;
	}

	const rows = Array.from(stack.querySelectorAll("[data-karaoke-vocal-row-index]"));
	if (rows.length === 0) {
		return null;
	}

	const rowByIndex = new Map(rows.map((row) => [
		Number(row.getAttribute("data-karaoke-vocal-row-index")),
		row,
	]));
	const lowerIndex = Math.max(0, Math.min(rowCount - 1, Math.floor(anchorPosition)));
	const upperIndex = Math.max(0, Math.min(rowCount - 1, Math.ceil(anchorPosition)));
	const lowerRow = rowByIndex.get(lowerIndex);
	const upperRow = rowByIndex.get(upperIndex) || lowerRow;
	if (!lowerRow || !upperRow) {
		return null;
	}

	const lineRect = activeLine.getBoundingClientRect();
	const rowCenter = (row) => {
		const rect = row.getBoundingClientRect();
		return rect.top - lineRect.top + rect.height / 2;
	};
	const lowerCenter = rowCenter(lowerRow);
	const upperCenter = rowCenter(upperRow);
	const progress = Math.max(0, Math.min(1, anchorPosition - lowerIndex));
	return lowerCenter + (upperCenter - lowerCenter) * progress;
};

const getActiveLineAnchorCenter = (activeLine) => {
	const vocalAnchorCenter = getKaraokeVocalAnchorCenterWithinLine(activeLine);
	if (vocalAnchorCenter !== null) {
		return vocalAnchorCenter;
	}

	const lineHeight = activeLine?.clientHeight || activeLine?.getBoundingClientRect?.().height || 0;
	return lineHeight / 2;
};

const getCompactSyncedOffset = (container, activeLine, isScrolling) => {
	if (!container || !activeLine || isScrolling) {
		return 0;
	}

  const anchorRatio = getLyricsAnchorRatio(container);
  const anchorOffset = container.clientHeight * anchorRatio;
  const activeLineTop = getElementOffsetTopWithin(activeLine, container);
  return anchorOffset - (activeLineTop + getActiveLineAnchorCenter(activeLine));
};

const useSyncedLayoutEffect = react.useLayoutEffect || useEffect;

const buildGlobalCharState = (lyrics, position) => {
	const offsets = [];
	let totalChars = 0;
	let activeCharIndex = -1;
	let lastPassedCharIndex = -1;
	let lastPassedCharEndTime = 0;
	let lastPassedCharDuration = 100;

	for (let i = 0; i < lyrics.length; i++) {
		const line = lyrics[i];
		offsets.push(totalChars);

		const syllables = getTimedSyllablesFromLine(line);
		if (!Array.isArray(syllables) || syllables.length === 0) {
			continue;
		}

		for (const syllable of syllables) {
			if (!syllable || !syllable.text) continue;

			const charArray = Array.from(syllable.text || "");
			const syllableStart = syllable.startTime || 0;
			const syllableEnd = syllable.endTime || syllableStart + 500;

			for (let charIdx = 0; charIdx < charArray.length; charIdx++) {
				const charDuration = (syllableEnd - syllableStart) / charArray.length;
				const charStart = syllableStart + (charIdx * charDuration);
				const charEnd = charStart + charDuration;

				if (position >= charStart && position < charEnd) {
					activeCharIndex = totalChars;
				}

				if (position >= charEnd && charEnd > lastPassedCharEndTime) {
					lastPassedCharEndTime = charEnd;
					lastPassedCharIndex = totalChars;
					lastPassedCharDuration = charDuration || 100;
				}

				totalChars++;
			}
		}
	}

	if (activeCharIndex === -1 && lastPassedCharIndex !== -1) {
		const timeDiff = position - lastPassedCharEndTime;
		const simulateDuration = Math.max(40, lastPassedCharDuration * 0.01);
		const virtualProgress = Math.floor(timeDiff / simulateDuration);

		if (timeDiff < 2000) {
			activeCharIndex = lastPassedCharIndex + 1 + virtualProgress;
		}
	}

	return {
		globalCharOffsets: offsets,
		activeGlobalCharIndex: activeCharIndex,
	};
};

const EMPTY_GLOBAL_CHAR_STATE = {
	globalCharOffsets: [],
	activeGlobalCharIndex: -1,
};

const KARAOKE_PRE_SPACE_MIN_DURATION_MS = 45;
const KARAOKE_PRE_SPACE_NEXT_CHAR_RATIO = 0.7;
const KARAOKE_PRE_SPACE_MAX_DURATION_MS = 120;
const KARAOKE_FILL_CORRECTION_DEFAULT_POINTS = [
	{ x: 0, y: 0 },
	{ x: 0.25, y: 0.25 },
	{ x: 0.5, y: 0.5 },
	{ x: 0.75, y: 0.75 },
	{ x: 1, y: 1 },
];
const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);
const KARAOKE_NO_WORD_WRAP_LANGUAGE_PREFIXES = ["ja", "zh", "th", "lo", "km", "my"];
const KARAOKE_NO_WORD_WRAP_SCRIPT_REGEX = /[\u3040-\u30ff\uff66-\uff9f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\u0e00-\u0e7f\u0e80-\u0eff\u1780-\u17ff\u1000-\u109f]/u;
const KARAOKE_RTL_STRONG_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const KARAOKE_LTR_STRONG_CHAR_REGEX = /[A-Za-z\u00C0-\u02AF\u0370-\u052F\u1E00-\u1EFF]/u;
const KARAOKE_JOINING_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/u;

const getKaraokeTextDirection = (text) => {
	const normalizedText = typeof text === "string" ? text : "";
	let rtlCount = 0;
	let ltrCount = 0;

	for (const char of Array.from(normalizedText)) {
		if (KARAOKE_RTL_STRONG_CHAR_REGEX.test(char)) {
			rtlCount++;
			continue;
		}
		if (KARAOKE_LTR_STRONG_CHAR_REGEX.test(char)) {
			ltrCount++;
		}
	}

	return rtlCount > ltrCount ? "rtl" : "ltr";
};

const shouldUseKaraokeTextRun = (text) => {
	const normalizedText = typeof text === "string" ? text : "";
	return KARAOKE_RTL_STRONG_CHAR_REGEX.test(normalizedText) ||
		KARAOKE_JOINING_SCRIPT_REGEX.test(normalizedText);
};

const hasDominantNoWordWrapScript = (text) => {
	const chars = Array.from(typeof text === "string" ? text : "").filter((char) => /\S/u.test(char));
	if (chars.length === 0) {
		return false;
	}

	const matchedCount = chars.reduce(
		(count, char) => count + (KARAOKE_NO_WORD_WRAP_SCRIPT_REGEX.test(char) ? 1 : 0),
		0
	);
	return matchedCount / chars.length >= 0.45;
};

const shouldWrapKaraokeByWord = (text, language) => {
	const normalizedText = typeof text === "string" ? text : "";
	if (!/\S\s+\S/u.test(normalizedText)) {
		return false;
	}
	if (hasDominantNoWordWrapScript(normalizedText)) {
		return false;
	}

	const normalizedLanguage = String(language || "").toLowerCase();
	if (!normalizedLanguage) {
		return true;
	}

	return !KARAOKE_NO_WORD_WRAP_LANGUAGE_PREFIXES.some((prefix) =>
		normalizedLanguage === prefix || normalizedLanguage.startsWith(`${prefix}-`)
	);
};

const clampKaraokeFillCurveValue = (value, fallback = 0) => {
	const numberValue = Number(value);
	if (!Number.isFinite(numberValue)) {
		return fallback;
	}
	return Math.max(0, Math.min(1, numberValue));
};

const normalizeKaraokeFillCorrectionPoints = (value) => {
	let parsed = value;
	if (typeof value === "string") {
		try {
			parsed = JSON.parse(value);
		} catch {
			parsed = null;
		}
	}

	const points = KARAOKE_FILL_CORRECTION_DEFAULT_POINTS.map((defaultPoint, index) => {
		const source = Array.isArray(parsed) ? parsed[index] : null;
		const sourceY = Array.isArray(source) ? source[1] : source?.y;
		return {
			x: defaultPoint.x,
			y: clampKaraokeFillCurveValue(sourceY, defaultPoint.y),
		};
	});

	points[0].y = 0;
	points[points.length - 1].y = 1;
	for (let index = 1; index < points.length - 1; index += 1) {
		points[index].y = Math.max(points[index - 1].y, points[index].y);
	}
	for (let index = points.length - 2; index > 0; index -= 1) {
		points[index].y = Math.min(points[index + 1].y, points[index].y);
	}

	return points;
};

let karaokeFillCorrectionCurveCacheKey = null;
let karaokeFillCorrectionCurveCachePoints = KARAOKE_FILL_CORRECTION_DEFAULT_POINTS;

const getKaraokeFillCorrectionPoints = () => {
	const configuredValue = CONFIG?.visual?.["karaoke-fill-correction-curve"] ||
		"[[0,0],[0.25,0.25],[0.5,0.5],[0.75,0.75],[1,1]]";
	if (configuredValue === karaokeFillCorrectionCurveCacheKey) {
		return karaokeFillCorrectionCurveCachePoints;
	}

	karaokeFillCorrectionCurveCacheKey = configuredValue;
	karaokeFillCorrectionCurveCachePoints = normalizeKaraokeFillCorrectionPoints(configuredValue);
	return karaokeFillCorrectionCurveCachePoints;
};

const applyKaraokeFillCorrectionCurve = (value) => {
	const normalizedValue = clampKaraokeFillCurveValue(value);
	if (normalizedValue <= 0) return 0;
	if (normalizedValue >= 1) return 1;

	const points = getKaraokeFillCorrectionPoints();
	let segmentIndex = 0;
	for (let index = 0; index < points.length - 1; index += 1) {
		if (normalizedValue >= points[index].x && normalizedValue <= points[index + 1].x) {
			segmentIndex = index;
			break;
		}
	}

	const p0 = points[Math.max(0, segmentIndex - 1)];
	const p1 = points[segmentIndex];
	const p2 = points[segmentIndex + 1];
	const p3 = points[Math.min(points.length - 1, segmentIndex + 2)];
	const localProgress = (normalizedValue - p1.x) / Math.max(0.0001, p2.x - p1.x);
	const controlY = (p1.y + p2.y) / 2 + (p2.y - p0.y + p3.y - p1.y) / 8;
	const oneMinusProgress = 1 - localProgress;
	const correctedValue =
		oneMinusProgress * oneMinusProgress * p1.y +
		2 * oneMinusProgress * localProgress * controlY +
		localProgress * localProgress * p2.y;

	return clampKaraokeFillCurveValue(correctedValue);
};

const buildKaraokeWordElements = (timedChars, charElements) => {
	if (!Array.isArray(timedChars) || !Array.isArray(charElements) || timedChars.length !== charElements.length) {
		return charElements;
	}

	const wordElements = [];
	let currentWord = [];
	let currentWordStart = 0;

	const flushWord = () => {
		if (currentWord.length === 0) {
			return;
		}

		wordElements.push(react.createElement(
			"span",
			{
				className: "lyrics-karaoke-word",
				key: `karaoke-word-${currentWordStart}`,
			},
			currentWord
		));
		currentWord = [];
	};

	timedChars.forEach((charInfo, index) => {
		const char = charInfo?.char || "";
		const element = charElements[index];
		const isWhitespace = /\s/u.test(char);

		if (!isWhitespace && currentWord.length === 0) {
			currentWordStart = index;
		}

		if (isWhitespace) {
			if (currentWord.length > 0) {
				currentWord.push(element);
				flushWord();
			} else {
				wordElements.push(element);
			}
			return;
		}

		currentWord.push(element);
	});

	flushWord();
	return wordElements;
};

const getKaraokeSegmentFill = (segment, position, isActive, isComplete) => {
	if (isComplete) {
		return 100;
	}
	if (!isActive || !segment) {
		return 0;
	}

	const startTime = Number.isFinite(segment.startTime) ? segment.startTime : 0;
	const endTime = Number.isFinite(segment.endTime) ? segment.endTime : startTime;
	if (position <= startTime) {
		return 0;
	}
	if (position >= endTime) {
		return 100;
	}

	const raw = Math.max(0, Math.min(1, (position - startTime) / Math.max(1, endTime - startTime)));
	const corrected = applyKaraokeFillCorrectionCurve(raw) * 100;
	return Math.round(corrected / 4) * 4;
};

const buildKaraokeTextRunSegments = (timedChars) => {
	if (!Array.isArray(timedChars) || timedChars.length === 0) {
		return [];
	}

	const segments = [];
	let currentSegment = null;

	const flushSegment = () => {
		if (!currentSegment || currentSegment.text.length === 0) {
			currentSegment = null;
			return;
		}
		segments.push(currentSegment);
		currentSegment = null;
	};

	timedChars.forEach((charInfo, index) => {
		const char = charInfo?.char || "";
		const type = /\s/u.test(char) ? "space" : "text";
		if (!currentSegment || currentSegment.type !== type) {
			flushSegment();
			currentSegment = {
				type,
				startIndex: index,
				text: "",
				startTime: Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0,
				endTime: Number.isFinite(charInfo?.endTime) ? charInfo.endTime : 0,
			};
		}

		currentSegment.text += char;
		if (Number.isFinite(charInfo?.endTime)) {
			currentSegment.endTime = Math.max(currentSegment.endTime, charInfo.endTime);
		}
	});

	flushSegment();
	return segments;
};

const buildKaraokeTextRunElements = (
	timedChars,
	position,
	isActive,
	isComplete,
	textDirection,
	globalCharOffset = 0,
	activeGlobalCharIndex = -1
) => {
	const segments = buildKaraokeTextRunSegments(timedChars);
	const renderSegments = textDirection === "rtl" ? [...segments].reverse() : segments;

	return renderSegments.map((segment) => {
		if (segment.type === "space") {
			return react.createElement(
				"span",
				{
					className: "lyrics-karaoke-text-run-space",
					key: `karaoke-text-run-space-${segment.startIndex}`,
				},
				segment.text
			);
		}

		const fillValue = getKaraokeSegmentFill(segment, position, isActive, isComplete);
		const segmentDirection = getKaraokeTextDirection(segment.text) || textDirection;
		const gradientDirection = segmentDirection === "rtl" ? "to left" : "to right";
		const segmentState = fillValue <= 0 ? "pending" : fillValue >= 100 ? "done" : "active";
		const segmentCenterIndex = globalCharOffset + segment.startIndex + Math.max(0, segment.text.length - 1) / 2;
		const bounceAttenuation = getKaraokeBounceAttenuation(segmentCenterIndex, activeGlobalCharIndex);
		const bounce = getKaraokeBounceValues(position, isActive, segment.startTime, segment.endTime, bounceAttenuation);
		const segmentStyle = {};
		if (segmentState === "active") {
			const softEdge = 10;
			segmentStyle["--karaoke-gradient-direction"] = gradientDirection;
			segmentStyle["--karaoke-char-fill"] = `${fillValue}%`;
			segmentStyle["--karaoke-char-fill-soft-start"] = `${Math.max(0, fillValue - softEdge)}%`;
			segmentStyle["--karaoke-char-fill-soft-end"] = `${Math.min(100, fillValue + softEdge)}%`;
		}
		if (bounce.active) {
			segmentStyle["--karaoke-bounce-y"] = `${bounce.offsetY}px`;
			segmentStyle["--karaoke-bounce-scale"] = bounce.scale;
		}

		let segmentClassName = `lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--${segmentState}`;
		if (bounce.active) {
			segmentClassName += " is-bouncing";
		}
		if (isComplete) {
			segmentClassName += " is-complete";
		}

		return react.createElement(
			"span",
			{
				className: segmentClassName,
				dir: segmentDirection,
				style: segmentStyle,
				key: `karaoke-text-run-segment-${segment.startIndex}`,
			},
			segment.text
		);
	});
};

const getPseudoKaraokeRenderAdvance = (karaokeSource) => {
	if (!PSEUDO_KARAOKE_SOURCES.has(karaokeSource)) {
		return 0;
	}

	const configuredAdvance = Number(CONFIG.visual["pseudo-karaoke-render-advance"] ?? 0);
	return Number.isFinite(configuredAdvance) ? configuredAdvance : 0;
};

const buildPreparedSyncedLyrics = (lyrics, isKara) =>
	lyrics.map((line, index, allLines) => ({
		...line,
		interludeInfo: getInterludeInfo(line, allLines[index + 1], index, allLines.length),
		...buildLyricDisplayState(
			isKara,
			line,
			line?.text,
			line?.originalText,
			line?.text2
		),
	}));

const buildPaddedSyncedLyrics = (lyrics, leadingEmptyLines) =>
	Array.from({ length: leadingEmptyLines }, () => emptyLine)
		.concat(lyrics)
		.map((line, lineNumber) => ({
			...line,
			lineNumber,
		}));

const shouldIncludeSyncedLineInCompactView = (line, activeLineIndex) =>
	!line?.interludeInfo?.isInterlude || line.lineNumber === activeLineIndex;

const getActiveTimedLineIndex = (lines, position) => {
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line && position >= (line.startTime || 0)) {
			return i;
		}
	}

	return 0;
};

const getSyncedAnimationIndex = ({ compact, isScrolling, activeLineIndex, lineNumber, visibleIndex }) => {
	if (compact && isScrolling) {
		return 0;
	}

	const sourceIndex = compact && !isScrolling ? visibleIndex : lineNumber;

	if (activeLineIndex <= CONFIG.visual["lines-before"]) {
		return sourceIndex - activeLineIndex;
	}

	return sourceIndex - CONFIG.visual["lines-before"];
};

const shouldHideSyncedLine = ({ compact, isScrolling, animationIndex }) => {
	if (compact && isScrolling) {
		return false;
	}

	return (
		(animationIndex < 0 && -animationIndex > CONFIG.visual["lines-before"]) ||
		animationIndex > CONFIG.visual["lines-after"]
	);
};

const LyricsLineBlock = react.memo(({
	className,
	style,
	lineRef = null,
	dir = "auto",
	seekTime = null,
	mainText,
	subText = null,
	subText2 = null,
	originalText = null,
	isKara = false,
	line = null,
	position = 0,
	isActive = false,
	isCurrentLine = isActive,
	settingsRevision = 0,
	globalCharOffset = 0,
	activeGlobalCharIndex = -1,
	mainCopyText = null,
	mainCopySuccessKey = "notifications.lyricsCopied",
	mainCopyFailureKey = "notifications.lyricsCopyFailed",
	subCopyText = null,
	subCopySuccessKey = "notifications.translationCopied",
	subCopyFailureKey = "notifications.translationCopyFailed",
	subText2CopyText = null,
	subText2CopySuccessKey = "notifications.secondTranslationCopied",
	subText2CopyFailureKey = "notifications.secondTranslationCopyFailed",
}) => {
	const mainLine = line || (typeof mainText === "object" ? mainText : {
		text: mainText,
		originalText,
		text2: subText2,
  });
  const hasParallelKaraokeRows = isKara && hasKaraokeVocalRows(mainLine);
  const interludeInfo = mainLine?.interludeInfo || getInterludeInfo(mainLine);
	const shouldRenderInterlude = interludeInfo.isInterlude;
	const shouldShowInterlude = shouldRenderInterlude && isCurrentLine;
	const lineClassName = shouldRenderInterlude
		? `${className} lyrics-lyricsContainer-LyricsLine-interlude`
		: className;

	const mainProps = {
		onContextMenu: createCopyHandler(
			mainCopyText || Utils.formatLyricLineToCopy(mainText, subText, subText2, originalText),
			mainCopySuccessKey,
			mainCopyFailureKey
		),
	};

	if (shouldRenderInterlude) {
		mainProps.className = "lyrics-lyricsContainer-LyricsLine-interludeMain";
	} else if (typeof mainText === "string" && !isKara && mainText) {
		mainProps.dangerouslySetInnerHTML = { __html: Utils.rubyTextToHTML(mainText) };
	}

	const handleClick = useCallback(() => {
		if (Number.isFinite(seekTime)) {
			window.Utils?.clearSafePlayerProgressCorrection?.();
			Spicetify.Player.seek(seekTime);
		}
	}, [seekTime]);

	return react.createElement(
		"div",
		{
                  className: lineClassName,
                  style,
                  dir,
                  ref: lineRef,
                  onClick: Number.isFinite(seekTime) ? handleClick : null,
		},
		react.createElement(
			"p",
			mainProps,
			shouldRenderInterlude
				? (shouldShowInterlude ? react.createElement(InterludeIndicator, {
					durationMs: interludeInfo.durationMs,
					kind: interludeInfo.kind || "break",
					settingsRevision,
				}) : "\u00A0")
				: renderLyricMainContent({
					isKara,
					mainText,
					line: mainLine,
					position: isKara ? position : 0,
					isActive,
					settingsRevision,
					globalCharOffset,
                                  activeGlobalCharIndex,
                                  subText,
                                  subText2,
                          })
          ),
		!shouldRenderInterlude && !hasParallelKaraokeRows && renderLyricSubLine(
			"lyrics-lyricsContainer-LyricsLine-phonetic",
			subText,
			subCopyText
				? createCopyHandler(subCopyText, subCopySuccessKey, subCopyFailureKey)
				: null
		),
		!shouldRenderInterlude && !hasParallelKaraokeRows && renderLyricSubLine(
			"lyrics-lyricsContainer-LyricsLine-translation",
			subText2,
			subText2CopyText
				? createCopyHandler(subText2CopyText, subText2CopySuccessKey, subText2CopyFailureKey)
				: null
		)
	);
});

const renderLyricsItems = ({ items, isKara, position = 0, activeLineRef = null, settingsRevision = 0 }) => {
	const karaokePosition = isKara ? position : 0;

	return items.map((item) => {
		if (item.type === "indicator") {
			return react.createElement(IdlingIndicator, {
				key: item.key,
				isActive: item.isActive,
				delay: item.delay,
				durationMs: item.durationMs,
				settingsRevision,
				lineRef: item.isActive ? activeLineRef : null,
			});
		}

		return react.createElement(LyricsLineBlock, {
			key: item.key,
			className: item.className,
			style: item.style,
			lineRef: item.trackLineRef ? activeLineRef : null,
			seekTime: item.canSeek ? item.startTime : null,
			mainText: item.mainText,
			subText: item.subText,
			subText2: item.subText2,
			originalText: item.originalText,
			isKara,
			line: item.line,
			// Only the karaoke-active line needs the live position; pinning others to 0
			// keeps their LyricsLineBlock props stable so react.memo can skip the
			// per-frame re-render of every inactive line.
			position: item.karaokeActive ? karaokePosition : 0,
			isActive: item.karaokeActive,
			isCurrentLine: item.isActiveLine,
			settingsRevision,
			globalCharOffset: item.globalCharOffset,
			activeGlobalCharIndex: item.activeGlobalCharIndex,
		});
	});
};

const SyncedLyricsScrollView = react.memo(({
	lyrics = [],
	position = 0,
	activeLyricIndex = 0,
	isKara = false,
	activeLineRef = null,
	settingsRevision = 0,
	globalCharOffsets = [],
	activeGlobalCharIndex = -1,
}) => {
	if (!Array.isArray(lyrics) || lyrics.length === 0) {
		return null;
	}

	return react.createElement(
		"div",
		{
			className: `lyrics-lyricsContainer-SyncedScrollView ${isKara ? "is-karaoke" : "is-synced"}`,
		},
		...lyrics.flatMap((line, index) => {
			const { text, startTime, originalText, text2 } = line;
			const interludeInfo = getInterludeInfo(line, lyrics[index + 1], index, lyrics.length);
			const renderLine = interludeInfo.isInterlude ? { ...line, interludeInfo } : line;
			const isActiveLine = index === activeLyricIndex;
			const { mainText, subText, subText2, hasSubLine } = buildLyricDisplayState(
				isKara,
				renderLine,
				text,
				originalText,
				text2
			);

			const trailingInterludeLine = createActiveTrailingKaraokeInterludeLine({
				line: renderLine,
				nextLine: lyrics[index + 1],
				lineIndex: index,
				lineCount: lyrics.length,
				position,
				isActiveLine,
				isKara,
			});
			const isOriginalActiveLine = isActiveLine && !trailingInterludeLine;
			const lineNode = react.createElement(LyricsLineBlock, {
				key: `scroll-line-${startTime ?? index}-${index}`,
						className: `lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-scrollView ${getKaraokeLineMetaClass(line)}${hasSubLine ? " lyrics-lyricsContainer-LyricsLine-hasSubLine" : ""}${isOriginalActiveLine ? " lyrics-lyricsContainer-LyricsLine-active lyrics-lyricsContainer-LyricsLine-scrollCurrent" : ""}`,
				style: {
					cursor: Number.isFinite(startTime) ? "pointer" : "default",
					...getKaraokeSpeakerStyle(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']),
				},
				lineRef: isOriginalActiveLine ? activeLineRef : null,
				seekTime: Number.isFinite(startTime) ? startTime : null,
				mainText,
				subText,
				subText2,
				originalText,
				isKara,
				line: renderLine,
				// See the matching note in renderLyricsItems: only the active line
				// receives the live position so memo can skip the others.
				position: isOriginalActiveLine ? position : 0,
				isActive: isOriginalActiveLine,
				isCurrentLine: isOriginalActiveLine,
				settingsRevision,
				globalCharOffset: globalCharOffsets[index] || 0,
				activeGlobalCharIndex,
			});

			if (!trailingInterludeLine) {
				return [lineNode];
			}

			return [
				lineNode,
				react.createElement(LyricsLineBlock, {
					key: `scroll-line-trailing-interlude-${index}-${trailingInterludeLine.startTime}`,
					className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-scrollView lyrics-lyricsContainer-LyricsLine-active",
					style: { cursor: "default" },
					mainText: "",
					subText: null,
					subText2: null,
					originalText: "",
					isKara,
					line: trailingInterludeLine,
					position: 0,
					isActive: false,
					isCurrentLine: true,
					lineRef: activeLineRef,
					settingsRevision,
				})
			];
		})
	);
});

const useSyncedLyricsEngine = ({
	lyrics,
	position,
	compact = false,
	isKara = false,
	containerRef,
  activeLineRef,
  lyricsId,
  containerReady = true,
  settingsRevision = 0,
  anchorRevision = 0,
}) => {
	const leadingEmptyLines = compact ? 2 : 1;
	const { isScrolling, handleContainerClick } = useScrollActivity(
		containerRef,
		compact ? [lyricsId, containerReady] : [lyricsId]
	);

	const preparedLyrics = useMemo(
		() => buildPreparedSyncedLyrics(lyrics, isKara),
		[lyrics, isKara]
	);

	const paddedLyrics = useMemo(
		() => buildPaddedSyncedLyrics(preparedLyrics, leadingEmptyLines),
		[preparedLyrics, leadingEmptyLines]
	);

	const activeLineIndex = useMemo(
		() => getActiveTimedLineIndex(paddedLyrics, position),
		[paddedLyrics, position]
	);

	const compactDisplayLines = useMemo(() => {
		if (!compact || isScrolling) {
			return paddedLyrics;
		}

		return paddedLyrics
			.filter((line) => shouldIncludeSyncedLineInCompactView(line, activeLineIndex))
			.map((line, displayLineNumber) => ({
				...line,
				displayLineNumber,
			}));
	}, [compact, isScrolling, paddedLyrics, activeLineIndex]);

	const activeDisplayLineIndex = useMemo(() => {
		if (!compact || isScrolling) {
			return activeLineIndex;
		}

		const index = compactDisplayLines.findIndex((line) => line.lineNumber === activeLineIndex);
		return index >= 0 ? index : Math.min(activeLineIndex, Math.max(0, compactDisplayLines.length - 1));
	}, [compact, isScrolling, compactDisplayLines, activeLineIndex]);

	const compactWindowStartIndex = useMemo(() => {
		if (!compact) {
			return 0;
		}

		return Math.max(activeDisplayLineIndex - CONFIG.visual["lines-before"], 0);
	}, [compact, activeDisplayLineIndex]);

	const linesToRender = useMemo(() => {
		if (!compact || isScrolling) {
			return paddedLyrics;
		}

		return compactDisplayLines;
	}, [compact, isScrolling, paddedLyrics, compactDisplayLines]);
	const compactAnchorIndex = compact
		? Math.min(CONFIG.visual["lines-before"], leadingEmptyLines)
		: activeLineIndex;
	const activeElementIndex = compact
		? (isScrolling
			? activeLineIndex
			: Math.max(Math.min(activeDisplayLineIndex, CONFIG.visual["lines-before"]), compactAnchorIndex))
		: activeLineIndex;
	const visualAnchorLineNumber = compact && activeLineIndex < leadingEmptyLines
		? leadingEmptyLines
		: activeLineIndex;

	const { globalCharOffsets, activeGlobalCharIndex } = useMemo(() => {
		if (!isKara) {
			return EMPTY_GLOBAL_CHAR_STATE;
		}

		return buildGlobalCharState(lyrics, position);
	}, [lyrics, position, isKara]);

	const activeSourceLineIndex = activeLineIndex - leadingEmptyLines;
	const activeTrailingInterludeLine = useMemo(() => (
		activeSourceLineIndex >= 0
			? createActiveTrailingKaraokeInterludeLine({
				line: preparedLyrics[activeSourceLineIndex],
				nextLine: preparedLyrics[activeSourceLineIndex + 1],
				lineIndex: activeSourceLineIndex,
				lineCount: preparedLyrics.length,
				position,
				isActiveLine: true,
				isKara,
			})
			: null
	), [activeSourceLineIndex, preparedLyrics, position, isKara]);
	const activeTrailingInterludeKey = activeTrailingInterludeLine
		? `${activeTrailingInterludeLine.startTime}:${activeTrailingInterludeLine.endTime}`
		: "";

	// Was invoked inline on every render — and position updates trigger a render every
	// frame, so this layout read fired 60 times/sec and forced a synchronous reflow
	// each time. Now scoped to the events that can actually change the offset:
	// active line shifts, scrolling state flips, compact mode toggles.
	const [compactOffset, setCompactOffset] = useState(0);
	const syncCompactOffset = useCallback(() => {
		if (!compact) {
			setCompactOffset(0);
			return;
		}

		const nextOffset = getCompactSyncedOffset(containerRef.current, activeLineRef.current, isScrolling);
		setCompactOffset((prevOffset) => (
			Math.abs(prevOffset - nextOffset) < 0.5 ? prevOffset : nextOffset
		));
	}, [compact, containerRef, activeLineRef, isScrolling]);

  useSyncedLayoutEffect(() => {
          syncCompactOffset();
  }, [syncCompactOffset, activeLineIndex, activeTrailingInterludeKey, containerReady, lyricsId, preparedLyrics, settingsRevision, anchorRevision]);

	useSyncedLayoutEffect(() => {
		if (!compact || isScrolling || typeof ResizeObserver === "undefined") {
			return undefined;
		}

		const container = containerRef.current;
		const activeLine = activeLineRef.current;
		if (!container || !activeLine) {
			return undefined;
		}

		const raf = typeof requestAnimationFrame === "function"
			? requestAnimationFrame
			: (callback) => setTimeout(callback, 0);
		const cancelRaf = typeof cancelAnimationFrame === "function"
			? cancelAnimationFrame
			: clearTimeout;
		let frameId = null;
		const scheduleOffsetSync = () => {
			if (frameId !== null) {
				cancelRaf(frameId);
			}
			frameId = raf(() => {
				frameId = null;
				syncCompactOffset();
			});
		};

		const observer = new ResizeObserver(scheduleOffsetSync);
		observer.observe(activeLine);
		observer.observe(container);
		let mutationObserver = null;
		if (typeof MutationObserver !== "undefined") {
			mutationObserver = new MutationObserver(scheduleOffsetSync);
			mutationObserver.observe(activeLine, {
				attributes: true,
				attributeFilter: ["data-karaoke-vocal-anchor-position"],
				subtree: true,
			});
		}
		scheduleOffsetSync();

		return () => {
			observer.disconnect();
			if (mutationObserver) {
				mutationObserver.disconnect();
			}
			if (frameId !== null) {
				cancelRaf(frameId);
			}
		};
  }, [compact, isScrolling, activeLineIndex, activeTrailingInterludeKey, containerReady, lyricsId, preparedLyrics, settingsRevision, anchorRevision, syncCompactOffset]);

	useEffect(() => {
		const actualIndex = Math.max(0, activeLineIndex - leadingEmptyLines);
		window.dispatchEvent(new CustomEvent("ivLyrics:lyric-index-changed", {
			detail: { index: actualIndex, total: lyrics.length }
		}));
	}, [activeLineIndex, leadingEmptyLines, lyrics.length]);

	const hasAutoScrolledRef = useRef(false);
	useEffect(() => {
		hasAutoScrolledRef.current = false;
	}, [lyricsId]);

	useEffect(() => {
		if (compact) {
			return undefined;
		}

		const container = containerRef.current;
		const activeLine = activeLineRef.current;
		if (!container || !activeLine || isScrolling) {
			return undefined;
		}

		if (!hasAutoScrolledRef.current || isInViewport(activeLine)) {
			scrollSyncedContainerToActiveLine(container, activeLine, hasAutoScrolledRef.current ? "smooth" : "auto");
			hasAutoScrolledRef.current = true;
		}

		return undefined;
	}, [compact, activeLineIndex, isScrolling, containerRef, activeLineRef, activeTrailingInterludeKey, preparedLyrics]);

	useEffect(() => {
		if (compact || !isScrolling || !activeLineRef.current) {
			return undefined;
		}

		const timeoutId = setTimeout(() => {
			scrollSyncedContainerToActiveLine(containerRef.current, activeLineRef.current, "auto");
		}, 0);

		return () => clearTimeout(timeoutId);
	}, [compact, activeLineIndex, isScrolling, containerRef, activeLineRef, activeTrailingInterludeKey, preparedLyrics]);

	useEffect(() => {
		if (compact || isScrolling || typeof ResizeObserver === "undefined") {
			return undefined;
		}

		const container = containerRef.current;
		const activeLine = activeLineRef.current;
		if (!container || !activeLine) {
			return undefined;
		}

		const raf = typeof requestAnimationFrame === "function"
			? requestAnimationFrame
			: (callback) => setTimeout(callback, 0);
		const cancelRaf = typeof cancelAnimationFrame === "function"
			? cancelAnimationFrame
			: clearTimeout;
		let frameId = null;
		const scheduleScrollSync = () => {
			if (frameId !== null) {
				cancelRaf(frameId);
			}
			frameId = raf(() => {
				frameId = null;
				scrollSyncedContainerToActiveLine(containerRef.current, activeLineRef.current, "auto");
			});
		};

		const observer = new ResizeObserver(scheduleScrollSync);
		observer.observe(activeLine);
		observer.observe(container);
		let mutationObserver = null;
		if (typeof MutationObserver !== "undefined") {
			mutationObserver = new MutationObserver(scheduleScrollSync);
			mutationObserver.observe(activeLine, {
				attributes: true,
				attributeFilter: ["data-karaoke-vocal-anchor-position"],
				subtree: true,
			});
		}

		return () => {
			observer.disconnect();
			if (mutationObserver) {
				mutationObserver.disconnect();
			}
			if (frameId !== null) {
				cancelRaf(frameId);
			}
		};
	}, [compact, isScrolling, activeLineIndex, activeTrailingInterludeKey, containerRef, activeLineRef, preparedLyrics]);

	const renderItems = useMemo(() => {
		if (compact && isScrolling) {
			const activePreparedIndex = Math.max(0, activeLineIndex - leadingEmptyLines);

			return preparedLyrics
				.map((line, index) => ({ line, index }))
				.filter(({ line, index }) => !line?.interludeInfo?.isInterlude || index === activePreparedIndex)
				.flatMap(({ line, index }) => {
					const { startTime, originalText, mainText, subText, subText2, hasSubLine } = line;
					const isActiveLine = index === activePreparedIndex;
					const trailingInterludeLine = createActiveTrailingKaraokeInterludeLine({
						line,
						nextLine: preparedLyrics[index + 1],
						lineIndex: index,
						lineCount: preparedLyrics.length,
						position,
						isActiveLine,
						isKara,
					});
					const isOriginalActiveLine = isActiveLine && !trailingInterludeLine;
					const item = {
						type: "line",
						key: `scroll-inline-${startTime ?? index}-${index}`,
						className: `lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-scrollView ${getKaraokeLineMetaClass(line)}${hasSubLine ? " lyrics-lyricsContainer-LyricsLine-hasSubLine" : ""}${isOriginalActiveLine ? " lyrics-lyricsContainer-LyricsLine-active lyrics-lyricsContainer-LyricsLine-scrollCurrent" : ""}`,
						style: {
							cursor: Number.isFinite(startTime) ? "pointer" : "default",
							...getKaraokeSpeakerStyle(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']),
						},
						line,
						startTime,
						originalText,
						mainText,
						subText,
						subText2,
						isActiveLine: isOriginalActiveLine,
						trackLineRef: isOriginalActiveLine,
						canSeek: Number.isFinite(startTime),
						karaokeActive: isOriginalActiveLine,
						globalCharOffset: globalCharOffsets[index] || 0,
						activeGlobalCharIndex,
					};

					if (!trailingInterludeLine) {
						return [item];
					}

					return [
						item,
						{
							type: "line",
							key: `scroll-inline-trailing-interlude-${index}-${trailingInterludeLine.startTime}`,
							className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-scrollView lyrics-lyricsContainer-LyricsLine-active",
							style: { cursor: "default" },
							line: trailingInterludeLine,
							startTime: trailingInterludeLine.startTime,
							originalText: "",
							mainText: "",
							subText: null,
							subText2: null,
							isActiveLine: true,
							trackLineRef: true,
							canSeek: false,
							karaokeActive: false,
							globalCharOffset: 0,
							activeGlobalCharIndex,
						}
					];
				});
		}

		return linesToRender.flatMap((line, visibleIndex) => {
			const {
				lineNumber = visibleIndex,
				displayLineNumber = lineNumber,
				startTime,
				originalText,
				mainText,
				subText,
				subText2,
			} = line;
			const compactVisibleIndex = compact
				? displayLineNumber - compactWindowStartIndex
				: visibleIndex;

			if (compact && lineNumber === 1 && activeLineIndex <= leadingEmptyLines) {
				const firstLyricStartTime = lyrics[0]?.startTime || 1;
				if (position < firstLyricStartTime) {
					return {
						type: "indicator",
						key: `compact-idling-${lineNumber}`,
						delay: firstLyricStartTime / 3,
						durationMs: firstLyricStartTime,
						isActive: true,
					};
				}
			}

			if (!compact && lineNumber === 0) {
				const nextStartTime = paddedLyrics[1]?.startTime || 1;
				return {
					type: "indicator",
					key: `expanded-idling-${lineNumber}`,
					delay: nextStartTime / 3,
					durationMs: nextStartTime,
					isActive: activeLineIndex === 0,
				};
			}

			const isActiveLine = lineNumber === activeLineIndex;
			let animationIndex = getSyncedAnimationIndex({
				compact,
				isScrolling,
				activeLineIndex: compact && !isScrolling ? activeDisplayLineIndex : activeLineIndex,
				lineNumber: compact && !isScrolling ? displayLineNumber : lineNumber,
				visibleIndex: compactVisibleIndex,
			});
			if (activeTrailingInterludeLine && lineNumber <= activeLineIndex) {
				animationIndex -= 1;
			}
			let className = `lyrics-lyricsContainer-LyricsLine ${getKaraokeLineMetaClass(line)}`;
			const isCurrentRenderedLine = isActiveLine && !activeTrailingInterludeLine;
			if (isCurrentRenderedLine) {
				className += " lyrics-lyricsContainer-LyricsLine-active";
			}
			if (shouldHideSyncedLine({ compact, isScrolling, animationIndex })) {
				className += " lyrics-lyricsContainer-LyricsLine-paddingLine";
				className += animationIndex < 0
					? " lyrics-lyricsContainer-LyricsLine-paddingBefore"
					: " lyrics-lyricsContainer-LyricsLine-paddingAfter";
			}

			const item = {
				type: "line",
				key: lineNumber,
				className,
				style: {
					cursor: "pointer",
					...getKaraokeSpeakerStyle(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']),
					"--position-index": animationIndex,
					"--animation-index": Math.abs(animationIndex) + 1,
					"--line-shift-duration": isScrolling
						? "0s"
						: `${Math.max(0.28, 0.46 - Math.min(Math.abs(animationIndex), 4) * 0.04)}s`,
					"--line-shift-delay": isScrolling
						? "0s"
						: `${animationIndex > 0 ? Math.min(animationIndex, 3) * 0.02 : 0}s`,
					"--blur-index": Math.min(Math.abs(animationIndex), 3),
				},
				line,
				startTime,
				originalText,
				mainText,
				subText,
				subText2,
				isActiveLine: isCurrentRenderedLine,
				trackLineRef: isCurrentRenderedLine && lineNumber === visualAnchorLineNumber,
				canSeek: lineNumber >= leadingEmptyLines && Number.isFinite(startTime),
				karaokeActive: isCurrentRenderedLine && (compact ? compactVisibleIndex === activeElementIndex : isActiveLine),
				globalCharOffset: lineNumber >= leadingEmptyLines && lineNumber - leadingEmptyLines < globalCharOffsets.length
					? globalCharOffsets[lineNumber - leadingEmptyLines]
					: 0,
				activeGlobalCharIndex,
			};

			if (!activeTrailingInterludeLine || lineNumber !== activeLineIndex) {
				return [item];
			}

			const virtualAnimationIndex = 0;
			return [
				item,
				{
					type: "line",
					key: `trailing-interlude-${lineNumber}-${activeTrailingInterludeLine.startTime}`,
					className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
					style: {
						cursor: "default",
						"--position-index": virtualAnimationIndex,
						"--animation-index": Math.abs(virtualAnimationIndex) + 1,
						"--line-shift-duration": isScrolling
							? "0s"
							: `${Math.max(0.28, 0.46 - Math.min(Math.abs(virtualAnimationIndex), 4) * 0.04)}s`,
						"--line-shift-delay": isScrolling
							? "0s"
							: `${virtualAnimationIndex > 0 ? Math.min(virtualAnimationIndex, 3) * 0.02 : 0}s`,
						"--blur-index": 0,
					},
					line: activeTrailingInterludeLine,
					startTime: activeTrailingInterludeLine.startTime,
					originalText: "",
					mainText: "",
					subText: null,
					subText2: null,
					isActiveLine: true,
					trackLineRef: true,
					canSeek: false,
					karaokeActive: false,
					globalCharOffset: 0,
					activeGlobalCharIndex,
				}
			];
		});
	}, [
		linesToRender,
		compact,
		activeLineIndex,
		leadingEmptyLines,
		lyrics,
		preparedLyrics,
		position,
		paddedLyrics,
		isScrolling,
		isKara,
		activeElementIndex,
		activeDisplayLineIndex,
		compactWindowStartIndex,
		visualAnchorLineNumber,
		globalCharOffsets,
		activeGlobalCharIndex,
		settingsRevision,
	]);

	return {
		isScrolling,
		handleContainerClick,
		renderItems,
		compactOffset,
		activeLineIndex,
		activeLyricIndex: Math.max(0, activeLineIndex - leadingEmptyLines),
		globalCharOffsets,
		activeGlobalCharIndex,
	};
};

// Global animation manager to prevent multiple instances
const AnimationManager = {
	active: false,
	frameId: null,
	timerId: null,
	callbacks: new Set(),
	lastTime: 0,
	targetFPS: DEFAULT_TRACK_POSITION_FPS,
	boundAnimate: null,

	updateFrameInterval() {
		this.targetFPS = getTrackPositionFPS();
		this.frameInterval = 1000 / this.targetFPS;
	},

	start() {
		if (this.active) return;
		this.active = true;
		this.updateFrameInterval();
		// bind를 한 번만 수행하여 메모리 효율성 개선
		if (!this.boundAnimate) {
			this.boundAnimate = this.animate.bind(this);
		}
		this.timerId = setTimeout(this.boundAnimate, 0);
	},

	stop() {
		if (this.frameId) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		if (this.timerId) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}
		this.active = false;
	},

	addCallback(callback) {
		this.callbacks.add(callback);
		this.start();
	},

	removeCallback(callback) {
		this.callbacks.delete(callback);
		if (this.callbacks.size === 0) {
			this.stop();
		}
	},

	animate() {
		if (!this.active) return;

		this.callbacks.forEach(callback => {
			try {
				callback();
			} catch (error) {
				// Error ignored
			}
		});
		this.lastTime = performance.now();
		this.updateFrameInterval();
		this.timerId = setTimeout(this.boundAnimate, document.hidden ? 250 : this.frameInterval);
	}
};

// Enhanced visibility change manager to prevent duplicate listeners (최적화 #8 - 메모리 누수 수정)
const VisibilityManager = {
	listeners: new Set(),
	isListening: false,
	boundHandler: null,

	init() {
		// bind()로 생성된 함수 참조를 저장하여 제거 가능하게 함
		this.boundHandler = this.handleVisibilityChange.bind(this);
	},

	addListener(callback) {
		if (!this.boundHandler) this.init();

		this.listeners.add(callback);
		if (!this.isListening) {
			document.addEventListener('visibilitychange', this.boundHandler);
			this.isListening = true;
		}
	},

	removeListener(callback) {
		this.listeners.delete(callback);
		if (this.listeners.size === 0 && this.isListening) {
			document.removeEventListener('visibilitychange', this.boundHandler);
			this.isListening = false;
		}
	},

	handleVisibilityChange() {
		const isVisible = !document.hidden;
		this.listeners.forEach(callback => {
			try {
				callback(isVisible);
			} catch (error) {
				// Error ignored
			}
		});
	}
};

// Expose managers globally for performance monitoring
if (typeof window !== 'undefined') {
	window.AnimationManager = AnimationManager;
	window.VisibilityManager = VisibilityManager;
}

const useTrackPosition = (callback) => {
	const callbackRef = useRef();
	const mountedRef = useRef(true);
	const isActiveRef = useRef(true);

	callbackRef.current = callback;

	useEffect(() => {
		// Component mounted
		mountedRef.current = true;
		isActiveRef.current = true;

		const wrappedCallback = () => {
			if (mountedRef.current && isActiveRef.current && callbackRef.current) {
				callbackRef.current();
			}
		};

		// Add to global animation manager
		AnimationManager.addCallback(wrappedCallback);
		wrappedCallback();

		// Add visibility listener
		const visibilityCallback = (isVisible) => {
			if (mountedRef.current) {
				isActiveRef.current = isVisible;
			}
		};
		VisibilityManager.addListener(visibilityCallback);

		return () => {
			// Component unmounting
			mountedRef.current = false;
			isActiveRef.current = false;
			AnimationManager.removeCallback(wrappedCallback);
			VisibilityManager.removeListener(visibilityCallback);
		};
	}, []);
};

const getKaraokeLineBounds = (line) => {
	const syllables = getTimedSyllablesFromLine(line);
	if (syllables.length === 0) {
		const startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
		const endTime = Number.isFinite(line?.endTime) ? line.endTime : startTime;
		return { startTime, endTime };
	}

	let startTime = Infinity;
	let endTime = -Infinity;

	for (const syllable of syllables) {
		if (!syllable) continue;
		const syllableStart = Number.isFinite(syllable.startTime) ? syllable.startTime : null;
		const syllableEnd = Number.isFinite(syllable.endTime) ? syllable.endTime : syllableStart;

		if (syllableStart !== null) {
			startTime = Math.min(startTime, syllableStart);
			endTime = Math.max(endTime, syllableEnd ?? syllableStart);
		}
	}

	if (!Number.isFinite(startTime)) {
		startTime = Number.isFinite(line?.startTime) ? line.startTime : 0;
	}
	if (!Number.isFinite(endTime)) {
		endTime = Number.isFinite(line?.endTime) ? line.endTime : startTime;
	}

	return { startTime, endTime };
};

const buildKaraokeFuriganaMap = (processedText) => {
	const furiganaMap = new Map();
	if (typeof processedText !== "string" || !processedText.includes("<ruby>")) {
		return furiganaMap;
	}

	const rubyRegex = /<ruby>([^<]+)<rt>([^<]+)<\/rt><\/ruby>/g;
	let currentPos = 0;
	let lastMatchEnd = 0;
	let match;

	rubyRegex.lastIndex = 0;

	while ((match = rubyRegex.exec(processedText)) !== null) {
		const kanjiSequence = match[1];
		const reading = match[2];
		const beforeMatch = processedText.substring(lastMatchEnd, match.index);
		const plainTextBefore = beforeMatch.replace(/<[^>]+>/g, "");
		currentPos += Array.from(plainTextBefore).length;

		const kanjiChars = Array.from(kanjiSequence);
		if (kanjiChars.length === 1) {
			furiganaMap.set(currentPos, reading);
		} else {
			const readingChars = Array.from(reading);
			const charsPerKanji = Math.max(1, Math.floor(readingChars.length / kanjiChars.length));
			kanjiChars.forEach((_, idx) => {
				const nextReading = idx === kanjiChars.length - 1
					? readingChars.slice(idx * charsPerKanji).join("")
					: readingChars.slice(idx * charsPerKanji, (idx + 1) * charsPerKanji).join("");
				furiganaMap.set(currentPos + idx, nextReading);
			});
		}

		currentPos += kanjiChars.length;
		lastMatchEnd = match.index + match[0].length;
	}

	return furiganaMap;
};

const buildKaraokeTimedChars = (line) => {
	const timedChars = [];
	const sourceSyllables = getTimedSyllablesFromLine(line);

	if (sourceSyllables.length > 0) {
		sourceSyllables.forEach((syllable) => {
			if (!syllable || !syllable.text) return;

			const charArray = Array.from(syllable.text || "");
			const syllableStart = Number.isFinite(syllable.startTime) ? syllable.startTime : (line.startTime || 0);
			const syllableEnd = Number.isFinite(syllable.endTime) ? syllable.endTime : syllableStart + 500;
			const charDuration = Math.max(1, (syllableEnd - syllableStart) / Math.max(1, charArray.length));

			charArray.forEach((char, charIndex) => {
				const charStart = syllableStart + (charIndex * charDuration);
				timedChars.push({
					char,
					startTime: charStart,
					endTime: charStart + charDuration,
				});
			});
		});
	}

	if (timedChars.length > 0) {
		return timedChars;
	}

	const fallbackChars = Array.from(getCopyableText(line?.text) || "");
	const { startTime, endTime } = getKaraokeLineBounds(line);
	const totalDuration = Math.max(1, endTime - startTime || 500);
	const charDuration = Math.max(1, totalDuration / Math.max(1, fallbackChars.length || 1));

	return fallbackChars.map((char, index) => ({
		char,
		startTime: startTime + (index * charDuration),
		endTime: startTime + ((index + 1) * charDuration),
	}));
};

const applyKaraokeWhitespaceCompensation = (timedChars) => {
	if (!Array.isArray(timedChars) || timedChars.length < 2) {
		return timedChars;
	}

	let didChange = false;
	const compensatedChars = timedChars.map((charInfo, index) => {
		const nextCharInfo = timedChars[index + 1];
		if (!nextCharInfo) {
			return charInfo;
		}

		const currentChar = charInfo?.char || "";
		const nextChar = nextCharInfo?.char || "";
		const duration = Math.max(0, (charInfo?.endTime || 0) - (charInfo?.startTime || 0));
		const nextCharDuration = Math.max(0, (nextCharInfo?.endTime || 0) - (nextCharInfo?.startTime || 0));
		const isPreWhitespaceChar = currentChar && !/\s/u.test(currentChar) && /\s/u.test(nextChar);

		if (!isPreWhitespaceChar || duration >= KARAOKE_PRE_SPACE_MIN_DURATION_MS) {
			return charInfo;
		}

		const compensatedDuration = Math.max(
			KARAOKE_PRE_SPACE_MIN_DURATION_MS,
			Math.min(
				KARAOKE_PRE_SPACE_MAX_DURATION_MS,
				nextCharDuration * KARAOKE_PRE_SPACE_NEXT_CHAR_RATIO
			)
		);

		didChange = true;
		return {
			...charInfo,
			endTime: charInfo.startTime + compensatedDuration,
		};
	});

	return didChange ? compensatedChars : timedChars;
};

const getActiveKaraokeTimedCharIndex = (timedChars, position) => {
  if (!Array.isArray(timedChars) || timedChars.length === 0) {
          return -1;
  }

	let activeCharIndex = -1;
	let lastPassedCharIndex = -1;
	let lastPassedCharEndTime = 0;
	let lastPassedCharDuration = 100;

	timedChars.forEach((charInfo, index) => {
		const charStart = Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0;
		const charEnd = Number.isFinite(charInfo?.endTime) ? charInfo.endTime : charStart;
		const charDuration = Math.max(1, charEnd - charStart);

		if (position >= charStart && position < charEnd) {
			activeCharIndex = index;
		}

		if (position >= charEnd && charEnd > lastPassedCharEndTime) {
			lastPassedCharEndTime = charEnd;
			lastPassedCharIndex = index;
			lastPassedCharDuration = charDuration || 100;
		}
	});

	if (activeCharIndex === -1 && lastPassedCharIndex !== -1) {
		const timeDiff = position - lastPassedCharEndTime;
		const simulateDuration = Math.max(40, lastPassedCharDuration * 0.01);
		const virtualProgress = Math.floor(timeDiff / simulateDuration);

		if (timeDiff < 2000) {
			activeCharIndex = lastPassedCharIndex + 1 + virtualProgress;
		}
	}

  return activeCharIndex;
};

const KARAOKE_VOCAL_STACK_CENTER_THRESHOLD = 4;

const buildKaraokeVocalRowLine = (line, row) => ({
  ...line,
  text: row.text,
  originalText: row.text,
  syllables: row.syllables,
  vocals: undefined,
  speaker: row.speaker,
  'speaker-color': row.speakerColor,
  'speaker-fallback': row.speakerFallback,
  kind: row.kind,
});

const getKaraokeVocalAnchorLineKey = (line) => [
  line?.startTime ?? "",
  line?.endTime ?? "",
  getCopyableText(line?.originalText ?? line?.text ?? ""),
].join("|");

const getKaraokeVocalAnchorPosition = (vocalRows, line, position) => {
  if (!Array.isArray(vocalRows) || vocalRows.length === 0 || !Number.isFinite(position)) {
          return -1;
  }

  let firstActiveRowIndex = -1;
  let lastActiveRowIndex = -1;

  for (let rowIndex = 0; rowIndex < vocalRows.length; rowIndex++) {
          const rowLine = buildKaraokeVocalRowLine(line, vocalRows[rowIndex]);
          const rowTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(rowLine));
          const activeCharIndex = getActiveKaraokeTimedCharIndex(rowTimedChars, position);
          const { startTime, endTime } = getKaraokeLineBounds(rowLine);
          const rowActive = (activeCharIndex >= 0 && activeCharIndex < rowTimedChars.length)
                  || (position >= startTime && position <= endTime);

          if (rowActive) {
                  if (firstActiveRowIndex < 0) {
                          firstActiveRowIndex = rowIndex;
                  }
                  lastActiveRowIndex = rowIndex;
          }
  }

  if (firstActiveRowIndex >= 0 && lastActiveRowIndex >= 0) {
          return Math.ceil((firstActiveRowIndex + lastActiveRowIndex) / 2);
  }

  return -1;
};

const getStableKaraokeVocalAnchorPosition = (stateRef, line, position, nextAnchorPosition) => {
  if (!stateRef?.current) {
          return nextAnchorPosition;
  }

  const lineKey = getKaraokeVocalAnchorLineKey(line);
  const state = stateRef.current;
  const positionWentBack = Number.isFinite(state.lastPlaybackPosition)
          && Number.isFinite(position)
          && position < state.lastPlaybackPosition - 250;

  if (state.lineKey !== lineKey || positionWentBack) {
          state.lineKey = lineKey;
          state.anchorPosition = nextAnchorPosition;
          state.lastPlaybackPosition = position;
          return nextAnchorPosition;
  }

  state.lastPlaybackPosition = position;
  if (!Number.isFinite(nextAnchorPosition) || nextAnchorPosition < 0) {
          return Number.isFinite(state.anchorPosition) ? state.anchorPosition : -1;
  }

  state.anchorPosition = Math.max(
          Number.isFinite(state.anchorPosition) ? state.anchorPosition : nextAnchorPosition,
          nextAnchorPosition
  );
  return state.anchorPosition;
};

const KARAOKE_FILL_STEPS = 25;
const KARAOKE_BOUNCE_IDLE = { offsetY: 0, scale: 1, active: false };
const KARAOKE_BOUNCE_MAX_CHAR_DISTANCE = 3;
const easeOutCubic = (value) => 1 - Math.pow(1 - Math.max(0, Math.min(1, value)), 3);

const getKaraokeBounceAttenuation = (globalCharIndex, activeGlobalCharIndex) => {
	if (!Number.isFinite(globalCharIndex) || !Number.isFinite(activeGlobalCharIndex) || activeGlobalCharIndex < 0) {
		return 1;
	}

	const distance = Math.abs(globalCharIndex - activeGlobalCharIndex);
	if (distance > KARAOKE_BOUNCE_MAX_CHAR_DISTANCE) {
		return 0;
	}

	return Math.max(0.22, 1 - distance * 0.23);
};

const getKaraokeCharFill = (position, isActive, startTime, endTime) => {
	if (!isActive) {
		return 0;
	}
	if (position <= startTime) {
		return 0;
	}
	if (position >= endTime) {
		return 1;
	}
	const raw = Math.max(0, Math.min(1, (position - startTime) / Math.max(1, endTime - startTime)));
	const corrected = applyKaraokeFillCorrectionCurve(raw);
	// Quantize to 4% steps so per-frame inline-style updates collapse to ~12 changes/sec
	// instead of 60. React skips DOM writes when the resulting CSS variable string is
	// unchanged, which removes the matching style recalc + layerize cascade.
	return Math.round(corrected * KARAOKE_FILL_STEPS) / KARAOKE_FILL_STEPS;
};

const getKaraokeBounceValues = (position, isActive, startTime, endTime, attenuation = 1) => {
	if (!CONFIG.visual["karaoke-bounce"] || !isActive || attenuation <= 0) {
		return KARAOKE_BOUNCE_IDLE;
	}

	const duration = Math.max(1, endTime - startTime);
	const preLeadDuration = Math.max(70, Math.min(160, duration * 0.45));
	const riseDuration = Math.max(180, Math.min(280, duration * 0.9));
	const releaseDuration = Math.max(420, Math.min(820, duration * 2.4));
	const totalWindow = riseDuration + releaseDuration;
	const elapsed = position - startTime;

	if (elapsed < -preLeadDuration || elapsed > totalWindow) {
		return KARAOKE_BOUNCE_IDLE;
	}

	let waveStrength;

	if (elapsed < 0) {
		const preProgress = (elapsed + preLeadDuration) / preLeadDuration;
		waveStrength = easeOutCubic(preProgress) * 0.22;
	} else if (elapsed <= riseDuration) {
		const riseProgress = elapsed / riseDuration;
		waveStrength = 0.22 + (easeOutCubic(riseProgress) * 0.78);
	} else {
		const fallProgress = Math.min(1, (elapsed - riseDuration) / Math.max(1, totalWindow - riseDuration));
		waveStrength = Math.pow(1 - fallProgress, 1.28);
	}

	if (waveStrength < 0.025) {
		return KARAOKE_BOUNCE_IDLE;
	}

	waveStrength *= Math.max(0, Math.min(1, attenuation));

	const offsetY = Math.round((-6 * waveStrength) * 2) / 2;
	const scale = Math.round((1 + 0.055 * waveStrength) * 100) / 100;

	return {
		offsetY,
		scale,
		active: offsetY !== 0 || scale !== 1,
	};
};

const KaraokeLine = react.memo(({ line, position, isActive, settingsRevision = 0, globalCharOffset = 0, activeGlobalCharIndex = -1, phonetic = null, translation = null }) => {
  if (!line) {
          return "";
  }

  const vocalRows = getKaraokeVocalRows(line);
  const shouldUseVocalRowAnchor = isActive
          && Array.isArray(vocalRows)
          && vocalRows.length >= KARAOKE_VOCAL_STACK_CENTER_THRESHOLD;
  const vocalAnchorStateRef = useRef({ lineKey: null, anchorPosition: -1, lastPlaybackPosition: NaN });
  const nextVocalAnchorPosition = shouldUseVocalRowAnchor
          ? getKaraokeVocalAnchorPosition(vocalRows, line, position)
          : -1;
  const activeVocalAnchorPosition = shouldUseVocalRowAnchor
          ? getStableKaraokeVocalAnchorPosition(vocalAnchorStateRef, line, position, nextVocalAnchorPosition)
          : -1;
  const activeVocalRowIndex = Number.isFinite(activeVocalAnchorPosition) && activeVocalAnchorPosition >= 0
          ? Math.round(activeVocalAnchorPosition)
          : -1;

  if (vocalRows) {
          const rowPhonetics = splitLineByVocalRowShape(phonetic, vocalRows);
          const rowTranslations = splitLineByVocalRowShape(translation, vocalRows);
          const hasRowPhoneticSubline = vocalRows.some((row, rowIndex) => row.phonetic || rowPhonetics[rowIndex]);
          const hasRowTranslationSubline = vocalRows.some((row, rowIndex) => row.translation || rowTranslations[rowIndex]);
		const stackPhonetic = !hasRowPhoneticSubline && typeof phonetic === "string" ? phonetic.trim() : "";
		const stackTranslation = !hasRowTranslationSubline && typeof translation === "string" ? translation.trim() : "";
          let rowGlobalCharOffset = globalCharOffset;
          const stackChildren = vocalRows.map((row, rowIndex) => {
                  const rowLine = buildKaraokeVocalRowLine(line, row);
                  const classParts = [
                          "lyrics-karaoke-part",
                          row.role === "background" ? "background" : "lead",
                          ...getKaraokeKindClassParts(row.kind || "vocal"),
                          shouldUseVocalRowAnchor && rowIndex === activeVocalRowIndex ? "active-vocal-row" : "",
                          row.speakerClass ? `speaker-${row.speakerClass}` : "",
                  ].filter(Boolean);
                  const currentOffset = rowGlobalCharOffset;
                  rowGlobalCharOffset += getKaraokeSyllableCharCount(row.syllables);
			const rowTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(rowLine));
			const rowActiveCharIndex = getActiveKaraokeTimedCharIndex(rowTimedChars, position);
			const rowActiveGlobalCharIndex = rowActiveCharIndex >= 0 ? currentOffset + rowActiveCharIndex : -1;
			const rowPhonetic = row.phonetic || rowPhonetics[rowIndex] || "";
			const rowTranslation = row.translation || rowTranslations[rowIndex] || "";

			return react.createElement(
                          "span",
                          {
                                  key: row.key || rowIndex,
                                  className: classParts.join(" "),
                                  style: row.speakerStyle,
                                  "data-karaoke-vocal-row-index": rowIndex,
                          },
                          react.createElement(KaraokeLine, {
                                  line: rowLine,
                                  position,
					isActive,
					settingsRevision,
					globalCharOffset: currentOffset,
					activeGlobalCharIndex: rowActiveGlobalCharIndex,
				}),
				rowPhonetic && react.createElement(
					"span",
					{ className: "lyrics-lyricsContainer-LyricsLine-phonetic lyrics-karaoke-part-subline" },
					rowPhonetic
				),
				rowTranslation && react.createElement(
					"span",
					{ className: "lyrics-lyricsContainer-LyricsLine-translation lyrics-karaoke-part-subline" },
					rowTranslation
				)
			);
		});

		if (stackPhonetic) {
			stackChildren.push(react.createElement(
				"span",
				{ key: "stack-phonetic", className: "lyrics-lyricsContainer-LyricsLine-phonetic lyrics-karaoke-part-subline lyrics-karaoke-stack-subline" },
				stackPhonetic
			));
		}

		if (stackTranslation) {
			stackChildren.push(react.createElement(
				"span",
				{ key: "stack-translation", className: "lyrics-lyricsContainer-LyricsLine-translation lyrics-karaoke-part-subline lyrics-karaoke-stack-subline" },
				stackTranslation
			));
		}

          return react.createElement(
                  "span",
                  {
                          className: "lyrics-karaoke-stack",
                          "data-karaoke-vocal-row-count": vocalRows.length,
                          "data-karaoke-vocal-anchor-position": shouldUseVocalRowAnchor && activeVocalAnchorPosition >= 0
                                  ? activeVocalAnchorPosition
                                  : undefined,
                          "data-active-karaoke-vocal-row-index": shouldUseVocalRowAnchor ? activeVocalRowIndex : undefined,
                  },
                  stackChildren
          );
  }

	const furiganaEnabled = CONFIG?.visual?.["furigana-enabled"] === true;
	const furiganaReady = window.FuriganaConverter?.isAvailable?.() === true;
	const detectedLanguage = Utils.getDetectedLanguage?.() || null;

	const { furiganaMap, timedChars, endTime, wrapByWord, textDirection, useTextRun } = useMemo(() => {
		const sourceSyllables = Array.isArray(line.syllables) && line.syllables.length > 0
			? line.syllables
			: getTimedSyllablesFromLine(line);
		const rawLineText = sourceSyllables.map((syllable) => syllable?.text || "").join("")
			|| getCopyableText(line.text)
			|| "";
		const processedText = Utils.applyFuriganaIfEnabled(rawLineText);
		const compensatedTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));
		const detectedTextDirection = getKaraokeTextDirection(rawLineText);

		return {
			furiganaMap: buildKaraokeFuriganaMap(processedText),
			timedChars: compensatedTimedChars,
			endTime: compensatedTimedChars.reduce(
				(maxEndTime, charInfo) => Math.max(maxEndTime, Number.isFinite(charInfo?.endTime) ? charInfo.endTime : 0),
				getKaraokeLineBounds(line).endTime
			),
			wrapByWord: shouldWrapKaraokeByWord(rawLineText, detectedLanguage),
			textDirection: detectedTextDirection,
			useTextRun: shouldUseKaraokeTextRun(rawLineText),
		};
	}, [line, furiganaEnabled, furiganaReady, detectedLanguage]);
	const isComplete = isActive && position >= endTime;

	const charElements = useTextRun ? [] : timedChars.map((charInfo, index) => {
		const fillRatio = getKaraokeCharFill(
			position,
			isActive,
			charInfo.startTime,
			charInfo.endTime
		);
		const charState = fillRatio <= 0 ? "pending" : fillRatio >= 1 ? "done" : "active";
		const globalCharIndex = globalCharOffset + index;
		const bounceAttenuation = getKaraokeBounceAttenuation(globalCharIndex, activeGlobalCharIndex);
		const bounce = getKaraokeBounceValues(
			position,
			isActive,
			charInfo.startTime,
			charInfo.endTime,
			bounceAttenuation
		);
		const karaokeStyle = {};
		if (charState === "active") {
			const fillValue = Math.max(0, Math.min(100, fillRatio * 100));
			const softEdge = 16;
			karaokeStyle["--karaoke-char-fill"] = `${fillValue}%`;
			karaokeStyle["--karaoke-char-fill-soft-start"] = `${Math.max(0, fillValue - softEdge)}%`;
			karaokeStyle["--karaoke-char-fill-soft-end"] = `${Math.min(100, fillValue + softEdge)}%`;
		}
		if (bounce.active) {
			karaokeStyle["--karaoke-bounce-y"] = `${bounce.offsetY}px`;
			karaokeStyle["--karaoke-bounce-scale"] = bounce.scale;
		}
		let className = `lyrics-karaoke-char lyrics-karaoke-char--${charState}`;
		if (bounce.active) {
			className += " is-bouncing";
		}
		if (isComplete) {
			className += " is-complete";
		}
		const charNode = react.createElement(
			"span",
			{
				className,
				style: karaokeStyle,
				key: `karaoke-char-${index}`,
			},
			charInfo.char
		);
		const reading = furiganaMap.get(index);

		if (!reading) {
			return charNode;
		}

		return react.createElement(
			"ruby",
			{
				className: `lyrics-karaoke-ruby lyrics-karaoke-ruby--${charState}`,
				style: karaokeStyle,
				key: `karaoke-ruby-${index}`,
			},
			charNode,
			react.createElement("rt", null, reading)
		);
	});
	const lineChildren = useTextRun
		? buildKaraokeTextRunElements(
			timedChars,
			position,
			isActive,
			isComplete,
			textDirection,
			globalCharOffset,
			activeGlobalCharIndex
		)
		: wrapByWord
		? buildKaraokeWordElements(timedChars, charElements)
		: charElements;

	return react.createElement(
		"span",
		{
			className: `lyrics-karaoke-line${wrapByWord || useTextRun ? " has-word-wrap" : ""}${useTextRun ? " is-text-run" : ""}${textDirection === "rtl" ? " is-rtl" : ""}${isActive ? " is-active" : ""}${isComplete ? " is-complete" : ""}`,
			dir: useTextRun ? (textDirection === "rtl" ? "ltr" : textDirection) : undefined,
		},
		lineChildren
	);
});

const SyncedLyricsPage = react.memo(({ lyrics = [], provider, contributors, copyright, isKara, karaokeSource = null, reRenderLyricsPage = null }) => {
	const position = useLyricsPlaybackPosition();
	const karaokePosition = isKara ? position + getPseudoKaraokeRenderAdvance(karaokeSource) : position;
	const karaokeLineTransitionClass = isKara && CONFIG.visual["karaoke-line-transition"]
		? " karaoke-line-transition-enabled"
		: "";
  const [containerReady, setContainerReady] = useState(false);
  const compactActiveLineEle = useRef();
  const [activeAnchorRevision, setActiveAnchorRevision] = useState(0);
  const lyricContainerEle = useRef();
  const lyricsId = useMemo(() => lyrics[0]?.text || "no-lyrics", [lyrics]);

  const setCompactActiveLineAnchor = useCallback((node) => {
          if (compactActiveLineEle.current === node) {
                  return;
          }
          compactActiveLineEle.current = node;
          if (node) {
                  setActiveAnchorRevision((revision) => revision + 1);
          }
  }, []);

  const containerRefCallback = useCallback((node) => {
          lyricContainerEle.current = node;
          if (node) {
			setContainerReady(true);
		}
	}, []);
	const {
		isScrolling,
		handleContainerClick,
		renderItems,
		compactOffset,
		activeLyricIndex,
		globalCharOffsets,
		activeGlobalCharIndex,
	} = useSyncedLyricsEngine({
		lyrics,
		position: karaokePosition,
		compact: true,
		isKara,
		containerRef: lyricContainerEle,
		activeLineRef: compactActiveLineEle,
          lyricsId,
          containerReady,
          settingsRevision: reRenderLyricsPage,
          anchorRevision: activeAnchorRevision,
  });

	const prevScrollModeRef = useRef(false);
	useEffect(() => {
		if (!isScrolling) {
			if (prevScrollModeRef.current && lyricContainerEle.current) {
				lyricContainerEle.current.scrollTop = 0;
			}
			prevScrollModeRef.current = false;
			return undefined;
		}

		if (prevScrollModeRef.current) {
			return undefined;
		}

		const raf = typeof requestAnimationFrame === "function"
			? requestAnimationFrame
			: (callback) => setTimeout(callback, 0);
		const cancelRaf = typeof cancelAnimationFrame === "function"
			? cancelAnimationFrame
			: clearTimeout;
		let nestedFrameId = null;
		const frameId = raf(() => {
			nestedFrameId = raf(() => {
				scrollSyncedContainerToActiveLine(
					lyricContainerEle.current,
					compactActiveLineEle.current,
					"auto"
				);
			});
		});

		prevScrollModeRef.current = isScrolling;
		return () => {
			cancelRaf(frameId);
			if (nestedFrameId !== null) {
				cancelRaf(nestedFrameId);
			}
		};
	}, [isScrolling, lyricsId]);

	if (!Array.isArray(lyrics) || lyrics.length === 0) {
		return react.createElement("div", { className: "lyrics-lyricsContainer-SyncedLyricsPage" }, renderLyricsUnavailable(I18n.t("messages.noLyrics")));
	}

	return react.createElement(
		"div",
		{
			className: `lyrics-lyricsContainer-SyncedLyricsPage${isKara ? " is-karaoke" : ""}${karaokeLineTransitionClass}${isScrolling ? " scrolling-active" : ""}`,
			ref: containerRefCallback,
			onClick: handleContainerClick,
		},
		react.createElement(
			"div",
			{
				className: "lyrics-lyricsContainer-SyncedLyrics",
				style: {
					"--offset": `${compactOffset}px`,
				},
				key: lyricsId,
			},
			...renderLyricsItems({
                          items: renderItems,
                          isKara,
                          position: karaokePosition,
                          activeLineRef: setCompactActiveLineAnchor,
                          settingsRevision: reRenderLyricsPage,
                  })
          )
	);
});

// Global SearchBar manager to prevent duplicate instances
const SearchBarManager = {
	instance: null,
	bindings: new Set(),

	register(instance) {
		// Clean up previous instance
		if (this.instance) {
			this.cleanup();
		}
		this.instance = instance;
	},

	unregister(instance) {
		if (this.instance === instance) {
			this.cleanup();
			this.instance = null;
		}
	},

	bind(key, callback) {
		const bindingKey = `${key}-${callback.name}`;
		if (this.bindings.has(bindingKey)) {
			return; // Already bound
		}
		Spicetify.Mousetrap().bind(key, callback);
		this.bindings.add(bindingKey);
	},

	bindToContainer(container, key, callback) {
		const bindingKey = `container-${key}-${callback.name}`;
		if (this.bindings.has(bindingKey)) {
			return; // Already bound
		}
		Spicetify.Mousetrap(container).bind(key, callback);
		this.bindings.add(bindingKey);
	},

	cleanup() {
		this.bindings.forEach(bindingKey => {
			const [type, key] = bindingKey.split('-');
			if (type === 'container' && this.instance?.container) {
				try {
					Spicetify.Mousetrap(this.instance.container).unbind(key);
				} catch (e) {
					// Container might be null
				}
			} else {
				try {
					Spicetify.Mousetrap().unbind(key);
				} catch (e) {
					// Mousetrap might not be available
				}
			}
		});
		this.bindings.clear();
	}
};

class SearchBar extends react.Component {
	constructor() {
		super();
		this.state = {
			hidden: true,
			atNode: 0,
			foundNodes: [],
		};
		this.container = null;
		this.instanceId = `searchbar-${Date.now()}-${Math.random()}`;
		this.getNodeFromInput = this.getNodeFromInput.bind(this);
		this.handleInputRef = (node) => {
			this.container = node;
		};
	}

	componentDidMount() {
		// Register with global manager
		SearchBarManager.register(this);

		this.viewPort = document.querySelector(".main-view-container .os-viewport");
		this.mainViewOffsetTop = document.querySelector(".Root__main-view")?.offsetTop || 0;

		this.toggleCallback = () => {
			if (!(Spicetify.Platform.History.location.pathname === "/ivLyrics" && this.container)) return;

			if (this.state.hidden) {
				this.setState({ hidden: false });
				this.container.focus();
			} else {
				this.setState({ hidden: true });
				this.container.blur();
			}
		};
		this.unFocusCallback = () => {
			if (this.container) {
				this.container.blur();
				this.setState({ hidden: true });
			}
		};
		this.loopThroughCallback = (event) => {
			if (!this.state.foundNodes.length) {
				return;
			}

			if (event.key === "Enter") {
				const dir = event.shiftKey ? -1 : 1;
				let atNode = this.state.atNode + dir;
				if (atNode < 0) {
					atNode = this.state.foundNodes.length - 1;
				}
				atNode %= this.state.foundNodes.length;
				const rects = this.state.foundNodes[atNode].getBoundingClientRect();
				if (this.viewPort) {
					this.viewPort.scrollBy(0, rects.y - 100);
				}
				this.setState({ atNode });
			}
		};

		// Use SearchBarManager to prevent duplicate bindings
		SearchBarManager.bind("mod+shift+f", this.toggleCallback);
		if (this.container) {
			SearchBarManager.bindToContainer(this.container, "mod+shift+f", this.toggleCallback);
			SearchBarManager.bindToContainer(this.container, "enter", this.loopThroughCallback);
			SearchBarManager.bindToContainer(this.container, "shift+enter", this.loopThroughCallback);
			SearchBarManager.bindToContainer(this.container, "esc", this.unFocusCallback);
		}
	}

	componentWillUnmount() {
		// Unregister from global manager
		SearchBarManager.unregister(this);
	}

	getNodeFromInput(event) {
		const value = event.target.value.toLowerCase();
		if (!value) {
			this.setState({ foundNodes: [] });
			this.viewPort.scrollTo(0, 0);
			return;
		}

		const lyricsPage = document.querySelector(".lyrics-lyricsContainer-UnsyncedLyricsPage");
		const walker = document.createTreeWalker(
			lyricsPage,
			NodeFilter.SHOW_TEXT,
			(node) => {
				if (node.textContent.toLowerCase().includes(value)) {
					return NodeFilter.FILTER_ACCEPT;
				}
				return NodeFilter.FILTER_REJECT;
			},
			false
		);

		const foundNodes = [];
		while (walker.nextNode()) {
			const range = document.createRange();
			range.selectNodeContents(walker.currentNode);
			foundNodes.push(range);
		}

		if (!foundNodes.length) {
			this.viewPort.scrollBy(0, 0);
		} else {
			const rects = foundNodes[0].getBoundingClientRect();
			this.viewPort.scrollBy(0, rects.y - 100);
		}

		this.setState({ foundNodes, atNode: 0 });
	}

	render() {
		let y = 0;
		let height = 0;
		if (this.state.foundNodes.length) {
			const node = this.state.foundNodes[this.state.atNode];
			const rects = node.getBoundingClientRect();
			y = rects.y + this.viewPort.scrollTop - this.mainViewOffsetTop;
			height = rects.height;
		}
		return react.createElement(
			"div",
			{
				className: `lyrics-Searchbar${this.state.hidden ? " hidden" : ""}`,
			},
						react.createElement("input", {
								ref: this.handleInputRef,
								onChange: this.getNodeFromInput,
						}),
			react.createElement("svg", {
				width: 16,
				height: 16,
				viewBox: "0 0 16 16",
				fill: "currentColor",
				dangerouslySetInnerHTML: {
					__html: Spicetify.SVGIcons.search,
				},
			}),
			react.createElement(
				"span",
				{
					hidden: this.state.foundNodes.length === 0,
				},
				`${this.state.atNode + 1}/${this.state.foundNodes.length}`
			),
			react.createElement("div", {
				className: "lyrics-Searchbar-highlight",
				style: {
					"--search-highlight-top": `${y}px`,
					"--search-highlight-height": `${height}px`,
				},
			})
		);
	}
}

function isInViewport(element) {
	const rect = element.getBoundingClientRect();
	return (
		rect.top >= 0 &&
		rect.left >= 0 &&
		rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
		rect.right <= (window.innerWidth || document.documentElement.clientWidth)
	);
}

const SyncedExpandedLyricsPage = react.memo(({ lyrics = [], provider, contributors, copyright, isKara, karaokeSource = null, reRenderLyricsPage = null }) => {
	const position = useLyricsPlaybackPosition();
	const karaokePosition = isKara ? position + getPseudoKaraokeRenderAdvance(karaokeSource) : position;
	const karaokeLineTransitionClass = isKara && CONFIG.visual["karaoke-line-transition"]
		? " karaoke-line-transition-enabled"
		: "";
	const activeLineRef = useRef(null);
	const pageRef = useRef(null);
	const lyricsId = useMemo(() => lyrics[0]?.text || "no-lyrics", [lyrics]);
	const {
		handleContainerClick,
		renderItems,
	} = useSyncedLyricsEngine({
		lyrics,
		position: karaokePosition,
		compact: false,
		isKara,
		containerRef: pageRef,
		activeLineRef,
		lyricsId,
		settingsRevision: reRenderLyricsPage,
	});

	if (!Array.isArray(lyrics) || lyrics.length === 0) {
		return react.createElement("div", { className: "lyrics-lyricsContainer-UnsyncedLyricsPage" }, renderLyricsUnavailable(I18n.t("messages.noLyrics")));
	}

	return react.createElement(
		"div",
		{
			className: `lyrics-lyricsContainer-UnsyncedLyricsPage${isKara ? " is-karaoke" : ""}${karaokeLineTransitionClass}`,
			key: lyricsId,
			ref: pageRef,
			onClick: handleContainerClick,
		},
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),
		...renderLyricsItems({
			items: renderItems,
			isKara,
			position: karaokePosition,
			activeLineRef,
			settingsRevision: reRenderLyricsPage,
		}),
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),
		react.createElement(SearchBar, null)
	);
});

const UnsyncedLyricsPage = react.memo(({ lyrics = [], provider, contributors, copyright }) => {
	const lyricsArray = useMemo(() => normalizeUnsyncedLyrics(lyrics), [lyrics]);
	const renderItems = useMemo(() => lyricsArray.map(({ text, originalText, text2 }, index) => {
		const {
			lineText,
			subText,
			showMode2Translation,
			belowMode,
			showMode2,
		} = getUnsyncedLineRenderData(lyrics, text, originalText, text2);

		return {
			key: index,
			mainText: lineText,
			subText: belowMode ? subText : null,
			subText2: showMode2 ? showMode2Translation : null,
			mainCopyText: Utils.formatLyricLineToCopy(
				lineText,
				belowMode ? subText : null,
				showMode2 ? showMode2Translation : null,
				originalText
			),
			subCopyText: belowMode ? subText : null,
			subText2CopyText: showMode2 ? showMode2Translation : null,
			originalText,
		};
	}), [lyricsArray, lyrics]);

	if (lyricsArray.length === 0) {
		return react.createElement("div", { className: "lyrics-lyricsContainer-UnsyncedLyricsPage" }, renderLyricsUnavailable(I18n.t("messages.noLyrics")));
	}

	return react.createElement(
		"div",
		{
			className: "lyrics-lyricsContainer-UnsyncedLyricsPage",
		},
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),
		...renderItems.map((item) =>
			react.createElement(LyricsLineBlock, {
				key: item.key,
				className: "lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-active",
				mainText: item.mainText,
				subText: item.subText,
				subText2: item.subText2,
				originalText: item.originalText,
				mainCopyText: item.mainCopyText,
				subCopyText: item.subCopyText,
				subText2CopyText: item.subText2CopyText,
			})
		),
		react.createElement("p", {
			className: "lyrics-lyricsContainer-LyricsUnsyncedPadding",
		}),

		react.createElement(SearchBar, null)
	);
});




const LoadingIcon = react.createElement(
	"svg",
	{
		width: "200px",
		height: "200px",
		viewBox: "0 0 100 100",
		preserveAspectRatio: "xMidYMid",
	},
	react.createElement(
		"circle",
		{
			cx: "50",
			cy: "50",
			r: "0",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
		},
		react.createElement("animate", {
			attributeName: "r",
			repeatCount: "indefinite",
			dur: "1s",
			values: "0;40",
			keyTimes: "0;1",
			keySplines: "0 0.2 0.8 1",
			calcMode: "spline",
			begin: "0s",
		}),
		react.createElement("animate", {
			attributeName: "opacity",
			repeatCount: "indefinite",
			dur: "1s",
			values: "1;0",
			keyTimes: "0;1",
			keySplines: "0.2 0 0.8 1",
			calcMode: "spline",
			begin: "0s",
		})
	),
	react.createElement(
		"circle",
		{
			cx: "50",
			cy: "50",
			r: "0",
			fill: "none",
			stroke: "currentColor",
			"stroke-width": "2",
		},
		react.createElement("animate", {
			attributeName: "r",
			repeatCount: "indefinite",
			dur: "1s",
			values: "0;40",
			keyTimes: "0;1",
			keySplines: "0 0.2 0.8 1",
			calcMode: "spline",
			begin: "-0.5s",
		}),
		react.createElement("animate", {
			attributeName: "opacity",
			repeatCount: "indefinite",
			dur: "1s",
			values: "1;0",
			keyTimes: "0;1",
			keySplines: "0.2 0 0.8 1",
			calcMode: "spline",
			begin: "-0.5s",
		})
	)
);

const createNoLyricsParticle = (index, cx, radius, x, duration, delay, opacity = 0.75) =>
	react.createElement("circle", {
		key: `particle-${index}`,
		className: `lyrics-noLyricsMotion-particle lyrics-noLyricsMotion-particle-${index}`,
		cx,
		cy: "168",
		r: radius,
		fill: "currentColor",
		style: {
			"--particle-x": `${x}px`,
			"--particle-duration": `${duration}s`,
			"--particle-delay": `${delay}s`,
			"--particle-opacity": opacity,
		},
	});

const NoLyricsAnimation = () => react.createElement(
	"svg",
	{
		className: "lyrics-noLyricsMotion",
		viewBox: "0 0 280 180",
		width: "280",
		height: "180",
		role: "img",
		"aria-label": I18n.t("messages.noLyrics"),
		focusable: "false",
	},
	react.createElement(
		"g",
		{ className: "lyrics-noLyricsMotion-staff", "aria-hidden": "true" },
		[68, 88, 108, 128].map((y) =>
			react.createElement("line", {
				key: y,
				x1: "24",
				y1: y,
				x2: "256",
				y2: y,
				stroke: "currentColor",
				"stroke-width": "1",
				"stroke-linecap": "round",
			})
		)
	),
	react.createElement("path", {
		className: "lyrics-noLyricsMotion-wave lyrics-noLyricsMotion-wave-soft",
		d: "M18 104 C60 72 100 136 142 104 S224 72 262 104",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "2",
		"stroke-linecap": "round",
	}),
	react.createElement("path", {
		className: "lyrics-noLyricsMotion-wave lyrics-noLyricsMotion-wave-main",
		d: "M18 104 C60 72 100 136 142 104 S224 72 262 104",
		fill: "none",
		stroke: "currentColor",
		"stroke-width": "3",
		"stroke-linecap": "round",
	}),
	react.createElement(
		"g",
		{ className: "lyrics-noLyricsMotion-particles", "aria-hidden": "true" },
		[
			createNoLyricsParticle(1, 42, 2.2, 18, 7.4, -0.8, 0.72),
			createNoLyricsParticle(2, 70, 1.7, -12, 8.8, -4.1, 0.58),
			createNoLyricsParticle(3, 98, 2.8, 24, 7.9, -2.2, 0.86),
			createNoLyricsParticle(4, 128, 1.8, -18, 9.6, -6.4, 0.55),
			createNoLyricsParticle(5, 158, 2.3, 15, 7.1, -1.7, 0.78),
			createNoLyricsParticle(6, 188, 1.6, -14, 8.4, -5.3, 0.56),
			createNoLyricsParticle(7, 216, 2.6, 22, 8.1, -3.2, 0.82),
			createNoLyricsParticle(8, 242, 1.8, -10, 9.2, -7.1, 0.6),
		]
	),
	react.createElement(
		"g",
		{ className: "lyrics-noLyricsMotion-notes", "aria-hidden": "true" },
		react.createElement("path", {
			className: "lyrics-noLyricsMotion-note lyrics-noLyricsMotion-note-1",
			d: "M103 45v36c-3-2-6-3-10-3-8 0-14 5-14 10s6 10 14 10 14-5 14-10V56l26-6V39z",
			fill: "currentColor",
		}),
		react.createElement("path", {
			className: "lyrics-noLyricsMotion-note lyrics-noLyricsMotion-note-2",
			d: "M194 66v30c-2-1-5-2-8-2-7 0-12 4-12 9s5 9 12 9 12-4 12-9V76l23 6v28c-2-1-5-2-8-2-7 0-12 4-12 9s5 9 12 9 12-4 12-9V73z",
			fill: "currentColor",
		})
	)
);

window.ivLyricsNoLyricsAnimation = NoLyricsAnimation;


const LyricsPage = ({ lyricsContainer }) => {
	const modes = CONFIG.modes;
	const activeMode = lyricsContainer.getCurrentMode();

	const topBarProps = {
		links: modes,
		activeLink: modes[activeMode] || modes[0],
		switchCallback: (mode) => {
			const modeIndex = modes.indexOf(mode);
			if (modeIndex !== -1) {
				lyricsContainer.switchTo(modeIndex);
			}
		}
	};

	const topBarContent = typeof TopBarContent === "function"
		? react.createElement(TopBarContent, topBarProps)
		: null;

	return react.createElement(
		"div",
		{
			className: "lyrics-page-wrapper",
			style: { width: "100%", height: "100%", position: "relative" }
		},
		topBarContent,
		lyricsContainer.render(),
		react.createElement(CreditFooter, {
			provider: lyricsContainer.state.provider,
			contributors: lyricsContainer.state.contributors
		})
	);
};

const LyricsUnavailableView = react.memo(({ isLoading }) =>
	isLoading
		? renderLyricsUnavailable(LoadingIcon)
		: renderLyricsUnavailable(
			react.createElement(NoLyricsAnimation, null),
			"lyrics-lyricsContainer-LyricsUnavailableMessage--motion"
		)
);

const LyricsPageRenderer = react.memo(({
	mode = -1,
	karaokeMode = 0,
	syncedMode = 1,
	unsyncedMode = 2,
	trackUri = "",
	currentLyrics = [],
	karaoke = null,
	karaokeSource = null,
	synced = null,
	unsynced = null,
	provider = null,
	contributors = null,
	copyright = null,
	isLoading = false,
	showMarketplace = false,
	onCloseMarketplace = null,
	reRenderLyricsPage = null,
}) => {
	const sharedLyrics = Array.isArray(currentLyrics) ? currentLyrics : [];
	const karaokeLyrics = Array.isArray(currentLyrics)
		? currentLyrics
		: (Array.isArray(karaoke) ? karaoke : []);

	const renderDescriptor = useMemo(() => {
		if (showMarketplace && typeof MarketplacePage !== "undefined") {
			return {
				component: MarketplacePage,
				props: {
					onClose: onCloseMarketplace,
				},
			};
		}

		if (mode === karaokeMode && karaoke) {
			return {
				component: SyncedLyricsPage,
				props: {
					trackUri,
					lyrics: karaokeLyrics,
					provider,
					contributors,
					copyright,
					isKara: true,
					karaokeSource,
					reRenderLyricsPage,
				},
			};
		}

		if (mode === syncedMode && synced) {
			return {
				component: CONFIG.visual["synced-compact"]
					? SyncedLyricsPage
					: SyncedExpandedLyricsPage,
				props: {
					trackUri,
					lyrics: sharedLyrics,
					provider,
					contributors,
					copyright,
					reRenderLyricsPage,
				},
			};
		}

		if (mode === unsyncedMode && unsynced) {
			return {
				component: UnsyncedLyricsPage,
				props: {
					trackUri,
					lyrics: sharedLyrics,
					provider,
					contributors,
					copyright,
					reRenderLyricsPage,
				},
			};
		}

		return null;
	}, [
		showMarketplace,
		onCloseMarketplace,
		mode,
		karaokeMode,
		syncedMode,
		unsyncedMode,
		karaoke,
		karaokeSource,
		synced,
		unsynced,
		karaokeLyrics,
		sharedLyrics,
		trackUri,
		provider,
		contributors,
		copyright,
		reRenderLyricsPage,
	]);

	const content = useMemo(() => {
		if (!renderDescriptor) {
			return react.createElement(LyricsUnavailableView, { isLoading });
		}

		return react.createElement(renderDescriptor.component, renderDescriptor.props);
	}, [renderDescriptor, isLoading]);

	return react.createElement(
		react.Fragment,
		null,
		content,
		react.createElement(CreditFooter, {
			provider,
			contributors,
		})
	);
});

window.LyricsPageRenderer = LyricsPageRenderer;
