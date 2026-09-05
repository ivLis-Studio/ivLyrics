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
		points: I18n.t("creatorProfile.points") || "Contribution points",
		pointsShort: I18n.t("creatorProfile.pointsShort") || "pts",
		typeLine: I18n.t("creatorProfile.typeLine") || "Line",
		typeWord: I18n.t("creatorProfile.typeWord") || "Word",
		typeCharacter: I18n.t("creatorProfile.typeCharacter") || "Character",
		typeMixed: I18n.t("creatorProfile.typeMixed") || "Mixed",
		typeUnknown: I18n.t("creatorProfile.typeUnknown") || "Legacy sync",
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
		clearArtistFilter: I18n.t("creatorProfile.clearArtistFilter") || "Clear artist filter",
		filteredArtist: I18n.t("creatorProfile.filteredArtist") || "Filtered artist",
		supporter: I18n.t("creatorProfile.supporter") || "Supporter",
		monthlySupporter: I18n.t("creatorProfile.monthlySupporter") || "Monthly Supporter",
		nicknameStyle: I18n.t("creatorProfile.nicknameStyle") || "Nickname style",
		nicknameStyleDesc: I18n.t("creatorProfile.nicknameStyleDesc") || "This color is used for your name in the sync creator credit below the lyrics.",
		solid: I18n.t("creatorProfile.solid") || "Solid",
		gradient: I18n.t("creatorProfile.gradient") || "Gradient",
		solidColor: I18n.t("creatorProfile.solidColor") || "Solid color",
		gradientStart: I18n.t("creatorProfile.gradientStart") || "Start color",
		gradientEnd: I18n.t("creatorProfile.gradientEnd") || "End color",
		gradientAngle: I18n.t("creatorProfile.gradientAngle") || "Gradient angle",
		decorationPreview: I18n.t("creatorProfile.decorationPreview") || "Preview",
		saveDecoration: I18n.t("creatorProfile.saveDecoration") || "Save color",
		resetDecoration: I18n.t("creatorProfile.resetDecoration") || "Reset to default",
		refreshSupportRole: I18n.t("creatorProfile.refreshSupportRole") || "Refresh supporter role",
		supportRoleNotFound: I18n.t("creatorProfile.supportRoleNotFound") || "No supporter role was found. Refresh after your Discord role is assigned.",
		monthlyOnlyGradient: I18n.t("creatorProfile.monthlyOnlyGradient") || "Gradients are available to Monthly Supporters only.",
		decorationSaved: I18n.t("creatorProfile.decorationSaved") || "Nickname color saved.",
		decorationReset: I18n.t("creatorProfile.decorationReset") || "Nickname color reset.",
		decorationSaveFailed: I18n.t("creatorProfile.decorationSaveFailed") || "Failed to save nickname color.",
		supportRoleRefreshFailed: I18n.t("creatorProfile.supportRoleRefreshFailed") || "Failed to refresh supporter role."
	};
}

function normalizePublicSyncType(value) {
	const normalized = String(value || "").trim().toLowerCase();
	return ["line", "word", "character", "mixed"].includes(normalized) ? normalized : "unknown";
}

function getSyncTypePresentation(value, copy = getCreatorProfileCopy()) {
	const type = normalizePublicSyncType(value);
	return {
		type,
		label: type === "line" ? copy.typeLine : type === "word" ? copy.typeWord : type === "character" ? copy.typeCharacter : type === "mixed" ? copy.typeMixed : copy.typeUnknown
	};
}

const SyncTypeBadge = ({ type, points = null, compact = false, hideUnknown = false }) => {
	const copy = getCreatorProfileCopy();
	const presentation = getSyncTypePresentation(type, copy);
	if (hideUnknown && presentation.type === "unknown") return null;
	const numericPoints = Number(points);
	const title = Number.isFinite(numericPoints) && numericPoints > 0
		? `${presentation.label} · ${numericPoints} ${copy.pointsShort}`
		: presentation.label;
	return react.createElement(
		"span",
		{
			className: `lyrics-sync-type-badge is-${presentation.type}${compact ? " is-compact" : ""}`,
			title,
			"aria-label": title
		},
		presentation.label,
		!compact && Number.isFinite(numericPoints) && numericPoints > 0
			? react.createElement("span", { className: "lyrics-sync-type-points" }, `+${numericPoints}`)
			: null
	);
};

function getSupportBadgeLabel(tier, copy = getCreatorProfileCopy()) {
	if (tier === "monthly") return copy.monthlySupporter;
	if (tier === "supporter") return copy.supporter;
	return "";
}

function getEffectiveCreatorDecoration(tier, decoration) {
	if ((tier !== "supporter" && tier !== "monthly") || !decoration) {
		return null;
	}
	if (tier === "monthly" && decoration.mode === "gradient") {
		return { ...decoration, mode: "gradient" };
	}
	return { ...decoration, mode: "solid" };
}

function getCreatorDecorationStyle(tier, decoration) {
	const effective = getEffectiveCreatorDecoration(tier, decoration);
	if (!effective) return null;
	if (effective.mode === "gradient") {
		return {
			backgroundImage: `linear-gradient(${Number(effective.gradientAngle) || 0}deg, ${effective.gradientStartColor}, ${effective.gradientEndColor})`,
			WebkitBackgroundClip: "text",
			backgroundClip: "text",
			WebkitTextFillColor: "transparent",
			color: effective.gradientStartColor
		};
	}
	return { color: effective.solidColor };
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

function normalizeContributorEntry(contributor, options = {}) {
	const anonymousLabel = typeof options.anonymousLabel === "string" && options.anonymousLabel.trim()
		? options.anonymousLabel.trim()
		: "Anonymous";
	const sequenceKey = Number.isInteger(options.sequenceKey) ? options.sequenceKey : 0;

	if (!contributor) {
		return null;
	}

	if (typeof contributor === "string") {
		const rawName = contributor.trim() || "Anonymous";
		const isAnonymous = rawName.toLowerCase() === "anonymous";
		const name = isAnonymous ? anonymousLabel : rawName;
		return {
			key: `name:${name.toLowerCase()}`,
			userHash: null,
			name,
			avatarUrl: null,
			linked: false,
			profileAvailable: false,
			anonymous: isAnonymous,
			isPrivate: false
		};
	}

	if (typeof contributor !== "object") {
		return null;
	}

	const isPrivate = contributor.isPrivate === true || contributor.profilePublic === false;
	const identityRedacted = contributor.identityRedacted === true;
	const identityHidden = isPrivate || identityRedacted || contributor.anonymous === true;
	const rawName = String(contributor.name || contributor.nickname || contributor.displayName || "Anonymous").trim() || "Anonymous";
	const isAnonymous = identityHidden || rawName.toLowerCase() === "anonymous";
	const name = isAnonymous ? anonymousLabel : rawName;
	const userHash = !identityHidden && typeof contributor.userHash === "string" && contributor.userHash.trim()
		? contributor.userHash.trim()
		: null;

	return {
		key: isPrivate || identityRedacted
			? `${isPrivate ? "private" : "redacted"}:${sequenceKey}`
			: (userHash || `name:${name.toLowerCase()}`),
		userHash,
		name,
		avatarUrl: !identityHidden && typeof contributor.avatarUrl === "string" ? contributor.avatarUrl : null,
		linked: !identityHidden && !!contributor.linked,
		profileAvailable: !identityHidden && (contributor.profileAvailable ?? !!userHash),
		anonymous: isAnonymous,
		isPrivate,
		identityRedacted,
		decoration: !identityHidden && contributor.decoration && typeof contributor.decoration === "object"
			? contributor.decoration
			: null,
		syncType: normalizePublicSyncType(contributor.syncType),
		syncPoints: Number.isFinite(Number(contributor.syncPoints)) ? Number(contributor.syncPoints) : null
	};
}

function getDisplayContributors(contributors, limit = 3, anonymousLabel = "Anonymous") {
	if (!Array.isArray(contributors) || contributors.length === 0) {
		return [];
	}

	const result = [];
	const seen = new Set();
	let anonymousAdded = false;

	for (let contributorIndex = 0; contributorIndex < contributors.length; contributorIndex += 1) {
		const rawContributor = contributors[contributorIndex];
		const contributor = normalizeContributorEntry(rawContributor, {
			anonymousLabel,
			sequenceKey: contributorIndex
		});
		if (!contributor) {
			continue;
		}

		if (contributor.isPrivate || contributor.identityRedacted) {
			result.push(contributor);
		} else if (contributor.anonymous && !contributor.profileAvailable) {
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
	"cs",
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
	cs: "Překládání tohoto pozdravu...",
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

const CreatorDecorationEditor = react.memo(({
	displayName,
	tier,
	decoration,
	pending,
	onSave,
	onReset,
	onRefresh
}) => {
	const copy = getCreatorProfileCopy();
	const defaults = Utils.getCreatorDecorationDefaults();
	const source = decoration ? { ...defaults, ...decoration } : defaults;
	const [draft, setDraft] = react.useState(source);
	const [notice, setNotice] = react.useState("");

	react.useEffect(() => {
		setDraft(decoration ? { ...defaults, ...decoration } : defaults);
		setNotice("");
	}, [decoration?.mode, decoration?.solidColor, decoration?.gradientStartColor, decoration?.gradientEndColor, decoration?.gradientAngle, tier]);

	if (tier !== "supporter" && tier !== "monthly") {
		return null;
	}

	const previewDecoration = {
		...draft,
		mode: tier === "monthly" ? draft.mode : "solid"
	};
	const previewStyle = getCreatorDecorationStyle(tier, previewDecoration) || {};
	const chooseMode = (mode) => {
		if (mode === "gradient" && tier !== "monthly") {
			setNotice(copy.monthlyOnlyGradient);
			Toast.warning(copy.monthlyOnlyGradient);
			return;
		}
		setNotice("");
		setDraft((current) => ({ ...current, mode }));
	};

	const colorField = (label, key) => react.createElement(
		"label",
		{ className: "lyrics-creator-decoration-field" },
		react.createElement("span", null, label),
		react.createElement(
			"span",
			{ className: "lyrics-creator-decoration-color-control" },
			react.createElement("input", {
				type: "color",
				value: draft[key],
				disabled: pending,
				onChange: (event) => {
					const nextColor = event.currentTarget.value.toUpperCase();
					setDraft((current) => ({ ...current, [key]: nextColor }));
				}
			}),
			react.createElement("code", null, draft[key])
		)
	);

	return react.createElement(
		"section",
		{ className: "lyrics-creator-decoration-editor", "aria-label": copy.nicknameStyle },
		react.createElement(
			"div",
			{ className: "lyrics-creator-decoration-heading" },
			react.createElement(
				"div",
				null,
				react.createElement("h3", null, copy.nicknameStyle),
				react.createElement("p", null, copy.nicknameStyleDesc)
			),
			react.createElement("span", { className: `lyrics-creator-support-badge is-${tier}` }, getSupportBadgeLabel(tier, copy))
		),
		react.createElement(
			"div",
			{ className: "lyrics-creator-decoration-modes" },
			react.createElement("button", {
				type: "button",
				className: draft.mode === "solid" || tier !== "monthly" ? "is-active" : "",
				"aria-pressed": draft.mode === "solid" || tier !== "monthly",
				disabled: pending,
				onClick: () => chooseMode("solid")
			}, copy.solid),
			react.createElement("button", {
				type: "button",
				className: `${draft.mode === "gradient" && tier === "monthly" ? "is-active" : ""} ${tier !== "monthly" ? "is-locked" : ""}`.trim(),
				"aria-pressed": draft.mode === "gradient" && tier === "monthly",
				"aria-describedby": tier !== "monthly" ? "lyrics-creator-decoration-notice" : undefined,
				disabled: pending,
				onClick: () => chooseMode("gradient")
			}, `${copy.gradient}${tier !== "monthly" ? ` · ${copy.monthlySupporter}` : ""}`)
		),
		react.createElement("div", {
			id: "lyrics-creator-decoration-notice",
			className: "lyrics-creator-decoration-notice",
			role: "status",
			"aria-live": "polite",
			hidden: !notice
		}, notice),
		draft.mode === "gradient" && tier === "monthly"
			? react.createElement(
				"div",
				{ className: "lyrics-creator-decoration-fields" },
				colorField(copy.gradientStart, "gradientStartColor"),
				colorField(copy.gradientEnd, "gradientEndColor"),
				react.createElement(
					"label",
					{ className: "lyrics-creator-decoration-field" },
					react.createElement("span", null, `${copy.gradientAngle} · ${draft.gradientAngle}°`),
					react.createElement("input", {
						type: "range",
						min: 0,
						max: 360,
						value: draft.gradientAngle,
						disabled: pending,
						onChange: (event) => {
							const nextAngle = Number(event.currentTarget.value);
							setDraft((current) => ({ ...current, gradientAngle: nextAngle }));
						}
					})
				)
			)
			: react.createElement("div", { className: "lyrics-creator-decoration-fields" }, colorField(copy.solidColor, "solidColor")),
		react.createElement(
			"div",
			{ className: "lyrics-creator-decoration-preview" },
			react.createElement("span", { className: "lyrics-creator-decoration-preview-label" }, copy.decorationPreview),
			react.createElement("strong", { style: previewStyle }, displayName)
		),
		react.createElement(
			"div",
			{ className: "lyrics-creator-decoration-actions" },
			react.createElement("button", { type: "button", disabled: pending, onClick: onRefresh }, copy.refreshSupportRole),
			react.createElement("button", { type: "button", disabled: pending, onClick: onReset }, copy.resetDecoration),
			react.createElement("button", {
				type: "button",
				className: "is-primary",
				disabled: pending,
				onClick: () => onSave({ ...draft, mode: tier === "monthly" ? draft.mode : "solid" })
			}, pending ? "..." : copy.saveDecoration)
		)
	);
});

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
	activeArtistFilter,
	onArtistFilterChange,
	supportInfo,
	decorationPending,
	onSaveDecoration,
	onResetDecoration,
	onRefreshSupport
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
	const contributionPoints = Number(profileData.stats?.contributionPoints || 0);
	const likeCount = Number(profileData.stats?.likeCount || 0);
	const typeCounts = profileData.stats?.typeCounts && typeof profileData.stats.typeCounts === "object"
		? profileData.stats.typeCounts
		: {};
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
	const [isDecorationEditorOpen, setIsDecorationEditorOpen] = react.useState(false);
	const canLike = !!profileData.viewer?.canLike;
	const liked = !!profileData.viewer?.liked;
	const isOwnProfile = !!profileData.viewer?.isOwnProfile;
	const avatarFailed = !!avatarUrl && failedAvatarUrl === avatarUrl;
	const subtitle = handle || (account?.displayName && account.displayName !== displayName ? account.displayName : null);
	const greeting = displayGreeting.trim();
	const showGreetingTranslationStatus = greetingTranslationStatus === "loading" && !!rawGreeting.trim();
	const canEditGreeting = isOwnProfile && typeof onSaveGreeting === "function";
	const publicProfileUrl = getCreatorPublicProfileUrl(profileData, contributor);
	const supportTier = supportInfo?.tier || "none";
	const supportBadgeLabel = getSupportBadgeLabel(supportTier, copy);
	const likeButtonLabel = likePending ? "..." : liked ? copy.liked : copy.like;
	const likeButtonTitle = !profileData.viewer?.authenticated && !isOwnProfile
		? copy.likeLoginRequired
		: copy.like;
	const isDarkTheme = uiTheme !== "light";
	const themeButtonTitle = isDarkTheme ? copy.switchToLight : copy.switchToDark;
	const themeButtonLabel = isDarkTheme ? copy.themeLight : copy.themeDark;
	const artistStats = Array.isArray(profileData.artistStats?.items) ? profileData.artistStats.items : [];
	const artistFilter = activeArtistFilter ?? profileData.filters?.artist ?? null;
	const hasLoadedProfileData = !!profileData.stats;
	const showSectionLoading = loading && !error && !hasLoadedProfileData;
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
	const decorationSettingsIcon = react.createElement(
		"svg",
		{
			width: 16,
			height: 16,
			viewBox: "0 0 24 24",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.8,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": "true"
		},
		react.createElement("path", { d: "M4 6h3m4 0h9M4 12h9m4 0h3M4 18h1m4 0h11" }),
		react.createElement("circle", { cx: 9, cy: 6, r: 2 }),
		react.createElement("circle", { cx: 15, cy: 12, r: 2 }),
		react.createElement("circle", { cx: 7, cy: 18, r: 2 })
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
		setIsDecorationEditorOpen(false);
	}, [contributor?.userHash]);

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
						react.createElement(
							"div",
							{ className: "lyrics-creator-profile-name-with-badge" },
							react.createElement("h2", { className: "lyrics-creator-profile-name" }, displayName),
							supportBadgeLabel && react.createElement("span", { className: `lyrics-creator-support-badge is-${supportTier}` }, supportBadgeLabel)
						),
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
					),
					isOwnProfile && react.createElement(
						"button",
						{
							type: "button",
							className: `lyrics-creator-profile-decoration-toggle ${isDecorationEditorOpen ? "is-active" : ""}`.trim(),
							onClick: () => setIsDecorationEditorOpen((current) => !current),
							title: copy.nicknameStyle,
							"aria-label": copy.nicknameStyle,
							"aria-expanded": isDecorationEditorOpen,
							"aria-controls": "lyrics-creator-decoration-panel"
						},
						decorationSettingsIcon
					)
				)
				),
			isOwnProfile && react.createElement(
				"div",
				{
					id: "lyrics-creator-decoration-panel",
					className: "lyrics-creator-decoration-panel",
					hidden: !isDecorationEditorOpen
				},
				supportTier !== "none"
					? react.createElement(CreatorDecorationEditor, {
						displayName,
						tier: supportTier,
						decoration: supportInfo?.decoration || null,
						pending: decorationPending,
						onSave: onSaveDecoration,
						onReset: onResetDecoration,
						onRefresh: onRefreshSupport
					})
					: react.createElement(
						"section",
						{ className: "lyrics-creator-decoration-editor is-role-missing", "aria-label": copy.nicknameStyle },
						react.createElement(
							"div",
							{ className: "lyrics-creator-decoration-heading" },
							react.createElement(
								"div",
								null,
								react.createElement("h3", null, copy.nicknameStyle),
								react.createElement("p", null, copy.supportRoleNotFound)
							),
							react.createElement(
								"button",
								{
									type: "button",
									className: "lyrics-creator-decoration-refresh-role",
									disabled: decorationPending,
									onClick: onRefreshSupport
								},
								copy.refreshSupportRole
							)
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
					),
					react.createElement(
						"div",
						{ className: "lyrics-creator-profile-stat is-points" },
						react.createElement("strong", null, contributionPoints.toLocaleString()),
						react.createElement("span", null, copy.points),
						react.createElement(
							"span",
							{ className: "lyrics-creator-profile-type-summary" },
							...["line", "word", "character", "mixed"]
								.filter((type) => Number(typeCounts[type] || 0) > 0)
								.map((type) => react.createElement(
									"span",
									{ key: type, className: `lyrics-creator-profile-type-count is-${type}` },
									react.createElement(SyncTypeBadge, { type, compact: true }),
									Number(typeCounts[type] || 0).toLocaleString()
								))
						)
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
					artistFilter && react.createElement(
						"div",
						{ className: "lyrics-creator-profile-toolbar" },
						react.createElement(
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
										react.createElement(SyncTypeBadge, { type: item.syncType, points: item.syncPoints }),
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
	const visibleContributors = useMemo(
		() => getDisplayContributors(contributors, 3, copy.anonymous),
		[contributors, copy.anonymous]
	);
	const visibleContributorSignature = useMemo(
		() => visibleContributors.map((contributor) => (
			`${contributor.userHash || contributor.key}:${contributor.decoration?.updatedAt || 0}`
		)).join("|"),
		[visibleContributors]
	);
	const [activeContributor, setActiveContributor] = useState(null);
	const [creatorProfile, setCreatorProfile] = useState(null);
	const [profileLoading, setProfileLoading] = useState(false);
	const [profileError, setProfileError] = useState(null);
	const [likePending, setLikePending] = useState(false);
	const [greetingPending, setGreetingPending] = useState(false);
	const [profileLoadingMore, setProfileLoadingMore] = useState(false);
	const [profileListRefreshing, setProfileListRefreshing] = useState(false);
	const [profileArtistFilter, setProfileArtistFilter] = useState(null);
	const [supportByUserHash, setSupportByUserHash] = useState({});
	const [decorationPending, setDecorationPending] = useState(false);
	const requestIdRef = useRef(0);
	const greetingTranslationRequestIdRef = useRef(0);

	useEffect(() => {
		const discordIds = visibleContributors
			.filter((contributor) => contributor.linked && Utils.isDiscordUserHash(contributor.userHash))
			.map((contributor) => contributor.userHash);
		if (!discordIds.length) return undefined;

		let cancelled = false;
		Promise.all(discordIds.map(async (userHash) => {
				try {
					return [userHash, await Utils.fetchDiscordSupportTier(userHash)];
				} catch (error) {
					console.warn("[ivLyrics] Failed to load supporter role:", error);
					return [userHash, "none"];
				}
			})).then((tiers) => {
			if (cancelled) return;
			setSupportByUserHash((current) => {
				const next = { ...current };
				for (const [userHash, tier] of tiers) {
					const contributor = visibleContributors.find((item) => item.userHash === userHash);
					next[userHash] = { tier, decoration: contributor?.decoration || null };
				}
				return next;
			});
		});

		return () => { cancelled = true; };
	}, [visibleContributorSignature]);

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
			if (error?.status === 403 || error?.status === 404) {
				// The contributor may have become private after the footer data was
				// loaded. Close the modal instead of retaining any verified-but-stale
				// identity from an earlier request.
				setCreatorProfile(null);
				setActiveContributor(null);
				setProfileError(null);
				Toast.error(error.message || copy.loadFailed);
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
		setProfileArtistFilter(null);
		setProfileListRefreshing(false);
		// Do not render cached contributor identity before the profile endpoint
		// confirms it is still public. A remote privacy change may make this
		// previously visible name/avatar/hash stale.
		setCreatorProfile(null);
		void loadCreatorProfile(contributor, {
			offset: 0,
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
			artist: profileArtistFilter,
			append: true
		});
	}, [activeContributor, creatorProfile, loadCreatorProfile, profileArtistFilter, profileLoadingMore]);

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
			artist: normalizedArtist,
			append: false,
			preserveProfile: true
		});
	}, [activeContributor, loadCreatorProfile, profileArtistFilter]);

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

	const handleSaveDecoration = useCallback(async (decoration) => {
		if (!activeContributor?.userHash) return;
		setDecorationPending(true);
		try {
			const result = await Utils.saveOwnCreatorDecoration(decoration);
			Utils.setCachedDiscordSupportTier(activeContributor.userHash, result.tier);
			setSupportByUserHash((current) => ({
				...current,
				[activeContributor.userHash]: { tier: result.tier, decoration: result.decoration }
			}));
			Toast.success(copy.decorationSaved);
		} catch (error) {
			const message = error?.code === "monthly_supporter_required"
				? copy.monthlyOnlyGradient
				: error?.code === "supporter_required"
					? copy.supportRoleNotFound
					: copy.decorationSaveFailed;
			Toast.error(message);
		} finally {
			setDecorationPending(false);
		}
	}, [activeContributor, copy.decorationSaveFailed, copy.decorationSaved]);

	const handleResetDecoration = useCallback(async () => {
		if (!activeContributor?.userHash) return;
		setDecorationPending(true);
		try {
			await Utils.resetOwnCreatorDecoration();
			setSupportByUserHash((current) => ({
				...current,
				[activeContributor.userHash]: {
					tier: current[activeContributor.userHash]?.tier || "none",
					decoration: null
				}
			}));
			Toast.success(copy.decorationReset);
		} catch (error) {
			Toast.error(error?.message || copy.decorationSaveFailed);
		} finally {
			setDecorationPending(false);
		}
	}, [activeContributor, copy.decorationReset, copy.decorationSaveFailed]);

	const handleRefreshSupport = useCallback(async () => {
		if (!activeContributor?.userHash) return;
		setDecorationPending(true);
		try {
			const tier = await Utils.fetchDiscordSupportTier(activeContributor.userHash, { forceRefresh: true });
			setSupportByUserHash((current) => ({
				...current,
				[activeContributor.userHash]: {
					tier,
					decoration: current[activeContributor.userHash]?.decoration || null
				}
			}));
		} catch (error) {
			Toast.error(copy.supportRoleRefreshFailed);
		} finally {
			setDecorationPending(false);
		}
	}, [activeContributor, copy.supportRoleRefreshFailed]);

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
						const supportInfo = contributor.userHash ? supportByUserHash[contributor.userHash] : null;
							const decorationStyle = getCreatorDecorationStyle(supportInfo?.tier, supportInfo?.decoration);
							const decorationClass = decorationStyle
								? ` is-supporter${supportInfo?.tier === "monthly" ? " is-monthly" : ""}${supportInfo?.decoration?.mode === "gradient" && supportInfo?.tier === "monthly" ? " is-gradient" : ""}`
								: "";
							const node = contributor.profileAvailable
								? react.createElement(
									"button",
									{
										type: "button",
										key: contributor.key,
										className: `lyrics-credit-footer-link${decorationClass}`,
										style: decorationStyle || undefined,
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
										className: `lyrics-credit-footer-name${decorationClass}`,
										style: decorationStyle || undefined
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

	const modalContributor = creatorProfile && !profileLoading && !profileError
		? activeContributor
		: {
			key: "unverified-creator",
			userHash: null,
			name: copy.anonymous,
			avatarUrl: null,
			linked: false,
			profileAvailable: false,
			anonymous: true,
			isPrivate: true
		};
	const modal = activeContributor
		? react.createElement(SyncCreatorProfileModal, {
			contributor: modalContributor,
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
			activeArtistFilter: profileArtistFilter,
			onArtistFilterChange: handleArtistFilterChange,
			supportInfo: activeContributor?.userHash ? supportByUserHash[activeContributor.userHash] : null,
			decorationPending,
			onSaveDecoration: handleSaveDecoration,
			onResetDecoration: handleResetDecoration,
			onRefreshSupport: handleRefreshSupport
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
		// Pronunciation is carried in explicit fields by the presentation pipeline.
		// Do not infer it from `text`: provider lines commonly keep the original in
		// both `text` and `originalText`, and small normalization differences can
		// otherwise duplicate the original in the pronunciation row.
		const karaokePhoneticText = line?.phoneticText
			|| line?.phonetic;
		const karaokeTranslationText = line?.translationText || line?.translation || text2;
		mainText = line; // Keep as object for KaraokeLine component
		subText = karaokePhoneticText ? safeRenderText(karaokePhoneticText) : null;
		subText2 = safeRenderText(karaokeTranslationText);
	} else {
		// Default: show original text
		// originalText is the actual original lyric, while `text` and `text2`
		// are typed pronunciation and translation supplements respectively.

		if (showTranslatedBelow) {
			// Show original as main, translations below
			// Apply furigana to original text if enabled
			const processedOriginalText = safeRenderText(originalText);
			mainText = typeof processedOriginalText === 'string' ?
				Utils.applyFuriganaIfEnabled(processedOriginalText) : processedOriginalText;
			subText = text ? safeRenderText(text) : null;
			subText2 = text2 ? safeRenderText(text2) : null;
		} else if (replaceOriginal && (text || text2)) {
			// Preserve the legacy replacement order (pronunciation first when both
			// exist), but allow a translation-only result to replace the original.
			// A translation must never be placed in the pronunciation row merely
			// because its paired pronunciation is empty.
			mainText = safeRenderText(text || text2);
			subText = text && text2 ? safeRenderText(text2) : null;
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

const getFirstTrimmedString = (...values) => {
	for (const value of values) {
		if (typeof value !== "string") continue;
		const trimmed = value.trim();
		if (trimmed) return trimmed;
	}
	return "";
};

const getEmbeddedAuxiliaryDisplayValues = (line) => {
	const phoneticText = getFirstTrimmedString(
		line?.phoneticText,
		line?.phonetic,
		line?.pronunciationText,
		line?.pronText
	);
	const translationText = getFirstTrimmedString(
		line?.translationText,
		line?.translation,
		line?.transText
	);
	const displayTranslationText = typeof line?.text2 === "string" && line.text2.trim()
		? line.text2.trim()
		: translationText;
	if (!phoneticText && !translationText) {
		const hasExplicitOriginalText = line?.originalText !== null && line?.originalText !== undefined;
		return {
			// A raw provider may supply both fields with the same original lyric.
			// Generic `text` is not a typed pronunciation value, so never promote it
			// into the pronunciation slot when no explicit supplement exists.
			text: null,
			originalText: hasExplicitOriginalText ? line?.originalText : line?.text,
			text2: line?.text2,
		};
	}

	return {
		// Keep the two semantic slots independent. Promoting a translation into
		// `text` makes the shared line renderer display it as pronunciation.
		text: phoneticText || null,
		originalText: line?.originalText || line?.text || "",
		text2: displayTranslationText || null,
	};
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
// setState. Karaoke fill and active-line calculations consume `position`, so
// updates beyond the configured display rate only create redundant React work.
const DEFAULT_TRACK_POSITION_FPS = 60;
const MIN_TRACK_POSITION_FPS = 10;
const MAX_TRACK_POSITION_FPS = 240;

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
	const manualScrollIntentUntilRef = useRef(0);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		let scrollbarPointerId = null;

		const extendManualScroll = () => {
			cancelSyncedLyricsScrollAnimation(container);
			setIsScrolling(true);
			if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
			scrollTimeout.current = setTimeout(() => {
				setIsScrolling(false);
			}, 3000);
		};
		const markManualScrollIntent = () => {
			manualScrollIntentUntilRef.current = Date.now() + 500;
		};
		const handleWheel = () => {
			markManualScrollIntent();
			extendManualScroll();
		};
		const handleScroll = () => {
			if (scrollbarPointerId !== null || Date.now() <= manualScrollIntentUntilRef.current) extendManualScroll();
		};
		const handlePointerDown = (event) => {
			if (event.target !== container) return;
			const rect = container.getBoundingClientRect();
			const x = event.clientX - rect.left;
			const y = event.clientY - rect.top;
			const verticalGutterWidth = Math.max(0, container.offsetWidth - container.clientWidth);
			const horizontalGutterHeight = Math.max(0, container.offsetHeight - container.clientHeight);
			const isInVerticalScrollbar = verticalGutterWidth > 0 && (
				x < verticalGutterWidth || x >= container.clientWidth
			);
			const isInHorizontalScrollbar = horizontalGutterHeight > 0 && y >= container.clientHeight;
			if (isInVerticalScrollbar || isInHorizontalScrollbar) {
				scrollbarPointerId = event.pointerId;
				markManualScrollIntent();
			}
		};
		const handlePointerRelease = (event) => {
			if (scrollbarPointerId === null || event.pointerId !== scrollbarPointerId) return;
			scrollbarPointerId = null;
			manualScrollIntentUntilRef.current = 0;
			extendManualScroll();
		};
		const handleKeyDown = (event) => {
			if (!["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ", "Spacebar"].includes(event.key)) return;
			if (event.defaultPrevented) return;
			const interactiveTarget = event.target?.closest?.(
				'button, a[href], input, select, textarea, [role="button"], [contenteditable="true"]'
			);
			if (interactiveTarget && interactiveTarget !== container) return;
			markManualScrollIntent();
			extendManualScroll();
		};

		container.addEventListener("wheel", handleWheel, { passive: true });
		container.addEventListener("touchmove", handleWheel, { passive: true });
		container.addEventListener("scroll", handleScroll, { passive: true });
		container.addEventListener("pointerdown", handlePointerDown, { passive: true });
		container.addEventListener("keydown", handleKeyDown);
		window.addEventListener("pointerup", handlePointerRelease, { passive: true });
		window.addEventListener("pointercancel", handlePointerRelease, { passive: true });

		return () => {
			container.removeEventListener("wheel", handleWheel);
			container.removeEventListener("touchmove", handleWheel);
			container.removeEventListener("scroll", handleScroll);
			container.removeEventListener("pointerdown", handlePointerDown);
			container.removeEventListener("keydown", handleKeyDown);
			window.removeEventListener("pointerup", handlePointerRelease);
			window.removeEventListener("pointercancel", handlePointerRelease);
			cancelSyncedLyricsScrollAnimation(container);
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

const normalizeDisplayedCulturalAnnotations = (value) => {
	const values = Array.isArray(value) ? value : value ? [value] : [];
	return values
		.map((annotation, index) => {
			if (typeof annotation === "string") {
				const note = annotation.trim();
				return note ? { marker: index + 1, expression: "", note } : null;
			}

			const marker = Number(annotation?.marker);
			const expression = String(annotation?.expression || "").trim();
			const note = String(annotation?.note || "").trim();
			if (!Number.isInteger(marker) || marker < 1 || !note) return null;
			return { marker, expression, note };
		})
		.filter(Boolean)
		.sort((a, b) => a.marker - b.marker);
};

const getRubySourceText = (value) => String(value || "")
	.replace(/<rt>[\s\S]*?<\/rt>/gi, "")
	.replace(/<rp>[\s\S]*?<\/rp>/gi, "")
	.replace(/<\/?ruby>/gi, "");

const getCulturalMarkerHTML = (marker) =>
	`<sup class="lyrics-cultural-marker">[${marker}]</sup>`;

const getCulturalMarkerRawOffset = (text, annotation) => {
	const expression = annotation?.expression;
	const sourceText = getRubySourceText(text);
	const expressionStart = expression ? sourceText.indexOf(expression) : -1;
	if (expressionStart < 0) return text.length;

	const sourceEnd = expressionStart + expression.length;
	let sourceOffset = 0;
	let rawOffset = text.length;
	let skipUntil = "";
	for (let index = 0; index < text.length; index += 1) {
		const remaining = text.slice(index).toLowerCase();
		if (skipUntil) {
			const closingIndex = remaining.indexOf(skipUntil);
			if (closingIndex < 0) break;
			index += closingIndex + skipUntil.length - 1;
			skipUntil = "";
			continue;
		}
		if (remaining.startsWith("<rt>")) {
			skipUntil = "</rt>";
			index += 3;
			continue;
		}
		if (remaining.startsWith("<rp>")) {
			skipUntil = "</rp>";
			index += 3;
			continue;
		}
		if (text[index] === "<") {
			const tagEnd = text.indexOf(">", index);
			if (tagEnd >= 0) {
				index = tagEnd;
				continue;
			}
		}

		sourceOffset += 1;
		if (sourceOffset === sourceEnd) {
			rawOffset = index + 1;
			break;
		}
	}

	const openRubyIndex = text.lastIndexOf("<ruby>", rawOffset);
	const closedRubyIndex = text.lastIndexOf("</ruby>", rawOffset);
	if (openRubyIndex > closedRubyIndex) {
		const rubyEnd = text.indexOf("</ruby>", rawOffset);
		if (rubyEnd >= 0) rawOffset = rubyEnd + "</ruby>".length;
	}
	return rawOffset;
};

const renderAnnotatedLyricHTML = (text, annotations = []) => {
	const normalizedText = String(text || "");
	if (!Array.isArray(annotations) || annotations.length === 0) {
		return Utils.rubyTextToHTML(normalizedText);
	}

	const markerInsertions = annotations
		.map((annotation) => ({
			annotation,
			rawOffset: getCulturalMarkerRawOffset(normalizedText, annotation),
			token: `\uE000iv-cultural-${annotation.marker}\uE001`,
		}))
		.sort((a, b) => b.rawOffset - a.rawOffset || b.annotation.marker - a.annotation.marker);
	let markedText = normalizedText;
	for (const insertion of markerInsertions) {
		markedText =
			`${markedText.slice(0, insertion.rawOffset)}` +
			`${insertion.token}${markedText.slice(insertion.rawOffset)}`;
	}

	let html = Utils.rubyTextToHTML(markedText);
	for (const insertion of markerInsertions) {
		html = html.replace(
			insertion.token,
			getCulturalMarkerHTML(insertion.annotation.marker)
		);
	}
	return html;
};

const renderLyricSubLine = (
	className,
	text,
	onContextMenu = null,
	singleLineScroll = false,
	culturalAnnotations = [],
	key = null
) => {
	if (!text) return null;
	const props = {
		className: `${className}${singleLineScroll ? " ivlyrics-vinyl-lyric-scroll-viewport" : ""}`,
		style: { "--sub-lyric-color": CONFIG.visual["inactive-color"] },
	};
	if (key) props.key = key;
	if (onContextMenu) {
		props.onContextMenu = onContextMenu;
	}

	if (typeof text === "string" && text) {
		const html = renderAnnotatedLyricHTML(text, culturalAnnotations);
		if (!singleLineScroll) {
			props.dangerouslySetInnerHTML = { __html: html };
			return react.createElement("p", props);
		}

		return react.createElement(
			"p",
			props,
			react.createElement("span", {
				className: "ivlyrics-vinyl-lyric-scroll-content",
				dangerouslySetInnerHTML: { __html: html },
			})
		);
	}

	const renderedText = safeRenderText(text);
	return react.createElement(
		"p",
		props,
		singleLineScroll
			? react.createElement(
				"span",
				{ className: "ivlyrics-vinyl-lyric-scroll-content" },
				renderedText
			)
			: renderedText
	);
};

const renderLyricMainContent = ({
  isKara = false,
  karaokeRenderGranularity = null,
  mainText,
  line,
  position,
	isActive,
	isEffectFocused = isActive,
	isEffectLive = isActive || isEffectFocused,
	settingsRevision = 0,
	globalCharOffset = 0,
  activeGlobalCharIndex = -1,
  subText = null,
  subText2 = null,
  culturalAnnotations = [],
}) => {
	if (isKara) {
          return react.createElement(KaraokeLine, {
                  line,
			// Future rows are already pinned to 0 by the playback window. Completed
			// rows receive one stable position past their final glyph so the painted
			// progress remains visible without returning to the per-frame update path.
			position,
			isActive,
			isEffectFocused,
			isEffectLive,
			settingsRevision,
			globalCharOffset,
                  activeGlobalCharIndex,
                  phonetic: subText,
                  translation: subText2,
                  culturalAnnotations,
                  renderGranularity: karaokeRenderGranularity,
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
		hasSubLine: !!subText || !!subText2 || !!line?.culturalNote,
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
const INTERLUDE_NOTE_CHARACTER_REGEX = /[\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]/u;
const INTERLUDE_MARKER_REGEX = /^[\s\u00A0\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFE0E\uFE0F\uFEFF\u2669-\u266F\u{1D100}-\u{1D1FF}\u{1F3B5}-\u{1F3BC}]+$/u;
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
			"--break-label-outline-shadow": createOutsideTextOutlineShadow(
				getLabelNumber("instrumental-break-label-outline-width", 0, 0, 10),
				CONFIG?.visual?.["instrumental-break-label-outline-color"]
			),
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
		const originalText = getPlainLyricText(line.originalText);
		if (originalText.trim()) {
			return originalText;
		}
	}

	if (line.text !== undefined) {
		return getPlainLyricText(line.text);
	}

	return getPlainLyricText(line);
};

const isInterludeMarkerText = (text) => {
	if (window.ivLyricsInstrumentalBreaks?.isMarkerText?.(text)) {
		return true;
	}

	const normalized = String(text ?? "")
		.replace(/&nbsp;/gi, " ")
		.replace(/<[^>]+>/g, "")
		.trim();

	return !normalized || INTERLUDE_MARKER_REGEX.test(normalized);
};

const isMusicNoteInterludeMarkerText = (text) => {
	if (window.ivLyricsInstrumentalBreaks?.isMarkerText?.(text)) {
		return true;
	}

	const normalized = String(text ?? "")
		.replace(/&nbsp;/gi, " ")
		.replace(/<[^>]+>/g, "")
		.trim();

	return INTERLUDE_NOTE_CHARACTER_REGEX.test(normalized)
		&& INTERLUDE_MARKER_REGEX.test(normalized);
};

const toFiniteTime = (value) => {
	const numeric = Number(value);
	return Number.isFinite(numeric) ? numeric : null;
};

const getFiniteLyricsStyleNumber = (value, fallback) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallback;
};

// Build a crisp outline from copies of the completed glyph silhouette. Unlike
// -webkit-text-stroke, these layers sit behind the fill and never consume the
// inside of thin glyphs. Multiple rings keep large configured widths solid.
const createOutsideTextOutlineShadow = (widthValue, colorValue = "#000000") => {
	const width = Math.max(0, Math.min(10, Number(widthValue) || 0));
	if (width <= 0) return "0 0 0 transparent";

	const color = String(colorValue || "#000000");
	const ringCount = Math.max(1, Math.min(4, Math.ceil(width * 2)));
	const directionCount = width <= 0.5 ? 8 : width <= 1 ? 12 : 16;
	const layers = [];
	const formatOffset = (value) => {
		const rounded = Math.abs(value) < 0.0005 ? 0 : value;
		return `${rounded.toFixed(3)}px`;
	};

	for (let ring = 1; ring <= ringCount; ring += 1) {
		const radius = width * (ring / ringCount);
		for (let direction = 0; direction < directionCount; direction += 1) {
			const angle = (Math.PI * 2 * direction) / directionCount;
			layers.push(
				`${formatOffset(Math.cos(angle) * radius)} ${formatOffset(Math.sin(angle) * radius)} 0 ${color}`
			);
		}
	}

	return layers.join(", ");
};

// A full-density outline becomes visually much heavier after the surrounding
// lyric line is blurred. Keep the configured geometry but render a sparse,
// low-opacity variant so its width still tracks the setting without flooding
// the glyph interior.
const getBlurredLineOutlineWidth = (widthValue) => Math.min(
	10,
	Math.max(0, Number(widthValue) || 0)
);

const createBlurredLineOutlineShadow = (widthValue, colorValue = "#000000") => {
	const width = getBlurredLineOutlineWidth(widthValue);
	if (width <= 0) return "0 0 0 transparent";

	const color = String(colorValue || "#000000");
	const hexMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(color);
	const mutedColor = hexMatch
		? `rgba(${parseInt(hexMatch[1], 16)}, ${parseInt(hexMatch[2], 16)}, ${parseInt(hexMatch[3], 16)}, 0.03)`
		: `color-mix(in srgb, ${color} 3%, transparent)`;
	const formatOffset = (value) => `${(Math.abs(value) < 0.0005 ? 0 : value).toFixed(3)}px`;

	return Array.from({ length: 16 }, (_, direction) => direction)
		.map((direction) => {
			const angle = (Math.PI * 2 * direction) / 16;
			return `${formatOffset(Math.cos(angle) * width)} ${formatOffset(Math.sin(angle) * width)} 0 ${mutedColor}`;
		})
		.join(", ");
};

// Keep the settings preview and the playback renderer on one typography contract.
// Container geometry and playback transforms stay local to each surface, but every
// glyph, ruby and auxiliary-line metric comes from this shared variable set.
const getLyricsTypographyStyleVariables = (visual = CONFIG?.visual || {}) => {
	const alignment = ["left", "center", "right"].includes(visual.alignment)
		? visual.alignment
		: "center";
	const culturalNoteMargins = alignment === "left"
		? { left: "0", right: "auto" }
		: alignment === "right"
			? { left: "auto", right: "0" }
			: { left: "auto", right: "auto" };
	const baseFontFamily = visual["font-family"] || "var(--font-family)";
	const shadowColor = visual["text-shadow-color"] || "#000000";
	const shadowOpacity = getFiniteLyricsStyleNumber(visual["text-shadow-opacity"], 50);
	const shadowBlur = getFiniteLyricsStyleNumber(visual["text-shadow-blur"], 2);
	const colorMatch = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(shadowColor);
	const resolvedShadowColor = colorMatch
		? `rgba(${parseInt(colorMatch[1], 16)}, ${parseInt(colorMatch[2], 16)}, ${parseInt(colorMatch[3], 16)}, ${shadowOpacity / 100})`
		: shadowColor;
	const textShadow = visual["text-shadow-enabled"]
		? `0 0 ${shadowBlur}px ${resolvedShadowColor}`
		: "0 0 0 transparent";

	return {
		"--lyrics-align-text": alignment,
		"--lyrics-font-size": `${getFiniteLyricsStyleNumber(visual["font-size"], 32)}px`,
		"--lyrics-font-family": baseFontFamily,
		"--lyrics-original-font-family": visual["original-font-family"] || baseFontFamily,
		"--lyrics-original-font-size": `${getFiniteLyricsStyleNumber(visual["original-font-size"], 44)}px`,
		"--lyrics-original-font-weight": getFiniteLyricsStyleNumber(visual["original-font-weight"], 600),
		"--lyrics-original-opacity": getFiniteLyricsStyleNumber(visual["original-opacity"], 95) / 100,
		"--lyrics-original-letter-spacing": `${getFiniteLyricsStyleNumber(visual["original-letter-spacing"], 0)}px`,
		"--lyrics-original-outline-shadow": createOutsideTextOutlineShadow(
			visual["original-outline-width"],
			visual["original-outline-color"]
		),
		"--lyrics-original-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["original-outline-width"],
			visual["original-outline-color"]
		),
		"--lyrics-original-outline-stroke-width": `${getFiniteLyricsStyleNumber(visual["original-outline-width"], 0) * 2}px`,
		"--lyrics-original-outline-blurred-stroke-width": `${getBlurredLineOutlineWidth(visual["original-outline-width"]) * 2}px`,
		"--lyrics-original-outline-blurred-stroke-color": `color-mix(in srgb, ${visual["original-outline-color"] || "#000000"} 8%, transparent)`,
		"--lyrics-original-outline-stroke-color": visual["original-outline-color"] || "#000000",
		"--lyrics-phonetic-font-family": visual["phonetic-font-family"] || baseFontFamily,
		"--lyrics-phonetic-font-size": `${getFiniteLyricsStyleNumber(visual["phonetic-font-size"], 16)}px`,
		"--lyrics-phonetic-font-weight": getFiniteLyricsStyleNumber(visual["phonetic-font-weight"], 100),
		"--lyrics-phonetic-opacity": getFiniteLyricsStyleNumber(visual["phonetic-opacity"], 70) / 100,
		"--lyrics-phonetic-spacing": `${getFiniteLyricsStyleNumber(visual["phonetic-spacing"], -1)}px`,
		"--lyrics-phonetic-letter-spacing": `${getFiniteLyricsStyleNumber(visual["phonetic-letter-spacing"], 0)}px`,
		"--lyrics-phonetic-outline-shadow": createOutsideTextOutlineShadow(
			visual["phonetic-outline-width"],
			visual["phonetic-outline-color"]
		),
		"--lyrics-phonetic-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["phonetic-outline-width"],
			visual["phonetic-outline-color"]
		),
		"--lyrics-translation-font-family": visual["translation-font-family"] || baseFontFamily,
		"--lyrics-translation-font-size": `${getFiniteLyricsStyleNumber(visual["translation-font-size"], 22)}px`,
		"--lyrics-translation-font-weight": getFiniteLyricsStyleNumber(visual["translation-font-weight"], 300),
		"--lyrics-translation-opacity": getFiniteLyricsStyleNumber(visual["translation-opacity"], 85) / 100,
		"--lyrics-translation-spacing": `${getFiniteLyricsStyleNumber(visual["translation-spacing"], 0)}px`,
		"--lyrics-translation-letter-spacing": `${getFiniteLyricsStyleNumber(visual["translation-letter-spacing"], 0)}px`,
		"--lyrics-translation-outline-shadow": createOutsideTextOutlineShadow(
			visual["translation-outline-width"],
			visual["translation-outline-color"]
		),
		"--lyrics-translation-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["translation-outline-width"],
			visual["translation-outline-color"]
		),
		"--lyrics-cultural-note-font-family": visual["cultural-annotations-font-family"] || visual["translation-font-family"] || baseFontFamily,
		"--lyrics-cultural-note-font-size": `${getFiniteLyricsStyleNumber(visual["cultural-annotations-font-size"], 14)}px`,
		"--lyrics-cultural-note-font-weight": getFiniteLyricsStyleNumber(visual["cultural-annotations-font-weight"], 300),
		"--lyrics-cultural-note-opacity": getFiniteLyricsStyleNumber(visual["cultural-annotations-opacity"], 60) / 100,
		"--lyrics-cultural-note-outline-shadow": createOutsideTextOutlineShadow(
			visual["cultural-annotations-outline-width"],
			visual["cultural-annotations-outline-color"]
		),
		"--lyrics-cultural-note-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["cultural-annotations-outline-width"],
			visual["cultural-annotations-outline-color"]
		),
		"--lyrics-cultural-note-margin-left": culturalNoteMargins.left,
		"--lyrics-cultural-note-margin-right": culturalNoteMargins.right,
		"--lyrics-furigana-font-size": `${getFiniteLyricsStyleNumber(visual["furigana-font-size"], 14)}px`,
		"--lyrics-furigana-font-weight": getFiniteLyricsStyleNumber(visual["furigana-font-weight"], 300),
		"--lyrics-furigana-opacity": getFiniteLyricsStyleNumber(visual["furigana-opacity"], 80) / 100,
		"--lyrics-furigana-spacing": `${getFiniteLyricsStyleNumber(visual["furigana-spacing"], 2)}px`,
		"--lyrics-furigana-outline-shadow": createOutsideTextOutlineShadow(
			visual["furigana-outline-width"],
			visual["furigana-outline-color"]
		),
		"--lyrics-furigana-outline-blurred-shadow": createBlurredLineOutlineShadow(
			visual["furigana-outline-width"],
			visual["furigana-outline-color"]
		),
		"--lyrics-line-spacing": `${getFiniteLyricsStyleNumber(visual["line-spacing"], 8)}px`,
		"--fullscreen-title-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-title-outline-width"],
			visual["fullscreen-title-outline-color"]
		),
		"--fullscreen-artist-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-artist-outline-width"],
			visual["fullscreen-artist-outline-color"]
		),
		"--fullscreen-clock-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-clock-outline-width"],
			visual["fullscreen-clock-outline-color"]
		),
		"--fullscreen-tmi-outline-shadow": createOutsideTextOutlineShadow(
			visual["fullscreen-tmi-outline-width"],
			visual["fullscreen-tmi-outline-color"]
		),
		"--lyrics-text-shadow": textShadow,
		"--lyrics-text-drop-shadow": visual["text-shadow-enabled"]
			? `drop-shadow(0 0 ${shadowBlur}px ${resolvedShadowColor})`
			: "none",
	};
};

const getCurrentTrackDurationMs = () => {
	if (typeof Spicetify === "undefined") {
		return null;
	}

	return toFiniteTime(
		Spicetify.Player?.data?.item?.duration?.milliseconds
		?? Spicetify.Player?.data?.item?.metadata?.duration
	);
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

const PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT = Symbol.for("ivLyrics.speakerColors.classNameContract");

const normalizeKaraokeSpeakerClass = (speaker, speakerColor = "", speakerFallback = "") => {
	const helper = window.ivLyricsSpeakerColors;
	const contract = helper?.[PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT];
	const hasReferenceInput = (speaker !== null && (typeof speaker === "object" || typeof speaker === "function"))
		|| (speakerColor !== null && (typeof speakerColor === "object" || typeof speakerColor === "function"))
		|| (speakerFallback !== null && (typeof speakerFallback === "object" || typeof speakerFallback === "function"));
	if (!hasReferenceInput
		&& contract?.getPresentation === helper?.getPresentation
		&& typeof contract?.getClassName === "function") {
		return contract.getClassName(speaker, speakerFallback);
	}
	return getKaraokeSpeakerPresentation(speaker, speakerColor, speakerFallback).speakerClass;
};

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

const areKaraokeTextEffectsEnabled = () => (
	CONFIG?.visual?.["karaoke-text-effects"] !== false && !prefersReducedLyricsMotion()
);

const getKaraokeKindClassParts = (kind) => {
	const kindClass = String(kind || "").trim().toLowerCase();
	if (!kindClass || (kindClass !== "vocal" && !KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(kindClass))) {
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
	const hasInlineEffects = Array.isArray(line?.syllables)
		&& line.syllables.some(syllable => (
			syllable?.inlineStyle === true
			&& KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(String(syllable?.styleKind || "").trim().toLowerCase())
		));
	if (line?.kind && !hasInlineEffects) classes.push(...getKaraokeKindClassParts(line.kind));
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

const KARAOKE_COMBINING_MARK_REGEX = /\p{M}/u;
const KARAOKE_VARIATION_OR_MODIFIER_REGEX = /[\uFE00-\uFE0F\u{1F3FB}-\u{1F3FF}\u{E0100}-\u{E01EF}]/u;

const splitKaraokeGraphemes = (value, locale = "auto") => {
	const text = String(value || "");
	if (!text) return [];

	if (window.LyricsWordSegmenter?.segmentGraphemes) {
		try {
			return window.LyricsWordSegmenter.segmentGraphemes(text, locale);
		} catch (error) {
			console.warn("[ivLyrics] Shared grapheme segmenter failed; using local fallback", error);
		}
	}

	if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
		try {
			const requestedLocale = locale && locale !== "auto" ? locale : undefined;
			return Array.from(
				new Intl.Segmenter(requestedLocale, { granularity: "grapheme" }).segment(text),
				(segment) => segment.segment
			);
		} catch (error) {
			console.warn("[ivLyrics] Intl grapheme segmentation failed; using Unicode fallback", error);
		}
	}

	const clusters = [];
	for (const codePoint of Array.from(text)) {
		const previous = clusters[clusters.length - 1] || "";
		const joinsPrevious = clusters.length > 0 && (
			KARAOKE_COMBINING_MARK_REGEX.test(codePoint)
			|| KARAOKE_VARIATION_OR_MODIFIER_REGEX.test(codePoint)
			|| codePoint === "\u200D"
			|| previous.endsWith("\u200D")
		);
		if (joinsPrevious) {
			clusters[clusters.length - 1] += codePoint;
		} else {
			clusters.push(codePoint);
		}
	}
	return clusters;
};

const coalesceKaraokeTimedGraphemes = (timedChars, locale = "auto") => {
	if (!Array.isArray(timedChars) || timedChars.length === 0) return [];

	const text = timedChars.map((charInfo) => String(charInfo?.char || "")).join("");
	const graphemes = splitKaraokeGraphemes(text, locale);
	if (graphemes.length === timedChars.length
		&& graphemes.every((grapheme, index) => grapheme === String(timedChars[index]?.char || ""))) {
		return timedChars;
	}

	const sourceRanges = [];
	let sourceOffset = 0;
	timedChars.forEach((charInfo) => {
		const char = String(charInfo?.char || "");
		sourceRanges.push({
			charInfo,
			start: sourceOffset,
			end: sourceOffset + char.length,
		});
		sourceOffset += char.length;
	});

	let graphemeOffset = 0;
	let sourceIndex = 0;
	return graphemes.map((grapheme) => {
		const graphemeStart = graphemeOffset;
		const graphemeEnd = graphemeStart + grapheme.length;
		graphemeOffset = graphemeEnd;

		while (sourceIndex < sourceRanges.length && sourceRanges[sourceIndex].end <= graphemeStart) {
			sourceIndex += 1;
		}
		const contributors = [];
		for (let index = sourceIndex; index < sourceRanges.length; index += 1) {
			const range = sourceRanges[index];
			if (range.start >= graphemeEnd) break;
			if (range.end > graphemeStart) contributors.push(range.charInfo);
		}

		const first = contributors[0] || {};
		const startTimes = contributors
			.map((charInfo) => charInfo?.startTime)
			.filter(Number.isFinite);
		const endTimes = contributors
			.map((charInfo) => charInfo?.endTime)
			.filter(Number.isFinite);
		return {
			...first,
			char: grapheme,
			startTime: startTimes.length > 0 ? Math.min(...startTimes) : (first.startTime || 0),
			endTime: endTimes.length > 0 ? Math.max(...endTimes) : (first.endTime || first.startTime || 0),
		};
	});
};

const getKaraokeSyllableCharCount = (syllables) => (
	Array.isArray(syllables)
		? splitKaraokeGraphemes(syllables.map((syllable) => syllable?.text || "").join("")).length
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
	const markerText = getInterludeCandidateText(line);
	if (startTime === null || !isInterludeMarkerText(markerText)) {
		return { isInterlude: false, durationMs: 0 };
	}

	const directEndTime = toFiniteTime(line?.endTime);
	const nextStartTime = toFiniteTime(nextLine?.startTime);
	const trackEndTime = lineIndex === Math.max(0, lineCount - 1) ? getCurrentTrackDurationMs() : null;
	const endTime = nextStartTime !== null && nextStartTime > startTime
		? nextStartTime
		: (directEndTime !== null && directEndTime > startTime
			? directEndTime
			: (trackEndTime !== null && trackEndTime > startTime ? trackEndTime : null));
	const durationMs = endTime !== null ? endTime - startTime : 0;
	const minimumDurationMs = isMusicNoteInterludeMarkerText(markerText)
		? 0
		: INTERLUDE_MIN_DURATION_MS;

	return {
		isInterlude: durationMs > minimumDurationMs,
		durationMs,
		kind: getInstrumentalBreakKind(lineIndex, lineCount),
	};
};

const getTrailingKaraokeInterludeInfo = (line, nextLine = null, lineIndex = -1, lineCount = 0) => {
	if (!isAutoInstrumentalBreakEnabled()) {
		return { isInterlude: false, durationMs: 0, source: "karaoke-trailing-gap" };
	}

	const nextStartTime = toFiniteTime(nextLine?.startTime);
	if (
		nextStartTime !== null
		&& isInterludeMarkerText(getInterludeCandidateText(nextLine))
	) {
		return { isInterlude: false, durationMs: 0, source: "karaoke-trailing-gap" };
	}

	const fillEndTime = getKaraokeLineFillEndTime(line);
	const startTime = fillEndTime !== null ? fillEndTime + KARAOKE_TRAILING_INTERLUDE_DELAY_MS : null;
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

const isTrailingKaraokeInterludePositionActive = (interludeInfo, position) => {
	if (position < interludeInfo.startTime) {
		return false;
	}

	// A postlude has no following lyric line to take over. Spotify can report a
	// position equal to or slightly beyond the track duration while handing off
	// to the next song, so keep an already-reached outro marker visible until the
	// new track resets the playback position.
	return interludeInfo.kind === "postlude" || position < interludeInfo.endTime;
};

const createActiveTrailingKaraokeInterludeLine = ({
	line,
	nextLine = null,
	lineIndex = -1,
	lineCount = 0,
	position = 0,
	isActiveLine = false,
	isKara = false,
	activationAdvanceMs = 0,
}) => {
	if (!isKara || !isActiveLine || line?.interludeInfo?.isInterlude) {
		return null;
	}

	const interludeInfo = getTrailingKaraokeInterludeInfo(line, nextLine, lineIndex, lineCount);
	const previewStartTime = interludeInfo.startTime !== null
		? interludeInfo.startTime - Math.max(0, activationAdvanceMs)
		: null;
	if (
		!interludeInfo.isInterlude ||
		interludeInfo.startTime === null ||
		interludeInfo.endTime === null ||
		previewStartTime === null ||
		position < previewStartTime ||
		(interludeInfo.kind !== "postlude" && position >= interludeInfo.endTime)
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
		isPrecentered: !isTrailingKaraokeInterludePositionActive(interludeInfo, position),
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

const LYRICS_CENTERING_DURATION_MS = 300;
const LYRICS_CENTERING_LEAD_MS = LYRICS_CENTERING_DURATION_MS;
const LYRICS_CENTERING_STAGGER_MS = 28;
const LYRICS_CENTERING_MAX_STAGGER_MS = 112;
const LYRICS_CENTERING_SETTLE_RESERVE_MS = 24;
const LYRICS_CENTERING_MIN_TOTAL_MS = 80;
const LYRICS_CENTERING_BEZIER = [0.42, 0, 0.58, 1];
const LYRICS_CENTERING_EASING_CSS = "cubic-bezier(0.42, 0, 0.58, 1)";
const KARAOKE_RELEASE_WINDOW_MS = 820;
const KARAOKE_COMPLETION_POSITION_OFFSET_MS = 900;
const syncedLyricsScrollAnimations = new WeakMap();

const getTransformTranslateY = (transform) => {
	if (!transform || transform === "none") return 0;

	try {
		if (typeof DOMMatrixReadOnly === "function") {
			return new DOMMatrixReadOnly(transform).m42;
		}
	} catch (_) {
		// Fall through to the matrix parser below.
	}

	const matrixMatch = String(transform).match(/^matrix\(([^)]+)\)$/);
	if (!matrixMatch) return null;
	const values = matrixMatch[1].split(",").map(Number);
	return Number.isFinite(values[5]) ? values[5] : null;
};

const offsetTransformVertically = (transform, offsetY) => {
	if (!Number.isFinite(offsetY) || Math.abs(offsetY) < 0.01) {
		return transform;
	}

	try {
		if (typeof DOMMatrix === "function") {
			const matrix = new DOMMatrix(transform && transform !== "none" ? transform : undefined);
			matrix.m42 += offsetY;
			return matrix.toString();
		}
	} catch (_) {
		// A translate prefix is safe here because lyric rows only use vertical transforms.
	}

	return `translateY(${offsetY}px)${transform && transform !== "none" ? ` ${transform}` : ""}`;
};

const getMedian = (values) => {
	if (!Array.isArray(values) || values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 0
		? (sorted[middle - 1] + sorted[middle]) / 2
		: sorted[middle];
};

const getAdaptiveLyricsCenteringTiming = (transitionWindowMs) => {
	const defaultTotalMs = LYRICS_CENTERING_DURATION_MS + LYRICS_CENTERING_MAX_STAGGER_MS;
	if (!Number.isFinite(transitionWindowMs) || transitionWindowMs <= 0) {
		return {
			durationMs: LYRICS_CENTERING_DURATION_MS,
			staggerMs: LYRICS_CENTERING_STAGGER_MS,
			maxStaggerMs: LYRICS_CENTERING_MAX_STAGGER_MS,
		};
	}

	// A rapid vocal stack can advance again before the previous 300 ms movement
	// (plus its stagger) has settled. Scale the whole motion budget together so
	// every visible row reaches its destination just before the next row starts.
	const availableMs = Math.max(
		LYRICS_CENTERING_MIN_TOTAL_MS,
		transitionWindowMs - LYRICS_CENTERING_SETTLE_RESERVE_MS
	);
	const timingScale = Math.min(1, availableMs / defaultTotalMs);
	return {
		durationMs: Math.max(1, Math.round(LYRICS_CENTERING_DURATION_MS * timingScale)),
		staggerMs: Math.max(0, Math.round(LYRICS_CENTERING_STAGGER_MS * timingScale)),
		maxStaggerMs: Math.max(0, Math.round(LYRICS_CENTERING_MAX_STAGGER_MS * timingScale)),
	};
};

const cubicBezierCoordinate = (t, first, second) => {
	const inverse = 1 - t;
	return (3 * inverse * inverse * t * first)
		+ (3 * inverse * t * t * second)
		+ (t * t * t);
};

const cubicBezierDerivative = (t, first, second) => {
	const inverse = 1 - t;
	return (3 * inverse * inverse * first)
		+ (6 * inverse * t * (second - first))
		+ (3 * t * t * (1 - second));
};

const getLyricsCenteringProgress = (progress) => {
	const clamped = Math.max(0, Math.min(1, progress));
	const [x1, y1, x2, y2] = LYRICS_CENTERING_BEZIER;
	let parameter = clamped;

	for (let iteration = 0; iteration < 5; iteration++) {
		const difference = cubicBezierCoordinate(parameter, x1, x2) - clamped;
		const derivative = cubicBezierDerivative(parameter, x1, x2);
		if (Math.abs(difference) < 0.0001 || Math.abs(derivative) < 0.0001) break;
		parameter = Math.max(0, Math.min(1, parameter - difference / derivative));
	}

	return cubicBezierCoordinate(parameter, y1, y2);
};

const cancelSyncedLyricsScrollAnimation = (container) => {
	const animation = container ? syncedLyricsScrollAnimations.get(container) : null;
	if (!animation) return;

	animation.cancelFrame(animation.frameId);
	syncedLyricsScrollAnimations.delete(container);
};

const prefersReducedLyricsMotion = () => (
	CONFIG?.visual?.["reduce-motion"] === true
	|| (
		typeof window !== "undefined"
		&& typeof window.matchMedia === "function"
		// MediaQueryList.matches stays live; do not allocate one for every glyph.
		&& (prefersReducedLyricsMotion.mediaQuery ??= window.matchMedia("(prefers-reduced-motion: reduce)")).matches
	)
);

const animateSyncedLyricsScroll = (container, targetTop) => {
	cancelSyncedLyricsScrollAnimation(container);

	const startTop = Number(container.scrollTop) || 0;
	if (Math.abs(targetTop - startTop) < 0.5 || prefersReducedLyricsMotion()) {
		container.scrollTop = targetTop;
		return;
	}

	const now = typeof performance !== "undefined" && typeof performance.now === "function"
		? () => performance.now()
		: () => Date.now();
	const requestFrame = typeof window.requestAnimationFrame === "function"
		? window.requestAnimationFrame.bind(window)
		: (callback) => setTimeout(() => callback(now()), 16);
	const cancelFrame = typeof window.cancelAnimationFrame === "function"
		? window.cancelAnimationFrame.bind(window)
		: clearTimeout;
	const animation = {
		frameId: null,
		cancelFrame,
		startTop,
		targetTop,
		startTime: now(),
	};

	const frame = (timestamp) => {
		if (syncedLyricsScrollAnimations.get(container) !== animation) return;

		const elapsed = Math.max(0, timestamp - animation.startTime);
		const progress = Math.min(1, elapsed / LYRICS_CENTERING_DURATION_MS);
		const eased = getLyricsCenteringProgress(progress);
		container.scrollTop = animation.startTop
			+ ((animation.targetTop - animation.startTop) * eased);

		if (progress < 1) {
			animation.frameId = requestFrame(frame);
			return;
		}

		container.scrollTop = animation.targetTop;
		syncedLyricsScrollAnimations.delete(container);
	};

	syncedLyricsScrollAnimations.set(container, animation);
	animation.frameId = requestFrame(frame);
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

	if (behavior === "smooth") {
		animateSyncedLyricsScroll(container, nextTop);
		return;
	}

	if (behavior === "sync" && syncedLyricsScrollAnimations.has(container)) {
		syncedLyricsScrollAnimations.get(container).targetTop = nextTop;
		return;
	}

	cancelSyncedLyricsScrollAnimation(container);
	container.scrollTop = nextTop;
};

const getKaraokeVocalAnchorCenterWithinLine = (activeLine) => {
	if (!activeLine || typeof activeLine.querySelector !== "function") {
		return null;
	}

	const stack = activeLine.querySelector(".lyrics-karaoke-stack[data-karaoke-vocal-row-count]");
	const rowCount = Number(stack?.getAttribute("data-karaoke-vocal-row-count"));
	const rawAnchorPosition = stack?.getAttribute("data-karaoke-vocal-anchor-position");
	// Before the first vocal row starts, the playback anchor is intentionally absent.
	// Still center the first row so a multi-vocal block does not get centered as a
	// whole and then jump upward as soon as that first row becomes active.
	const anchorPosition = rawAnchorPosition === null ? 0 : Number(rawAnchorPosition);
	if (
		!stack
		|| !Number.isFinite(anchorPosition)
		|| !Number.isFinite(rowCount)
		|| rowCount < KARAOKE_VOCAL_STACK_CENTER_THRESHOLD
	) {
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

const prepareGlobalCharTimeline = (lyrics) => {
	const offsets = new Array(lyrics.length);
	const chars = [];
	const entries = [];
	let totalChars = 0;

	for (let i = 0; i < lyrics.length; i++) {
		const line = lyrics[i];
		offsets[i] = totalChars;

		const backgroundVocals = line?.vocals?.background;
		const backgroundVocalCount = Array.isArray(backgroundVocals) ? backgroundVocals.length : 0;
		const sourceCount = 2 + backgroundVocalCount;
		for (let sourceIndex = 0; sourceIndex < sourceCount; sourceIndex++) {
			const syllables = sourceIndex === 0
				? line?.syllables
				: sourceIndex === 1
					? line?.vocals?.lead?.syllables
					: backgroundVocals[sourceIndex - 2]?.syllables;
			if (!Array.isArray(syllables) || syllables.length === 0) continue;

			const sourceChars = [];
			const syllableCount = syllables.length;
			for (let syllableIndex = 0; syllableIndex < syllableCount; syllableIndex++) {
				const syllable = syllables[syllableIndex];
				if (!syllable || !syllable.text) continue;

				const charArray = splitKaraokeGraphemes(syllable.text);
				const charCount = charArray.length;
				if (charCount === 0) continue;
				const syllableStart = syllable.startTime || 0;
				const syllableEnd = syllable.endTime || syllableStart + 500;

				for (let charIdx = 0; charIdx < charCount; charIdx++) {
					const charDuration = (syllableEnd - syllableStart) / charCount;
					const charStart = syllableStart + (charIdx * charDuration);
					const charEnd = charStart + charDuration;

					sourceChars.push({
						char: charArray[charIdx],
						startTime: charStart,
						endTime: charEnd,
					});
				}
			}

			coalesceKaraokeTimedGraphemes(sourceChars).forEach((charInfo) => {
				const charStart = charInfo.startTime;
				const charEnd = charInfo.endTime;
				const charDuration = Math.max(1, charEnd - charStart);
				chars.push(charStart, charEnd, charDuration);
				entries.push({
					startTime: charStart,
					endTime: charEnd,
					duration: charDuration,
					charIndex: totalChars,
				});
				totalChars++;
			});
		}
	}

	const activeEntries = [...entries].sort((first, second) => (
		first.startTime - second.startTime
		|| first.charIndex - second.charIndex
	));
	const activePrefixMaxEnd = new Float64Array(activeEntries.length);
	let maximumEndTime = -Infinity;
	for (let index = 0; index < activeEntries.length; index += 1) {
		maximumEndTime = Math.max(maximumEndTime, activeEntries[index].endTime);
		activePrefixMaxEnd[index] = maximumEndTime;
	}
	// For equal end times, place the lower source index last. The old linear scan
	// kept the first matching character when multiple vocal rows ended together.
	const passedEntries = [...entries].sort((first, second) => (
		first.endTime - second.endTime
		|| second.charIndex - first.charIndex
	));

	return {
		globalCharOffsets: offsets,
		chars,
		activeEntries,
		activePrefixMaxEnd,
		passedEntries,
	};
};

const queryGlobalCharTimeline = (timeline, position) => {
	let activeCharIndex = -1;
	let lastPassedCharIndex = -1;
	let lastPassedCharEndTime = 0;
	let lastPassedCharDuration = 100;
	const activeEntries = timeline.activeEntries;
	const activePrefixMaxEnd = timeline.activePrefixMaxEnd;
	const passedEntries = timeline.passedEntries;

	if (Array.isArray(activeEntries) && activePrefixMaxEnd?.length === activeEntries.length) {
		let lower = 0;
		let upper = activeEntries.length;
		while (lower < upper) {
			const middle = (lower + upper) >> 1;
			if (activeEntries[middle].startTime <= position) lower = middle + 1;
			else upper = middle;
		}

		for (let index = lower - 1; index >= 0 && activePrefixMaxEnd[index] > position; index -= 1) {
			const entry = activeEntries[index];
			if (position < entry.endTime) {
				activeCharIndex = Math.max(activeCharIndex, entry.charIndex);
			}
		}
	}

	if (Array.isArray(passedEntries) && passedEntries.length > 0) {
		let lower = 0;
		let upper = passedEntries.length;
		while (lower < upper) {
			const middle = (lower + upper) >> 1;
			if (passedEntries[middle].endTime <= position) lower = middle + 1;
			else upper = middle;
		}

		const entry = passedEntries[lower - 1];
		if (entry && entry.endTime > 0) {
			lastPassedCharEndTime = entry.endTime;
			lastPassedCharIndex = entry.charIndex;
			lastPassedCharDuration = entry.duration || 100;
		}
	} else {
		// Keep the exported helper compatible with timelines created by an older
		// ivLyrics runtime during hot reloads.
		for (let valueIndex = 0, charIndex = 0; valueIndex < timeline.chars.length; valueIndex += 3, charIndex++) {
			const charStart = timeline.chars[valueIndex];
			const charEnd = timeline.chars[valueIndex + 1];
			const charDuration = timeline.chars[valueIndex + 2];
			if (position >= charStart && position < charEnd) {
				activeCharIndex = charIndex;
			}
			if (position >= charEnd && charEnd > lastPassedCharEndTime) {
				lastPassedCharEndTime = charEnd;
				lastPassedCharIndex = charIndex;
				lastPassedCharDuration = charDuration || 100;
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
		globalCharOffsets: timeline.globalCharOffsets,
		activeGlobalCharIndex: activeCharIndex,
	};
};

const EMPTY_GLOBAL_CHAR_STATE = {
	globalCharOffsets: [],
	activeGlobalCharIndex: -1,
};

const KARAOKE_PRE_SPACE_MIN_DURATION_MS = 40;
const KARAOKE_PRE_SPACE_NEXT_CHAR_RATIO = 0.35;
const KARAOKE_PRE_SPACE_MAX_DURATION_MS = 60;
const KARAOKE_FILL_CORRECTION_DEFAULT_POINTS = [
	{ x: 0, y: 0 },
	{ x: 0.25, y: 0.25 },
	{ x: 0.5, y: 0.5 },
	{ x: 0.75, y: 0.75 },
	{ x: 1, y: 1 },
];
const PSEUDO_KARAOKE_SOURCES = new Set(["audio-analysis-pseudo", "spotify-audio-analysis", "line-timing-pseudo"]);
const KARAOKE_RTL_STRONG_CHAR_REGEX = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const KARAOKE_LTR_STRONG_CHAR_REGEX = /[A-Za-z\u00C0-\u02AF\u0370-\u052F\u1E00-\u1EFF]/u;
const KARAOKE_JOINING_SCRIPT_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFC]/u;
const KARAOKE_COMPLEX_GRAPHEME_REGEX = /[\p{M}\u200C\u200D]/u;

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
		KARAOKE_JOINING_SCRIPT_REGEX.test(normalizedText) ||
		KARAOKE_COMPLEX_GRAPHEME_REGEX.test(normalizedText);
};

const shouldWrapKaraokeByWord = (text) => {
	const normalizedText = typeof text === "string" ? text : "";
	return /\S\s+\S/u.test(normalizedText);
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
	if (points.every((point) => Math.abs(point.y - point.x) < 0.000001)) {
		return normalizedValue;
	}
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
	const rawControlY = (p1.y + p2.y) / 2 + (p2.y - p0.y + p3.y - p1.y) / 8;
	// Keep every quadratic segment monotonic. Without this clamp, equal adjacent
	// values can produce an overshooting control point (for example 0.5 ->
	// 0.59375 -> 0.5), making the karaoke fill advance and then visibly retreat.
	const controlY = Math.max(p1.y, Math.min(p2.y, rawControlY));
	const oneMinusProgress = 1 - localProgress;
	const correctedValue =
		oneMinusProgress * oneMinusProgress * p1.y +
		2 * oneMinusProgress * localProgress * controlY +
		localProgress * localProgress * p2.y;

	return clampKaraokeFillCurveValue(correctedValue);
};

const KARAOKE_CHAR_STATE_CLASS_NAMES = {
	pending: [
		"lyrics-karaoke-char lyrics-karaoke-char--pending",
		"lyrics-karaoke-char lyrics-karaoke-char--pending is-complete",
		"lyrics-karaoke-char lyrics-karaoke-char--pending is-bouncing",
		"lyrics-karaoke-char lyrics-karaoke-char--pending is-bouncing is-complete",
	],
	active: [
		"lyrics-karaoke-char lyrics-karaoke-char--active",
		"lyrics-karaoke-char lyrics-karaoke-char--active is-complete",
		"lyrics-karaoke-char lyrics-karaoke-char--active is-bouncing",
		"lyrics-karaoke-char lyrics-karaoke-char--active is-bouncing is-complete",
	],
	done: [
		"lyrics-karaoke-char lyrics-karaoke-char--done",
		"lyrics-karaoke-char lyrics-karaoke-char--done is-complete",
		"lyrics-karaoke-char lyrics-karaoke-char--done is-bouncing",
		"lyrics-karaoke-char lyrics-karaoke-char--done is-bouncing is-complete",
	],
};

const KARAOKE_TEXT_RUN_STATE_CLASS_NAMES = {
	pending: [
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending is-complete",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending is-bouncing",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--pending is-bouncing is-complete",
	],
	active: [
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active is-complete",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active is-bouncing",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--active is-bouncing is-complete",
	],
	done: [
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done is-complete",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done is-bouncing",
		"lyrics-karaoke-text-run-segment lyrics-karaoke-text-run-segment--done is-bouncing is-complete",
	],
};

const KARAOKE_WHITESPACE_CHAR_REGEX = /\s/u;

const getCachedKaraokeStateClassName = (classNames, state, isBouncing, isComplete) => (
	classNames[state][(isBouncing ? 2 : 0) + (isComplete ? 1 : 0)]
);

const assignKaraokeWordIndexes = (timedChars, preferSourceUnits = false, locale = "auto") => {
	if (!Array.isArray(timedChars) || timedChars.length === 0) {
		return timedChars;
	}

	const wordIndexes = new Array(timedChars.length).fill(null);
	const assignFromSourceUnits = () => {
		const unitWordIndexes = new Map();
		let nextWordIndex = 0;
		timedChars.forEach((charInfo, index) => {
			const char = String(charInfo?.char || "");
			if (!char || KARAOKE_WHITESPACE_CHAR_REGEX.test(char)) return;
			const unitIndex = Number.isInteger(charInfo?.karaokeUnitIndex)
				? charInfo.karaokeUnitIndex
				: index;
			if (!unitWordIndexes.has(unitIndex)) {
				unitWordIndexes.set(unitIndex, nextWordIndex++);
			}
			wordIndexes[index] = unitWordIndexes.get(unitIndex);
		});
	};

	if (preferSourceUnits) {
		assignFromSourceUnits();
	} else if (window.LyricsWordSegmenter?.segmentRanges) {
		const text = timedChars.map((charInfo) => String(charInfo?.char || "")).join("");
		const charUtf16Offsets = [];
		let utf16Offset = 0;
		timedChars.forEach((charInfo) => {
			charUtf16Offsets.push(utf16Offset);
			utf16Offset += String(charInfo?.char || "").length;
		});

		window.LyricsWordSegmenter.segmentRanges(text, locale).forEach((segment, nextWordIndex) => {
			for (let index = 0; index < charUtf16Offsets.length; index += 1) {
				const charStart = charUtf16Offsets[index];
				if (charStart >= segment.start && charStart < segment.end) {
					wordIndexes[index] = nextWordIndex;
				}
			}
		});
	} else if (typeof Intl !== "undefined" && typeof Intl.Segmenter === "function") {
		const text = timedChars.map((charInfo) => String(charInfo?.char || "")).join("");
		const charUtf16Offsets = [];
		let utf16Offset = 0;
		timedChars.forEach((charInfo) => {
			charUtf16Offsets.push(utf16Offset);
			utf16Offset += String(charInfo?.char || "").length;
		});

		let nextWordIndex = 0;
		for (const segment of new Intl.Segmenter(locale === "auto" ? undefined : locale, { granularity: "word" }).segment(text)) {
			if (!segment.segment || /^\s+$/u.test(segment.segment)) continue;
			const segmentStart = segment.index;
			const segmentEnd = segmentStart + segment.segment.length;
			for (let index = 0; index < charUtf16Offsets.length; index += 1) {
				const charStart = charUtf16Offsets[index];
				if (charStart >= segmentStart && charStart < segmentEnd) {
					wordIndexes[index] = nextWordIndex;
				}
			}
			nextWordIndex += 1;
		}
	} else {
		assignFromSourceUnits();
	}

	return timedChars.map((charInfo, index) => ({
		...charInfo,
		karaokeWordIndex: wordIndexes[index],
	}));
};

const getKaraokeInlineStylePresentation = (charInfo) => {
	if (charInfo?.inlineStyle !== true) return null;

	const kind = String(charInfo?.styleKind || "").trim().toLowerCase();
	const kindClasses = getKaraokeKindClassParts(kind);
	const speakerClass = normalizeKaraokeSpeakerClass(
		charInfo?.styleSpeaker,
		charInfo?.styleSpeakerColor,
		charInfo?.styleSpeakerFallback
	);
	if (kindClasses.length === 0 && !speakerClass) return null;

	return {
		key: [
			kindClasses.join(" "),
			speakerClass,
			String(charInfo?.styleSpeakerColor || "").trim().toLowerCase(),
			String(charInfo?.styleSpeakerFallback || "").trim().toUpperCase(),
		].join("|"),
		className: [
			"ivlyrics-karaoke-range-style",
			...kindClasses,
			speakerClass ? `speaker-${speakerClass}` : "",
		].filter(Boolean).join(" "),
		style: getKaraokeSpeakerStyle(
			charInfo?.styleSpeaker,
			charInfo?.styleSpeakerColor,
			charInfo?.styleSpeakerFallback
		),
	};
};

const KARAOKE_INLINE_STYLE_MAX_RUN_LENGTH = 12;

const wrapKaraokeInlineStyleRuns = (
	timedChars,
	elements,
	{ keyPrefix = "karaoke-inline-style", sourceIndexOffset = 0 } = {}
) => {
	if (!Array.isArray(timedChars)
		|| !Array.isArray(elements)
		|| timedChars.length !== elements.length
		|| timedChars.length === 0) {
		return elements;
	}

	const result = [];
	let run = null;
	const flush = () => {
		if (!run) return;
		if (!run.presentation) {
			result.push(...run.elements);
		} else {
			result.push(react.createElement(
				"span",
				{
					className: run.presentation.className,
					style: {
						...run.presentation.style,
						"--ivlyrics-range-index": sourceIndexOffset + run.startIndex,
					},
					key: `${keyPrefix}-${sourceIndexOffset + run.startIndex}`,
				},
				run.elements
			));
		}
		run = null;
	};

	for (let index = 0; index < timedChars.length; index += 1) {
		const presentation = getKaraokeInlineStylePresentation(timedChars[index]);
		const styleKey = presentation?.key || "";
		if (!run
			|| run.styleKey !== styleKey
			|| run.elements.length >= KARAOKE_INLINE_STYLE_MAX_RUN_LENGTH) {
			flush();
			run = {
				styleKey,
				presentation,
				startIndex: index,
				elements: [],
			};
		}
		run.elements.push(elements[index]);
	}
	flush();
	return result;
};

const buildKaraokeWordElements = (
	timedChars,
	charElements,
	{ position = 0, isActive = false, isComplete = false, globalCharOffset = 0, activeGlobalCharIndex = -1, wordTimed = false } = {}
) => {
	if (!Array.isArray(timedChars) || !Array.isArray(charElements) || timedChars.length !== charElements.length) {
		return charElements;
	}

	const wordElements = [];
	let currentWord = [];
	let currentWordStart = 0;
	let currentWordUnit = null;
	const timedCharCount = timedChars.length;
	const flushWord = () => {
		if (currentWord.length === 0) return;
		const wordChars = timedChars.slice(currentWordStart, currentWordStart + currentWord.length);
		const startTime = wordChars.reduce((minimum, charInfo) => {
			const value = Number.isFinite(charInfo?.karaokeFillStartTime)
				? charInfo.karaokeFillStartTime
				: charInfo?.startTime;
			return Number.isFinite(value) ? Math.min(minimum, value) : minimum;
		}, Infinity);
		const endTime = wordChars.reduce((maximum, charInfo) => {
			const value = Number.isFinite(charInfo?.karaokeFillEndTime)
				? charInfo.karaokeFillEndTime
				: charInfo?.endTime;
			return Number.isFinite(value) ? Math.max(maximum, value) : maximum;
		}, -Infinity);
		const bounce = wordTimed && Number.isFinite(startTime) && Number.isFinite(endTime)
			? getKaraokeWordBounceValues(position, isActive, startTime, endTime, 1,
				getKaraokeMotionProfile(timedChars, currentWordStart, currentWord.length))
			: { active: false };
		const style = bounce.active ? {
			"--karaoke-bounce-y": `${bounce.offsetY}px`,
			"--karaoke-bounce-scale": bounce.scale,
			"--karaoke-motion-glow": bounce.glow,
		} : undefined;
		const styledWordElements = wrapKaraokeInlineStyleRuns(wordChars, currentWord, {
			keyPrefix: "karaoke-word-inline-style",
			sourceIndexOffset: currentWordStart,
		});
		wordElements.push(react.createElement(
			"span",
			{
				className: `lyrics-karaoke-word${wordTimed ? " is-word-timed" : ""}${bounce.active ? " is-bouncing" : ""}${isComplete ? " is-complete" : ""}`,
				style,
				key: `karaoke-word-${currentWordStart}`,
			},
			styledWordElements
		));
		currentWord = [];
		currentWordUnit = null;
	};

	for (let index = 0; index < timedCharCount; index++) {
		if (!(index in timedChars)) {
			continue;
		}

		const charInfo = timedChars[index];
		const char = charInfo?.char || "";
		const element = charElements[index];
		const isWhitespace = KARAOKE_WHITESPACE_CHAR_REGEX.test(char);
		const unitIndex = Number.isInteger(charInfo?.karaokeWordIndex)
			? charInfo.karaokeWordIndex
			: null;
		const unitChanged = wordTimed
			&& currentWord.length > 0
			&& unitIndex !== null
			&& currentWordUnit !== null
			&& unitIndex !== currentWordUnit;

		if (unitChanged) {
			flushWord();
		}

		if (!isWhitespace && currentWord.length === 0) {
			currentWordStart = index;
			currentWordUnit = unitIndex;
		}

		if (isWhitespace) {
			flushWord();
			wordElements.push(...wrapKaraokeInlineStyleRuns([charInfo], [element], {
				keyPrefix: "karaoke-space-inline-style",
				sourceIndexOffset: index,
			}));
			continue;
		}

		currentWord.push(element);
	}

	flushWord();
	return wordElements;
};

const getKaraokeSegmentFill = (segment, position, isActive, isComplete) => {
	if (isComplete) {
		return 100;
	}
	if (!segment) {
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

const getKaraokeInstantWordFill = (segment, position, isActive, isComplete) => {
	if (isComplete) return 100;
	if (!segment) return 0;
	const startTime = Number.isFinite(segment.startTime) ? segment.startTime : 0;
	return position >= startTime ? 100 : 0;
};

const buildKaraokeTextRunSegments = (timedChars, wordTimed = false, preserveInlineStyles = true) => {
	if (!Array.isArray(timedChars) || timedChars.length === 0) {
		return [];
	}
	const hasInlineStyles = preserveInlineStyles
		&& timedChars.some(charInfo => charInfo?.inlineStyle === true);
	const sharedSegments = !wordTimed && !hasInlineStyles && window.LyricsService?.buildKaraokeWordSegments?.(timedChars, {
		getText: (charInfo) => charInfo?.char || "",
		getStartTime: (charInfo) => charInfo?.startTime,
		getEndTime: (charInfo) => charInfo?.endTime,
	});
	if (Array.isArray(sharedSegments)) {
		return sharedSegments;
	}

	const segments = [];
	let currentSegment = null;
	const timedCharCount = timedChars.length;

	for (let index = 0; index < timedCharCount; index++) {
		if (!(index in timedChars)) {
			continue;
		}

		const charInfo = timedChars[index];
		const char = charInfo?.char || "";
		const type = KARAOKE_WHITESPACE_CHAR_REGEX.test(char) ? "space" : "text";
		const unitIndex = Number.isInteger(charInfo?.karaokeWordIndex)
			? charInfo.karaokeWordIndex
			: null;
		const unitChanged = wordTimed
			&& type === "text"
			&& currentSegment?.type === "text"
			&& unitIndex !== null
			&& currentSegment.unitIndex !== null
			&& currentSegment.unitIndex !== unitIndex;
		const hasInlineStyle = preserveInlineStyles && charInfo?.inlineStyle === true;
		const styleKind = hasInlineStyle ? String(charInfo?.styleKind || '') : '';
		const styleSpeaker = hasInlineStyle ? String(charInfo?.styleSpeaker || '') : '';
		const styleSpeakerColor = hasInlineStyle ? String(charInfo?.styleSpeakerColor || '') : '';
		const styleSpeakerFallback = hasInlineStyle ? String(charInfo?.styleSpeakerFallback || '') : '';
		const styleChanged = currentSegment
			&& (
				currentSegment.styleKind !== styleKind
				|| currentSegment.styleSpeaker !== styleSpeaker
				|| currentSegment.styleSpeakerColor !== styleSpeakerColor
				|| currentSegment.styleSpeakerFallback !== styleSpeakerFallback
			);
		if (!currentSegment || currentSegment.type !== type || unitChanged || styleChanged) {
			if (currentSegment?.text.length > 0) {
				segments.push(currentSegment);
			}
			currentSegment = {
				type,
				unitIndex,
				startIndex: index,
				charCount: 0,
				text: "",
				startTime: Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0,
				endTime: Number.isFinite(charInfo?.endTime) ? charInfo.endTime : 0,
				styleKind,
				styleSpeaker,
				styleSpeakerColor,
				styleSpeakerFallback,
			};
		}

		currentSegment.text += char;
		currentSegment.charCount += 1;
		if (Number.isFinite(charInfo?.endTime)) {
			currentSegment.endTime = Math.max(currentSegment.endTime, charInfo.endTime);
		}
	}

	if (currentSegment?.text.length > 0) {
		segments.push(currentSegment);
	}
	return segments;
};

const buildKaraokeTextRunElements = (
	timedChars,
	position,
	isActive,
	isComplete,
	textDirection,
	globalCharOffset = 0,
	activeGlobalCharIndex = -1,
	wordTimed = false,
	preserveInlineStyles = true
) => {
	const segments = buildKaraokeTextRunSegments(timedChars, wordTimed, preserveInlineStyles);
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

		const fillValue = wordTimed
			? getKaraokeInstantWordFill(segment, position, isActive, isComplete)
			: getKaraokeSegmentFill(segment, position, isActive, isComplete);
		const segmentDirection = getKaraokeTextDirection(segment.text) || textDirection;
		const gradientDirection = segmentDirection === "rtl" ? "to left" : "to right";
		const segmentState = fillValue <= 0 ? "pending" : fillValue >= 100 ? "done" : "active";
		const segmentCharCount = Number.isFinite(segment.charCount)
			? segment.charCount
			: splitKaraokeGraphemes(segment.text).length;
		const bounce = getKaraokeBounceValues(position, isActive, segment.startTime, segment.endTime, 1,
			getKaraokeMotionProfile(timedChars, segment.startIndex, segmentCharCount));
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
			segmentStyle["--karaoke-motion-glow"] = bounce.glow;
		}

		let segmentClassName = getCachedKaraokeStateClassName(
			KARAOKE_TEXT_RUN_STATE_CLASS_NAMES,
			segmentState,
			bounce.active,
			isComplete
		);
		if (wordTimed) segmentClassName += " is-word-timed";
		if (segment.styleKind || segment.styleSpeaker) {
			const kindClasses = getKaraokeKindClassParts(segment.styleKind);
			segmentClassName += ` ivlyrics-karaoke-range-style${kindClasses.length ? ` ${kindClasses.join(' ')}` : ''}`;
			const speakerClass = normalizeKaraokeSpeakerClass(
				segment.styleSpeaker,
				segment.styleSpeakerColor,
				segment.styleSpeakerFallback
			);
			if (speakerClass) segmentClassName += ` speaker-${speakerClass}`;
			Object.assign(segmentStyle, getKaraokeSpeakerStyle(
				segment.styleSpeaker,
				segment.styleSpeakerColor,
				segment.styleSpeakerFallback
			));
		}
		segmentStyle['--ivlyrics-range-index'] = segment.startIndex;

		return react.createElement(
			"span",
			{
				className: segmentClassName,
				dir: segmentDirection,
				style: segmentStyle,
				"data-outline-text": segment.text,
				key: `karaoke-text-run-segment-${segment.startIndex}`,
			},
			react.createElement(
				"span",
				{ className: "lyrics-karaoke-glyph-fill" },
				segment.text
			)
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
	lyrics.map((line, index, allLines) => {
		const displayValues = getEmbeddedAuxiliaryDisplayValues(line);
		return {
			...line,
			interludeInfo: getInterludeInfo(line, allLines[index + 1], index, allLines.length),
			...buildLyricDisplayState(
				isKara,
				line,
				displayValues.text,
				displayValues.originalText,
				displayValues.text2
			),
		};
	});

const buildPaddedSyncedLyrics = (lyrics, leadingEmptyLines) =>
	Array.from({ length: leadingEmptyLines }, () => emptyLine)
		.concat(lyrics)
		.map((line, lineNumber) => ({
			...line,
			lineNumber,
		}));

const shouldIncludeSyncedLineInCompactView = (line, activeLineIndex, visualLineIndex = activeLineIndex) =>
	!line?.interludeInfo?.isInterlude
	|| line.lineNumber === activeLineIndex
	|| line.lineNumber === visualLineIndex;

const createCompactDisplayLineCache = () => new WeakMap();

const getCachedCompactDisplayLine = (sourceLine, displayLineNumber, cache) => {
	const cached = cache.get(sourceLine);
	if (cached && cached.displayLineNumber === displayLineNumber) {
		return cached.displayLine;
	}

	const displayLine = {
		...sourceLine,
		displayLineNumber,
	};
	cache.set(sourceLine, { displayLineNumber, displayLine });
	return displayLine;
};

const buildCompactDisplayLines = (
	paddedLyrics,
	activeLineIndex,
	visualLineIndex = activeLineIndex,
	cache = createCompactDisplayLineCache()
) => {
	return paddedLyrics
		.filter((line) => shouldIncludeSyncedLineInCompactView(line, activeLineIndex, visualLineIndex))
		.map((line, displayLineNumber) => (
			getCachedCompactDisplayLine(line, displayLineNumber, cache)
		));
};

const getActiveTimedLineIndex = (lines, position) => {
	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (line && position >= (line.startTime || 0)) {
			return i;
		}
	}

	return 0;
};

const getPrecenteredTimedLineIndex = (lines, position, activeLineIndex, advanceMs) => {
	if (!Array.isArray(lines) || lines.length === 0 || advanceMs <= 0) {
		return activeLineIndex;
	}

	const advancedLineIndex = getActiveTimedLineIndex(lines, position + advanceMs);
	// A very short lyric can put multiple starts inside the pre-centering window.
	// Advance by at most one row so an intermediate line is never skipped visually.
	return Math.min(
		lines.length - 1,
		activeLineIndex + 1,
		Math.max(activeLineIndex, advancedLineIndex)
	);
};

const buildSyncedLinePlaybackWindows = (lines, isKara) => {
	const safeLines = Array.isArray(lines) ? lines : [];
	return safeLines.map((line, index) => {
		const startTime = toFiniteTime(line?.startTime) ?? 0;
		const nextStartTime = toFiniteTime(safeLines[index + 1]?.startTime);
		const directEndTime = toFiniteTime(line?.endTime);
		let contentEndTime = directEndTime;

		if (isKara) {
			const boundsEndTime = toFiniteTime(getKaraokeLineBounds(line).endTime);
			const fillEndTime = getKaraokeLineFillEndTime(line);
			const candidates = [contentEndTime, boundsEndTime, fillEndTime]
				.filter((value) => value !== null && value >= startTime);
			contentEndTime = candidates.length > 0 ? Math.max(...candidates) : null;
		}

		if (contentEndTime === null || contentEndTime <= startTime) {
			contentEndTime = nextStartTime !== null && nextStartTime > startTime
				? nextStartTime
				: startTime;
		}

		const holdEndTime = nextStartTime !== null
			? Math.max(contentEndTime, nextStartTime)
			: contentEndTime;

		return {
			startTime,
			contentEndTime,
			holdEndTime,
			completionPosition: contentEndTime + KARAOKE_COMPLETION_POSITION_OFFSET_MS,
		};
	});
};

const getSyncedLinePlaybackState = (window, position) => {
	if (!window || !Number.isFinite(position) || position < window.startTime) {
		return {
			isHighlighted: false,
			isSinging: false,
			isAnimating: false,
			renderPosition: 0,
		};
	}

	const isSinging = position < window.contentEndTime;
	const isSettling = position < window.contentEndTime + KARAOKE_RELEASE_WINDOW_MS;
	const needsLiveReleasePosition = CONFIG.visual["karaoke-bounce"] === true;
	return {
		isHighlighted: position < window.holdEndTime,
		isSinging,
		isAnimating: isSinging || isSettling,
		// Once filling has completed, only the optional bounce release consumes the
		// live clock. Pin ordinary completed rows immediately so rapid songs do not
		// keep re-rendering several outgoing lines for another 820 ms.
		renderPosition: isSinging || (isSettling && needsLiveReleasePosition)
			? position
			: window.completionPosition,
	};
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
	karaokeRenderGranularity = null,
	line = null,
	position = 0,
	isActive = false,
	isCurrentLine = isActive,
	isEffectFocused = isCurrentLine,
	isEffectLive = isActive || isEffectFocused,
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
	culturalNote = null,
	singleLineScroll = false,
	hiddenFromAccessibility = false,
}) => {
	const mainLine = line || (typeof mainText === "object" ? mainText : {
		text: mainText,
		originalText,
		text2: subText2,
  });
	const displayedCulturalAnnotations = normalizeDisplayedCulturalAnnotations(
		culturalNote || mainLine?.culturalNote
	);
	const culturalAnnotationsByTarget = {
		main: [],
		sub: [],
		sub2: [],
	};
	if (!isKara) {
		for (const annotation of displayedCulturalAnnotations) {
			const expressionMatches = (text) =>
				typeof text === "string" &&
				annotation.expression &&
				getRubySourceText(text).includes(annotation.expression);
			const target = expressionMatches(mainText)
				? "main"
				: expressionMatches(subText)
					? "sub"
					: expressionMatches(subText2)
						? "sub2"
						: "main";
			culturalAnnotationsByTarget[target].push(annotation);
		}
	}
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

	const mainHtml = !shouldRenderInterlude && typeof mainText === "string" && !isKara && mainText
		? renderAnnotatedLyricHTML(
			mainText,
			culturalAnnotationsByTarget.main
		)
		: null;

	if (shouldRenderInterlude) {
		mainProps.className = "lyrics-lyricsContainer-LyricsLine-interludeMain";
	} else if (singleLineScroll) {
		mainProps.className = "ivlyrics-vinyl-lyric-scroll-viewport";
	} else if (mainHtml) {
		mainProps.dangerouslySetInnerHTML = { __html: mainHtml };
	}

	const handleClick = useCallback(() => {
		if (Number.isFinite(seekTime)) {
			window.Utils?.clearSafePlayerProgressCorrection?.();
			Spicetify.Player.seek(seekTime);
		}
	}, [seekTime]);
	const handleKeyDown = useCallback((event) => {
		if (!Number.isFinite(seekTime) || !["Enter", " ", "Spacebar"].includes(event.key)) return;
		event.preventDefault();
		handleClick();
	}, [handleClick, seekTime]);

	const mainContent = shouldRenderInterlude
		? (shouldShowInterlude ? react.createElement(InterludeIndicator, {
			durationMs: interludeInfo.durationMs,
			kind: interludeInfo.kind || "break",
			settingsRevision,
		}) : "\u00A0")
		: renderLyricMainContent({
			isKara,
			karaokeRenderGranularity,
			mainText,
			line: mainLine,
			position: isKara ? position : 0,
			isActive,
			isEffectFocused,
			isEffectLive,
			settingsRevision,
			globalCharOffset,
			activeGlobalCharIndex,
			subText,
			subText2,
			culturalAnnotations: displayedCulturalAnnotations,
		});
	const renderedMainContent = singleLineScroll && !shouldRenderInterlude
		? react.createElement(
			"span",
			{
				className: "ivlyrics-vinyl-lyric-scroll-content",
				...(mainHtml ? { dangerouslySetInnerHTML: { __html: mainHtml } } : {}),
			},
			mainHtml ? null : mainContent
		)
		: mainContent;

	return react.createElement(
		"div",
		{
                  className: lineClassName,
                  style,
                  dir,
                  ref: lineRef,
				  "aria-hidden": hiddenFromAccessibility ? true : undefined,
                  onClick: !hiddenFromAccessibility && Number.isFinite(seekTime) ? handleClick : null,
				  ...(!hiddenFromAccessibility && Number.isFinite(seekTime) ? {
					  role: "button",
					  tabIndex: 0,
					  title: `Seek to ${Math.max(0, Math.round(seekTime / 1000))} seconds`,
					  onKeyDown: handleKeyDown,
				  } : {}),
		},
		react.createElement(
			"p",
			mainProps,
			renderedMainContent
          ),
		!shouldRenderInterlude && !hasParallelKaraokeRows && renderLyricSubLine(
			"lyrics-lyricsContainer-LyricsLine-phonetic",
			subText,
			subCopyText
				? createCopyHandler(subCopyText, subCopySuccessKey, subCopyFailureKey)
				: null,
			singleLineScroll,
			culturalAnnotationsByTarget.sub
		),
		!shouldRenderInterlude && !hasParallelKaraokeRows && renderLyricSubLine(
			"lyrics-lyricsContainer-LyricsLine-translation",
			subText2,
			subText2CopyText
				? createCopyHandler(subText2CopyText, subText2CopySuccessKey, subText2CopyFailureKey)
				: null,
			singleLineScroll,
			culturalAnnotationsByTarget.sub2
		),
		!shouldRenderInterlude &&
			displayedCulturalAnnotations.map((annotation) => {
				const noteText = `${annotation.marker}. ${annotation.note}`;
				return renderLyricSubLine(
					"lyrics-lyricsContainer-LyricsLine-culturalNote",
					noteText,
					createCopyHandler(
						noteText,
						"notifications.translationCopied",
						"notifications.translationCopyFailed"
					),
					false,
					[],
					`cultural-note-${annotation.marker}`
				);
			})
	);
});

const renderLyricsItems = ({ items, isKara, karaokeRenderGranularity = null, position = 0, activeLineRef = null, settingsRevision = 0 }) => {
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
			culturalNote: item.culturalNote,
			originalText: item.originalText,
			isKara,
			karaokeRenderGranularity,
			line: item.line,
			// Singing rows follow the live clock. Completed rows receive a stable time
			// beyond their final glyph so their fill does not snap back while the parent
			// line is easing out; future rows remain pinned to zero.
			position: Number.isFinite(item.karaokePosition)
				? item.karaokePosition
				: (item.karaokeActive ? karaokePosition : 0),
			isActive: item.karaokeActive,
			isCurrentLine: item.isActiveLine,
			isEffectFocused: item.effectFocused,
			isEffectLive: item.effectLive,
			settingsRevision,
			globalCharOffset: item.globalCharOffset,
			activeGlobalCharIndex: item.activeGlobalCharIndex,
			hiddenFromAccessibility: item.hiddenFromAccessibility === true,
		});
	});
};

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
	const compactDisplayLineCache = useMemo(
		() => createCompactDisplayLineCache(),
		[paddedLyrics]
	);
	const playbackWindows = useMemo(
		() => buildSyncedLinePlaybackWindows(paddedLyrics, isKara),
		[paddedLyrics, isKara]
	);

	const activeLineIndex = useMemo(
		() => getActiveTimedLineIndex(paddedLyrics, position),
		[paddedLyrics, position]
	);
	const shouldPrecenterKaraokeTransitions = isKara
		&& !isScrolling
		&& CONFIG.visual["karaoke-line-transition"]
		&& !prefersReducedLyricsMotion();
	const usesScriptedCompactLineShift = compact
		&& shouldPrecenterKaraokeTransitions
		&& typeof Element !== "undefined"
		&& typeof Element.prototype?.animate === "function";
	const visualLineIndex = useMemo(() => {
		return shouldPrecenterKaraokeTransitions
			? getPrecenteredTimedLineIndex(
				paddedLyrics,
				position,
				activeLineIndex,
				LYRICS_CENTERING_LEAD_MS
			)
			: activeLineIndex;
	}, [paddedLyrics, position, activeLineIndex, shouldPrecenterKaraokeTransitions, settingsRevision]);

	const compactDisplayLines = useMemo(() => {
		if (!compact || isScrolling) {
			return paddedLyrics;
		}

		return buildCompactDisplayLines(
			paddedLyrics,
			activeLineIndex,
			visualLineIndex,
			compactDisplayLineCache
		);
	}, [compact, isScrolling, paddedLyrics, activeLineIndex, visualLineIndex, compactDisplayLineCache]);

	const activeDisplayLineIndex = useMemo(() => {
		if (!compact || isScrolling) {
			return activeLineIndex;
		}

		const index = compactDisplayLines.findIndex((line) => line.lineNumber === activeLineIndex);
		return index >= 0 ? index : Math.min(activeLineIndex, Math.max(0, compactDisplayLines.length - 1));
	}, [compact, isScrolling, compactDisplayLines, activeLineIndex]);

	const visualDisplayLineIndex = useMemo(() => {
		if (!compact || isScrolling) {
			return visualLineIndex;
		}

		const index = compactDisplayLines.findIndex((line) => line.lineNumber === visualLineIndex);
		return index >= 0 ? index : Math.min(visualLineIndex, Math.max(0, compactDisplayLines.length - 1));
	}, [compact, isScrolling, compactDisplayLines, visualLineIndex]);

	const compactWindowStartIndex = useMemo(() => {
		if (!compact) {
			return 0;
		}

		return Math.max(visualDisplayLineIndex - CONFIG.visual["lines-before"], 0);
	}, [compact, visualDisplayLineIndex]);

	const linesToRender = useMemo(() => {
		if (!compact || isScrolling) {
			return paddedLyrics;
		}

		// Keep stable keyed rows mounted so their translateY values can interpolate
		// across the pre-center hand-off. CSS suppresses compositor layers and
		// effects for hidden rows, which retains the performance gain without turning
		// a line transition into a remount/snap.
		return compactDisplayLines;
	}, [compact, isScrolling, paddedLyrics, compactDisplayLines]);
	const visualAnchorLineNumber = visualLineIndex;

	const globalCharTimeline = useMemo(() => {
		if (!isKara || CONFIG.visual["karaoke-bounce"] !== true) {
			return null;
		}

		return prepareGlobalCharTimeline(lyrics);
	}, [lyrics, isKara, CONFIG.visual["karaoke-bounce"], settingsRevision]);

	const { globalCharOffsets, activeGlobalCharIndex } = useMemo(() => (
		globalCharTimeline
			? queryGlobalCharTimeline(globalCharTimeline, position)
			: EMPTY_GLOBAL_CHAR_STATE
	), [globalCharTimeline, position]);

	const activeSourceLineIndex = activeLineIndex - leadingEmptyLines;
	const trailingInterludeLine = useMemo(() => (
		activeSourceLineIndex >= 0
			? createActiveTrailingKaraokeInterludeLine({
				line: preparedLyrics[activeSourceLineIndex],
				nextLine: preparedLyrics[activeSourceLineIndex + 1],
				lineIndex: activeSourceLineIndex,
				lineCount: preparedLyrics.length,
				position,
				isActiveLine: true,
				isKara,
				activationAdvanceMs: shouldPrecenterKaraokeTransitions
					? LYRICS_CENTERING_LEAD_MS
					: 0,
			})
			: null
	), [activeSourceLineIndex, preparedLyrics, position, isKara, shouldPrecenterKaraokeTransitions]);
	const isTrailingInterludeActive = !!trailingInterludeLine
		&& trailingInterludeLine.isPrecentered !== true;
	const trailingInterludeKey = trailingInterludeLine
		? `${trailingInterludeLine.startTime}:${trailingInterludeLine.endTime}:${isTrailingInterludeActive ? "active" : "preview"}`
		: "";
	const visualAnchorUsesTrailingInterlude = !!trailingInterludeLine
		&& visualLineIndex === activeLineIndex;

	// Was invoked inline on every render — and position updates trigger a render every
	// frame, so this layout read fired 60 times/sec and forced a synchronous reflow
	// each time. Now scoped to the events that can actually change the offset:
	// active line shifts, scrolling state flips, compact mode toggles.
	const [compactOffset, setCompactOffset] = useState(0);
	const [suppressLayoutShiftAnimation, setSuppressLayoutShiftAnimation] = useState(false);
	const compactLineShiftAnimationsRef = useRef(new Map());
	const compactLineTransformSnapshotsRef = useRef(new WeakMap());
	const previousPreparedLyricsRef = useRef(preparedLyrics);
	const layoutShiftAnimationFramesRef = useRef({ first: null, second: null });
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

	// Streaming translation/pronunciation changes lyric row heights without
	// changing playback position. Re-centering is still necessary, but animating
	// that corrective offset makes the active lyric fall and spring back for every
	// streamed line. Suppress only the corrective transition for two frames; the
	// normal animated transition remains enabled when playback advances a line.
	useSyncedLayoutEffect(() => {
		const previousPreparedLyrics = previousPreparedLyricsRef.current;
		previousPreparedLyricsRef.current = preparedLyrics;

		const frames = layoutShiftAnimationFramesRef.current;
		const cancelFrame = typeof cancelAnimationFrame === "function"
			? cancelAnimationFrame
			: clearTimeout;
		if (frames.first !== null) cancelFrame(frames.first);
		if (frames.second !== null) cancelFrame(frames.second);
		frames.first = null;
		frames.second = null;

		if (!compact || isScrolling || previousPreparedLyrics === preparedLyrics) {
			setSuppressLayoutShiftAnimation(false);
			return undefined;
		}

		setSuppressLayoutShiftAnimation(true);
		const requestFrame = typeof requestAnimationFrame === "function"
			? requestAnimationFrame
			: (callback) => setTimeout(callback, 0);
		frames.first = requestFrame(() => {
			frames.first = null;
			frames.second = requestFrame(() => {
				frames.second = null;
				setSuppressLayoutShiftAnimation(false);
			});
		});

		return () => {
			if (frames.first !== null) cancelFrame(frames.first);
			if (frames.second !== null) cancelFrame(frames.second);
			frames.first = null;
			frames.second = null;
		};
	}, [compact, isScrolling, preparedLyrics]);

  useSyncedLayoutEffect(() => {
          syncCompactOffset();
  }, [syncCompactOffset, visualLineIndex, trailingInterludeKey, containerReady, lyricsId, preparedLyrics, settingsRevision, anchorRevision]);

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
				attributeFilter: [
					"data-karaoke-vocal-anchor-position",
					"data-karaoke-vocal-anchor-window-ms",
				],
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
  }, [compact, isScrolling, visualLineIndex, trailingInterludeKey, containerReady, lyricsId, preparedLyrics, settingsRevision, anchorRevision, syncCompactOffset]);

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
	}, [compact, visualLineIndex, isScrolling, containerRef, activeLineRef, trailingInterludeKey, preparedLyrics]);

	useEffect(() => {
		if (compact || !isScrolling || !activeLineRef.current) {
			return undefined;
		}

		const timeoutId = setTimeout(() => {
			scrollSyncedContainerToActiveLine(containerRef.current, activeLineRef.current, "auto");
		}, 0);

		return () => clearTimeout(timeoutId);
	}, [compact, activeLineIndex, isScrolling, containerRef, activeLineRef, trailingInterludeKey, preparedLyrics]);

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
				scrollSyncedContainerToActiveLine(containerRef.current, activeLineRef.current, "sync");
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
				attributeFilter: [
					"data-karaoke-vocal-anchor-position",
					"data-karaoke-vocal-anchor-window-ms",
				],
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
	}, [compact, isScrolling, visualLineIndex, trailingInterludeKey, containerRef, activeLineRef, preparedLyrics]);

	const stableLineStyles = useMemo(() => {
		if (compact && isScrolling) {
			return null;
		}

		const hasTrailingInterlude = !!trailingInterludeLine;
		return linesToRender.map((line, visibleIndex) => {
			const {
				lineNumber = visibleIndex,
				displayLineNumber = lineNumber,
			} = line;
			const compactVisibleIndex = compact
				? displayLineNumber - compactWindowStartIndex
				: visibleIndex;
			let animationIndex = getSyncedAnimationIndex({
				compact,
				isScrolling,
				activeLineIndex: compact && !isScrolling ? visualDisplayLineIndex : visualLineIndex,
				lineNumber: compact && !isScrolling ? displayLineNumber : lineNumber,
				visibleIndex: compactVisibleIndex,
			});
			if (hasTrailingInterlude && lineNumber <= activeLineIndex) {
				animationIndex -= 1;
			}

			return {
				cursor: "pointer",
				...getKaraokeSpeakerStyle(line?.speaker, line?.['speaker-color'], line?.['speaker-fallback']),
				"--position-index": animationIndex,
				"--animation-index": Math.abs(animationIndex) + 1,
				"--line-shift-duration": isScrolling || suppressLayoutShiftAnimation || usesScriptedCompactLineShift
					? "0s"
					: "var(--iv-lyrics-centering-duration, 300ms)",
				"--line-shift-delay": "0s",
				"--blur-index": Math.min(Math.abs(animationIndex), 3),
			};
		});
	}, [
		linesToRender,
		compact,
		isScrolling,
		activeLineIndex,
		visualLineIndex,
		visualDisplayLineIndex,
		compactWindowStartIndex,
		trailingInterludeKey,
		suppressLayoutShiftAnimation,
		usesScriptedCompactLineShift,
		settingsRevision,
	]);

	// Compact lyrics change both their relative row index and their measured anchor
	// offset during a hand-off. Animate every visible row with one shared vertical
	// delta so their spacing cannot compress while the center anchor moves. This also
	// gives newly revealed rows the same starting offset as already-mounted rows.
	useSyncedLayoutEffect(() => {
		const animations = compactLineShiftAnimationsRef.current;
		const snapshots = compactLineTransformSnapshotsRef.current;
		if (!usesScriptedCompactLineShift || suppressLayoutShiftAnimation) {
			animations.forEach((animation) => animation.cancel());
			animations.clear();
			compactLineTransformSnapshotsRef.current = new WeakMap();
			return undefined;
		}

		// Ref callbacks, anchor measurement, and compact-offset correction can all
		// commit during the same browser turn. Defer the FLIP read/write work to one
		// microtask so those commits collapse into a single animation instead of
		// repeatedly cancelling and restarting every visible lyric row.
		let cancelled = false;
		const runScheduledLineShift = () => {
			if (cancelled) return;
		const lineRoot = containerRef.current?.querySelector?.(
			".lyrics-lyricsContainer-SyncedLyrics"
		);
		if (!lineRoot) {
			return undefined;
		}

		const allLines = Array.from(lineRoot.children).filter((element) => (
			element instanceof Element
			&& element.classList.contains("lyrics-lyricsContainer-LyricsLine")
		));
		const paddingBeforeLines = allLines.filter((element) => (
			element.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingBefore")
		));
		const paddingAfterLines = allLines.filter((element) => (
			element.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingAfter")
		));
		const boundaryPaddingLines = new Set([
			paddingBeforeLines[paddingBeforeLines.length - 1],
			paddingAfterLines[0],
		].filter(Boolean));
		const lines = allLines.filter((element) => (
			!element.classList.contains("lyrics-lyricsContainer-LyricsLine-paddingLine")
			|| boundaryPaddingLines.has(element)
		));
		const visibleLines = new Set(lines);
		animations.forEach((animation, element) => {
			if (!visibleLines.has(element)) {
				animation.cancel();
				animations.delete(element);
			}
		});

		const previousTransforms = new Map();
		for (const element of lines) {
			const runningAnimation = animations.get(element);
			previousTransforms.set(
				element,
				runningAnimation
					? getComputedStyle(element).transform
					: snapshots.get(element)
			);
		}
		animations.forEach((animation) => animation.cancel());
		animations.clear();

		const lineStates = lines.map((element) => {
			const targetTransform = getComputedStyle(element).transform;
			const previousTransform = previousTransforms.get(element);
			snapshots.set(element, targetTransform);
			return { element, previousTransform, targetTransform };
		});
		const verticalDeltas = lineStates.flatMap(({ previousTransform, targetTransform }) => {
			if (!previousTransform) return [];
			const previousY = getTransformTranslateY(previousTransform);
			const targetY = getTransformTranslateY(targetTransform);
			return Number.isFinite(previousY) && Number.isFinite(targetY)
				? [previousY - targetY]
				: [];
		});
		const sharedVerticalDelta = getMedian(verticalDeltas);
		if (!Number.isFinite(sharedVerticalDelta) || Math.abs(sharedVerticalDelta) < 0.25) {
			return undefined;
		}

		const orderedLineStates = [...lineStates].sort((first, second) => {
			const firstY = getTransformTranslateY(first.targetTransform) ?? 0;
			const secondY = getTransformTranslateY(second.targetTransform) ?? 0;
			return sharedVerticalDelta > 0 ? firstY - secondY : secondY - firstY;
		});
		const activeVocalStack = activeLineRef.current?.querySelector?.(
			".lyrics-karaoke-stack[data-karaoke-vocal-anchor-window-ms]"
		);
		const vocalAnchorWindowMs = Number(
			activeVocalStack?.getAttribute("data-karaoke-vocal-anchor-window-ms")
		);
		const centeringTiming = getAdaptiveLyricsCenteringTiming(
			Number.isFinite(vocalAnchorWindowMs) && vocalAnchorWindowMs > 0
				? vocalAnchorWindowMs
				: null
		);
		const staggerByElement = new Map(orderedLineStates.map(({ element }, index) => [
			element,
			Math.min(index * centeringTiming.staggerMs, centeringTiming.maxStaggerMs),
		]));
		const sharedStartTime = document.timeline?.currentTime;
		for (const { element, targetTransform } of lineStates) {
			const animation = element.animate(
				[
					{ transform: offsetTransformVertically(targetTransform, sharedVerticalDelta) },
					{ transform: targetTransform },
				],
				{
					duration: centeringTiming.durationMs,
					delay: staggerByElement.get(element) || 0,
					easing: LYRICS_CENTERING_EASING_CSS,
					fill: "backwards",
				}
			);
			if (Number.isFinite(sharedStartTime)) {
				animation.startTime = sharedStartTime;
			}
			animations.set(element, animation);
			animation.addEventListener("finish", () => {
				if (animations.get(element) === animation) {
					animations.delete(element);
				}
			}, { once: true });
		}

		};
		if (typeof queueMicrotask === "function") {
			queueMicrotask(runScheduledLineShift);
		} else {
			Promise.resolve().then(runScheduledLineShift);
		}

		return () => {
			cancelled = true;
		};
	}, [
		usesScriptedCompactLineShift,
		suppressLayoutShiftAnimation,
		visualLineIndex,
		compactOffset,
		trailingInterludeKey,
		containerReady,
		lyricsId,
		settingsRevision,
	]);

	useEffect(() => () => {
		compactLineShiftAnimationsRef.current.forEach((animation) => animation.cancel());
		compactLineShiftAnimationsRef.current.clear();
	}, [lyricsId]);
	const renderItems = useMemo(() => {
		if (compact && isScrolling) {
			const activePreparedIndex = Math.max(0, activeLineIndex - leadingEmptyLines);

			return preparedLyrics
				.map((line, index) => ({ line, index }))
				.filter(({ line, index }) => !line?.interludeInfo?.isInterlude || index === activePreparedIndex)
				.flatMap(({ line, index }) => {
					const { startTime, originalText, mainText, subText, subText2, hasSubLine } = line;
					const isAnchorLine = index === activePreparedIndex;
					const playbackState = getSyncedLinePlaybackState(
						playbackWindows[index + leadingEmptyLines],
						position
					);
					const isHighlightedLine = isKara ? playbackState.isHighlighted : isAnchorLine;
					const isAnimatingLine = isKara ? playbackState.isAnimating : isAnchorLine;
					const trailingInterludeLine = createActiveTrailingKaraokeInterludeLine({
						line,
						nextLine: preparedLyrics[index + 1],
						lineIndex: index,
						lineCount: preparedLyrics.length,
						position,
						isActiveLine: isAnchorLine,
						isKara,
					});
					const isOriginalCurrentLine = isHighlightedLine
						&& !(isAnchorLine && trailingInterludeLine);
					const tracksAnchor = isAnchorLine && !trailingInterludeLine;
					const item = {
						type: "line",
						key: `scroll-inline-${startTime ?? index}-${index}`,
						className: `lyrics-lyricsContainer-LyricsLine lyrics-lyricsContainer-LyricsLine-scrollView ${getKaraokeLineMetaClass(line)}${hasSubLine ? " lyrics-lyricsContainer-LyricsLine-hasSubLine" : ""}${isOriginalCurrentLine ? " lyrics-lyricsContainer-LyricsLine-active" : ""}${tracksAnchor ? " lyrics-lyricsContainer-LyricsLine-scrollCurrent" : ""}`,
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
						isActiveLine: isOriginalCurrentLine,
						trackLineRef: tracksAnchor,
						canSeek: Number.isFinite(startTime),
						karaokeActive: isAnimatingLine,
						effectFocused: isOriginalCurrentLine,
						effectLive: isAnimatingLine || isOriginalCurrentLine,
						karaokePosition: isKara ? playbackState.renderPosition : 0,
						globalCharOffset: globalCharOffsets[index] || 0,
						activeGlobalCharIndex: isAnimatingLine ? activeGlobalCharIndex : -1,
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
							trackLineRef: visualAnchorUsesTrailingInterlude,
							canSeek: false,
							karaokeActive: false,
							effectFocused: false,
							effectLive: false,
							globalCharOffset: 0,
							activeGlobalCharIndex: -1,
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

			const isAnchorLine = lineNumber === activeLineIndex;
			const playbackState = getSyncedLinePlaybackState(playbackWindows[lineNumber], position);
			const isHighlightedLine = isKara ? playbackState.isHighlighted : isAnchorLine;
			const isAnimatingLine = isKara ? playbackState.isAnimating : isAnchorLine;
			let animationIndex = getSyncedAnimationIndex({
				compact,
				isScrolling,
				activeLineIndex: compact && !isScrolling ? visualDisplayLineIndex : visualLineIndex,
				lineNumber: compact && !isScrolling ? displayLineNumber : lineNumber,
				visibleIndex: compactVisibleIndex,
			});
			if (trailingInterludeLine && lineNumber <= activeLineIndex) {
				animationIndex -= 1;
			}
			const visibilityAnimationIndex = compact && !isScrolling
				? displayLineNumber - activeDisplayLineIndex
				: lineNumber - activeLineIndex;
			let className = `lyrics-lyricsContainer-LyricsLine ${getKaraokeLineMetaClass(line)}`;
			const isCurrentRenderedLine = isHighlightedLine
				&& !(isAnchorLine && isTrailingInterludeActive);
			if (isCurrentRenderedLine) {
				className += " lyrics-lyricsContainer-LyricsLine-active";
			}
			const isOutsideVisibleRange = !isHighlightedLine
				&& lineNumber !== visualAnchorLineNumber
				&& shouldHideSyncedLine({
					compact,
					isScrolling,
					animationIndex: visibilityAnimationIndex,
				});
			if (isOutsideVisibleRange) {
				className += " lyrics-lyricsContainer-LyricsLine-paddingLine";
				className += visibilityAnimationIndex < 0
					? " lyrics-lyricsContainer-LyricsLine-paddingBefore"
					: " lyrics-lyricsContainer-LyricsLine-paddingAfter";
			}

			const item = {
				type: "line",
				key: lineNumber,
				className,
				style: stableLineStyles[visibleIndex],
				line,
				startTime,
				originalText,
				mainText,
				subText,
				subText2,
				isActiveLine: isCurrentRenderedLine,
				trackLineRef: !visualAnchorUsesTrailingInterlude && lineNumber === visualAnchorLineNumber,
				canSeek: lineNumber >= leadingEmptyLines && Number.isFinite(startTime),
				karaokeActive: isAnimatingLine,
				effectFocused: !visualAnchorUsesTrailingInterlude
					&& lineNumber === visualAnchorLineNumber,
				// Keep both sides of a pre-centered hand-off alive. The outgoing
				// line can then reach zero effect strength before its animation is
				// detached when activeLineIndex advances.
				effectLive: !visualAnchorUsesTrailingInterlude
					&& (
						isAnimatingLine
						|| lineNumber === activeLineIndex
						|| lineNumber === visualAnchorLineNumber
					),
				karaokePosition: isKara ? playbackState.renderPosition : 0,
				globalCharOffset: lineNumber >= leadingEmptyLines && lineNumber - leadingEmptyLines < globalCharOffsets.length
					? globalCharOffsets[lineNumber - leadingEmptyLines]
					: 0,
				activeGlobalCharIndex: isAnimatingLine ? activeGlobalCharIndex : -1,
				hiddenFromAccessibility: isOutsideVisibleRange,
			};

			if (!trailingInterludeLine || lineNumber !== activeLineIndex) {
				return [item];
			}

			const virtualAnimationIndex = visualAnchorUsesTrailingInterlude ? 0 : -1;
			return [
				item,
				{
					type: "line",
					key: `trailing-interlude-${lineNumber}-${trailingInterludeLine.startTime}`,
					className: `lyrics-lyricsContainer-LyricsLine${isTrailingInterludeActive ? " lyrics-lyricsContainer-LyricsLine-active" : ""}`,
					style: {
						cursor: "default",
						"--position-index": virtualAnimationIndex,
						"--animation-index": Math.abs(virtualAnimationIndex) + 1,
						"--line-shift-duration": isScrolling || suppressLayoutShiftAnimation || usesScriptedCompactLineShift
							? "0s"
							: "var(--iv-lyrics-centering-duration, 300ms)",
						"--line-shift-delay": "0s",
						"--blur-index": 0,
					},
					line: trailingInterludeLine,
					startTime: trailingInterludeLine.startTime,
					originalText: "",
					mainText: "",
					subText: null,
					subText2: null,
					isActiveLine: isTrailingInterludeActive,
					trackLineRef: visualAnchorUsesTrailingInterlude,
					canSeek: false,
					karaokeActive: false,
					effectFocused: false,
					effectLive: false,
					globalCharOffset: 0,
					activeGlobalCharIndex: -1,
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
		paddedLyrics,
		playbackWindows,
		position,
		isScrolling,
		isKara,
		activeDisplayLineIndex,
		visualLineIndex,
		visualDisplayLineIndex,
		compactWindowStartIndex,
		visualAnchorLineNumber,
		visualAnchorUsesTrailingInterlude,
		trailingInterludeKey,
		isTrailingInterludeActive,
		globalCharOffsets,
		activeGlobalCharIndex,
		stableLineStyles,
		suppressLayoutShiftAnimation,
		usesScriptedCompactLineShift,
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
		this.lastTime = 0;
		this.updateFrameInterval();
		// bind를 한 번만 수행하여 메모리 효율성 개선
		if (!this.boundAnimate) {
			this.boundAnimate = this.animate.bind(this);
		}
		this.scheduleNext(false);
	},

	scheduleNext(settingsOpen) {
		if (!this.active) return;

		if (!document.hidden && !settingsOpen && typeof requestAnimationFrame === "function") {
			this.frameId = requestAnimationFrame(this.boundAnimate);
			return;
		}

		this.timerId = setTimeout(
			this.boundAnimate,
			document.hidden || settingsOpen ? 250 : this.frameInterval
		);
	},

	stop() {
		if (this.frameId !== null) {
			cancelAnimationFrame(this.frameId);
			this.frameId = null;
		}
		if (this.timerId !== null) {
			clearTimeout(this.timerId);
			this.timerId = null;
		}
		this.active = false;
		this.lastTime = 0;
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

	animate(timestamp) {
		if (!this.active) return;
		this.frameId = null;
		this.timerId = null;

		const settingsOpen = document.documentElement.classList.contains("ivlyrics-settings-open")
			|| document.body?.classList.contains("ivlyrics-settings-open");
		this.updateFrameInterval();
		if (document.hidden || settingsOpen) {
			this.lastTime = 0;
			this.scheduleNext(settingsOpen);
			return;
		}

		const now = Number.isFinite(timestamp) ? timestamp : performance.now();
		const elapsed = this.lastTime > 0 ? now - this.lastTime : Infinity;
		// requestAnimationFrame timestamps can land a fraction below the nominal
		// interval (16.666 ms vs 16.667 ms). A small tolerance prevents an
		// accidental drop from 60 to 30 fps while still honoring lower FPS limits.
		if (elapsed >= this.frameInterval - 1) {
			for (const callback of this.callbacks) {
				try {
					callback();
				} catch (error) {
					// Error ignored
				}
			}

			this.lastTime = elapsed >= this.frameInterval && Number.isFinite(elapsed)
				? now - (elapsed % this.frameInterval)
				: now;
		}
		this.scheduleNext(false);
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
		currentPos += splitKaraokeGraphemes(plainTextBefore, "ja").length;

		const kanjiChars = splitKaraokeGraphemes(kanjiSequence, "ja");
		if (kanjiChars.length === 1) {
			furiganaMap.set(currentPos, reading);
		} else {
			const readingChars = splitKaraokeGraphemes(reading, "ja");
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
	const lyricsLocale = String(window.Utils?.getDetectedLanguage?.() || "auto");

	if (sourceSyllables.length > 0) {
		sourceSyllables.forEach((syllable, karaokeUnitIndex) => {
			if (!syllable || !syllable.text) return;

			const charArray = splitKaraokeGraphemes(syllable.text || "", lyricsLocale);
			const syllableStart = Number.isFinite(syllable.startTime) ? syllable.startTime : (line.startTime || 0);
			const syllableEnd = Number.isFinite(syllable.endTime) ? syllable.endTime : syllableStart + 500;
			const charDuration = Math.max(1, (syllableEnd - syllableStart) / Math.max(1, charArray.length));

			charArray.forEach((char, charIndex) => {
				const charStart = syllableStart + (charIndex * charDuration);
				timedChars.push({
					char,
					startTime: charStart,
					endTime: charStart + charDuration,
					karaokeUnitIndex,
					...(syllable.inlineStyle === true ? {
						inlineStyle: true,
						styleKind: syllable.styleKind || '',
						styleSpeaker: syllable.styleSpeaker || '',
						styleSpeakerColor: syllable.styleSpeakerColor || '',
						styleSpeakerFallback: syllable.styleSpeakerFallback || ''
					} : null),
				});
			});
		});
	}

	if (timedChars.length > 0) {
		// Some providers emit a base letter and its combining mark as separate
		// timed syllables. Re-segment the complete line so those boundaries cannot
		// detach Arabic harakat, Thai tone marks, Indic vowel signs, or ZWJ emoji.
		return coalesceKaraokeTimedGraphemes(timedChars, lyricsLocale);
	}

	const fallbackChars = splitKaraokeGraphemes(getCopyableText(line?.text) || "", lyricsLocale);
	const { startTime, endTime } = getKaraokeLineBounds(line);
	const totalDuration = Math.max(1, endTime - startTime || 500);
	const charDuration = Math.max(1, totalDuration / Math.max(1, fallbackChars.length || 1));

	return fallbackChars.map((char, index) => ({
		char,
		startTime: startTime + (index * charDuration),
		endTime: startTime + ((index + 1) * charDuration),
		karaokeUnitIndex: index,
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
	const timedCharCount = timedChars.length;

	for (let index = 0; index < timedCharCount; index++) {
		const charInfo = timedChars[index];
		const charStart = Number.isFinite(charInfo?.karaokeFillStartTime)
			? charInfo.karaokeFillStartTime
			: (Number.isFinite(charInfo?.startTime) ? charInfo.startTime : 0);
		const charEnd = Number.isFinite(charInfo?.karaokeFillEndTime)
			? charInfo.karaokeFillEndTime
			: (Number.isFinite(charInfo?.endTime) ? charInfo.endTime : charStart);

		if (position >= charStart && position < charEnd) {
			activeCharIndex = index;
		}

		if (position >= charEnd && charEnd > lastPassedCharEndTime) {
			lastPassedCharEndTime = charEnd;
			lastPassedCharIndex = index;
			lastPassedCharDuration = Math.max(1, charEnd - charStart) || 100;
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

const buildKaraokeVocalRowRenderData = (line, row, includeBounds) => {
	const rowLine = buildKaraokeVocalRowLine(line, row);
	const timedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(rowLine));
	return {
		line: rowLine,
		timedChars,
		bounds: includeBounds ? getKaraokeLineBounds(rowLine) : null,
	};
};

const getKaraokeVocalAnchorLineKey = (line) => [
  line?.startTime ?? "",
  line?.endTime ?? "",
  getCopyableText(line?.originalText ?? line?.text ?? ""),
].join("|");

const getKaraokeVocalAnchorPosition = (vocalRowRenderData, position) => {
  if (!Array.isArray(vocalRowRenderData) || vocalRowRenderData.length === 0 || !Number.isFinite(position)) {
          return -1;
  }

  let firstActiveRowIndex = -1;
  let lastActiveRowIndex = -1;

  for (let rowIndex = 0; rowIndex < vocalRowRenderData.length; rowIndex++) {
          const { timedChars: rowTimedChars, bounds } = vocalRowRenderData[rowIndex];
          const activeCharIndex = getActiveKaraokeTimedCharIndex(rowTimedChars, position);
          const { startTime, endTime } = bounds;
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

const getKaraokeVocalAnchorWindowMs = (vocalRowRenderData, anchorPosition) => {
	if (
		!Array.isArray(vocalRowRenderData)
		|| vocalRowRenderData.length < 2
		|| !Number.isFinite(anchorPosition)
		|| anchorPosition < 0
	) {
		return null;
	}

	const anchorIndex = Math.max(
		0,
		Math.min(vocalRowRenderData.length - 1, Math.round(anchorPosition))
	);
	const anchorStartTime = toFiniteTime(vocalRowRenderData[anchorIndex]?.bounds?.startTime);
	if (anchorStartTime === null) {
		return null;
	}

	for (let rowIndex = anchorIndex + 1; rowIndex < vocalRowRenderData.length; rowIndex++) {
		const nextStartTime = toFiniteTime(vocalRowRenderData[rowIndex]?.bounds?.startTime);
		if (nextStartTime !== null && nextStartTime > anchorStartTime) {
			return nextStartTime - anchorStartTime;
		}
	}

	return null;
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
const KARAOKE_BOUNCE_IDLE = { offsetY: 0, scale: 1, glow: 0, active: false };
// Motion uses the source timing units; character fill and scrolling keep their
// own clocks. Cache preparation by the memoized grapheme array, never per frame.
const karaokeMotionProfileCache = new WeakMap();
const smoothKaraokeMotion = (value) => {
	const x = Math.max(0, Math.min(1, value));
	return x * x * (3 - 2 * x);
};

const createKaraokeMotionProfile = (startTime, endTime, cadence, gap = 0, holdEndTime = endTime) => {
	const calm = smoothKaraokeMotion((cadence - 90) / 230);
	const sustained = smoothKaraokeMotion((holdEndTime - startTime - 700) / 900);
	return {
		startTime,
		endTime: holdEndTime,
		riseDuration: Math.max(1, Math.min(holdEndTime - startTime, 220, 45 + cadence * 0.45)),
		// Stay within the parent's existing 820 ms outgoing-row lifetime.
		releaseDuration: Math.min(700, 110 + 220 * calm + 100 * sustained + Math.min(800, Math.max(0, gap)) * 0.25 * calm),
		amplitude: 1.1 + 3.9 * calm + sustained * 0.6,
		scaleAmount: 0.006 + 0.024 * calm,
		glow: 0.035 + 0.105 * calm + 0.025 * sustained,
	};
};

const getKaraokeMotionProfile = (timedChars, startIndex, charCount = 1) => {
	if (!Array.isArray(timedChars) || !timedChars[startIndex]) return null;
	let cached = karaokeMotionProfileCache.get(timedChars);
	if (!cached) {
		const units = [];
		const byChar = new Array(timedChars.length);
		const sourceBounds = new Map();
		timedChars.forEach((charInfo, index) => {
			if (!Number.isFinite(charInfo?.startTime) || !Number.isFinite(charInfo?.endTime)) return;
			const key = charInfo.karaokeUnitIndex ?? index;
			const bounds = sourceBounds.get(key) || { start: Infinity, end: -Infinity, groups: 0 };
			bounds.start = Math.min(bounds.start, charInfo.startTime);
			bounds.end = Math.max(bounds.end, charInfo.endTime);
			sourceBounds.set(key, bounds);
		});
		let current = null;
		timedChars.forEach((charInfo, index) => {
			if (!charInfo || !/\S/u.test(charInfo.char || "")) {
				current = null;
				return;
			}
			const start = charInfo.startTime;
			const end = charInfo.endTime;
			if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return;
			const unitKey = charInfo.karaokeUnitIndex ?? index;
			if (!current || current.key !== unitKey) {
				current = { key: unitKey, start, end, count: 0 };
				units.push(current);
				sourceBounds.get(unitKey).groups++;
			}
			current.start = Math.min(current.start, start);
			current.end = Math.max(current.end, end);
			current.count++;
			byChar[index] = current;
		});
		units.forEach((unit) => {
			const source = sourceBounds.get(unit.key);
			// A trailing space belongs to its source syllable's duration. Do not
			// extend separate words when a provider times a whole phrase as one unit.
			if (source.groups === 1) {
				unit.start = source.start;
				unit.end = source.end;
			}
			// Normalize long words without treating every Latin letter as a beat.
			unit.cadence = (unit.end - unit.start) / Math.sqrt(unit.count);
		});
		units.forEach((unit, index) => {
			let sum = 0;
			let count = 0;
			let lastStart = NaN;
			for (let i = Math.max(0, index - 2); i <= Math.min(units.length - 1, index + 2); i++) {
				const neighbor = units[i];
				// Some sources repeat one onset across several text fragments.
				if (neighbor.start === lastStart) continue;
				lastStart = neighbor.start;
				sum += Math.min(600, neighbor.cadence);
				count++;
			}
			unit.localCadence = unit.cadence * 0.75 + (sum / Math.max(1, count)) * 0.25;
			unit.gap = Math.max(0, (units[index + 1]?.start ?? unit.end) - unit.end);
		});
		cached = { byChar, profiles: new Map() };
		karaokeMotionProfileCache.set(timedChars, cached);
	}
	const key = `${startIndex}:${charCount}`;
	if (cached.profiles.has(key)) return cached.profiles.get(key);
	const first = timedChars[startIndex];
	const unit = cached.byChar[startIndex];
	if (!unit) return null;
	const lastIndex = Math.min(timedChars.length - 1, startIndex + Math.max(1, charCount) - 1);
	const start = Number.isFinite(first.karaokeFillStartTime) ? first.karaokeFillStartTime : first.startTime;
	let end = start;
	let cadence = 0;
	let count = 0;
	for (let index = startIndex; index <= lastIndex; index++) {
		const charInfo = timedChars[index];
		if (!charInfo) continue;
		const charEnd = Number.isFinite(charInfo.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo.endTime;
		if (Number.isFinite(charEnd)) end = Math.max(end, charEnd);
		if (cached.byChar[index]) {
			cadence += cached.byChar[index].localCadence;
			count++;
		}
	}
	// Only compact source units sustain their characters together. A provider's
	// whole-line timing must not leave dozens of previously sung glyphs floating.
	const sustain = charCount === 1 && unit.count <= 24
		? smoothKaraokeMotion((unit.end - unit.start - 750) / 650)
			* smoothKaraokeMotion((unit.cadence - 170) / 200)
		: 0;
	const lastUnit = cached.byChar[lastIndex] || unit;
	const wholeUnit = unit === lastUnit && charCount >= unit.count;
	const holdEnd = wholeUnit ? Math.max(end, unit.end) : end + Math.max(0, unit.end - end) * sustain;
	const gap = holdEnd >= lastUnit.end ? lastUnit.gap : 0;
	const profile = createKaraokeMotionProfile(start, end, cadence / Math.max(1, count), gap, holdEnd);
	cached.profiles.set(key, profile);
	return profile;
};

const getKaraokeCharFill = (position, isActive, startTime, endTime, isComplete = false) => {
	if (isComplete) {
		return 1;
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

const getKaraokeBounceValues = (position, isActive, startTime, endTime, attenuation = 1, motionProfile = null) => {
	if (!CONFIG.visual["karaoke-bounce"] || !Number.isFinite(position)) return KARAOKE_BOUNCE_IDLE;
	const profile = motionProfile || createKaraokeMotionProfile(startTime, endTime, endTime - startTime);
	if (!Number.isFinite(profile.startTime) || !Number.isFinite(profile.endTime)
		|| position < profile.startTime || position >= profile.endTime + profile.releaseDuration
		|| prefersReducedLyricsMotion()) return KARAOKE_BOUNCE_IDLE;

	// A completed syllable can still settle after the next row takes the scroll
	// anchor. Its own playback window, not global character distance, owns motion.
	const strength = position < profile.endTime
		? smoothKaraokeMotion((position - profile.startTime) / profile.riseDuration)
		: 1 - smoothKaraokeMotion((position - profile.endTime) / profile.releaseDuration);
	const offsetY = Math.round(-profile.amplitude * strength * 4) / 4;
	const scale = Math.round((1 + profile.scaleAmount * strength) * 500) / 500;
	const glow = CONFIG.visual["karaoke-text-effects"] === false ? 0
		: Math.round(profile.glow * strength * 50) / 50;
	if (offsetY === 0 && scale === 1 && glow === 0) return KARAOKE_BOUNCE_IDLE;
	return { offsetY, scale, glow, active: true };
};

const getKaraokeWordBounceValues = (position, isActive, startTime, endTime, attenuation = 1, motionProfile = null) => (
	getKaraokeBounceValues(position, isActive, startTime, endTime, attenuation, motionProfile)
);

const KaraokeLine = react.memo(({ line, position, isActive, isEffectFocused = isActive, isEffectLive = isActive || isEffectFocused, settingsRevision = 0, globalCharOffset = 0, activeGlobalCharIndex = -1, phonetic = null, translation = null, furiganaMapOverride = null, culturalAnnotations = [], renderGranularity = null }) => {
  if (!line) {
          return "";
  }

  const wordTimed = renderGranularity
	? renderGranularity === "word"
	: line.karaokeGranularity === "word";

	const lyricsLocale = String(window.Utils?.getDetectedLanguage?.() || "auto");
	const speakerColors = window.ivLyricsSpeakerColors;
	const creatorSpeakerColorEnabled = line.vocals
		? (speakerColors?.isCreatorColorEnabled?.()
			?? (CONFIG?.visual?.["sync-data-custom-speaker-colors-enabled"] !== false))
		: false;
	// Playback only changes the active row and fill. Keep each child line stable
	// so its own character/furigana preparation can survive playback updates.
	const vocalRows = useMemo(() => getKaraokeVocalRows(line), [
		line, line.vocals, settingsRevision, creatorSpeakerColorEnabled,
		speakerColors, speakerColors?.getPresentation,
		speakerColors?.[PAGES_IV_LYRICS_SPEAKER_CLASS_CONTRACT],
	]);
  const shouldUseVocalRowAnchor = isActive
          && Array.isArray(vocalRows)
          && vocalRows.length >= KARAOKE_VOCAL_STACK_CENTER_THRESHOLD;
	const vocalRowRenderData = useMemo(() => Array.isArray(vocalRows)
		? vocalRows.map((row) => ({
			...buildKaraokeVocalRowRenderData(line, row, shouldUseVocalRowAnchor),
			charCount: getKaraokeSyllableCharCount(row.syllables),
		}))
		: null, [line, vocalRows, shouldUseVocalRowAnchor, lyricsLocale, window.LyricsWordSegmenter?.segmentGraphemes]);
  const vocalAnchorStateRef = useRef({ lineKey: null, anchorPosition: -1, lastPlaybackPosition: NaN });
  const nextVocalAnchorPosition = shouldUseVocalRowAnchor
          ? getKaraokeVocalAnchorPosition(vocalRowRenderData, position)
          : -1;
  const activeVocalAnchorPosition = shouldUseVocalRowAnchor
          ? getStableKaraokeVocalAnchorPosition(vocalAnchorStateRef, line, position, nextVocalAnchorPosition)
          : -1;
  const activeVocalRowIndex = Number.isFinite(activeVocalAnchorPosition) && activeVocalAnchorPosition >= 0
          ? Math.round(activeVocalAnchorPosition)
          : -1;
  const activeVocalAnchorWindowMs = shouldUseVocalRowAnchor
          ? getKaraokeVocalAnchorWindowMs(vocalRowRenderData, activeVocalAnchorPosition)
          : null;

  if (vocalRows) {
          const rowPhonetics = splitLineByVocalRowShape(phonetic, vocalRows);
          const rowTranslations = splitLineByVocalRowShape(translation, vocalRows);
          const hasRowPhoneticSubline = vocalRows.some((row, rowIndex) => row.phonetic || rowPhonetics[rowIndex]);
		const hasRowTranslationSubline = vocalRows.some((row, rowIndex) => row.translation || rowTranslations[rowIndex]);
		const stackPhonetic = !hasRowPhoneticSubline && typeof phonetic === "string" ? phonetic.trim() : "";
		const stackTranslation = !hasRowTranslationSubline && typeof translation === "string" ? translation.trim() : "";
		const culturalAnnotationsByRow = vocalRows.map(() => []);
		for (const annotation of culturalAnnotations) {
			const matchingRowIndex = vocalRowRenderData.findIndex(({ line: rowLine }) =>
				annotation.expression &&
				getCopyableText(rowLine.originalText || rowLine.text).includes(annotation.expression)
			);
			const rowIndex = matchingRowIndex >= 0 ? matchingRowIndex : vocalRows.length - 1;
			culturalAnnotationsByRow[rowIndex].push(annotation);
		}
          let rowGlobalCharOffset = globalCharOffset;
		  const stackChildren = vocalRows.map((row, rowIndex) => {
                  const rowRenderData = vocalRowRenderData[rowIndex];
			const rowLine = rowRenderData.line;
			const rowHasInlineEffects = Array.isArray(row.syllables)
				&& row.syllables.some(syllable => (
					syllable?.inlineStyle === true
					&& KARAOKE_TEXT_EFFECT_KIND_CLASSES.has(String(syllable?.styleKind || "").trim().toLowerCase())
				));
                  const classParts = [
                          "lyrics-karaoke-part",
                          row.role === "background" ? "background" : "lead",
						  ...(rowHasInlineEffects ? [] : getKaraokeKindClassParts(row.kind || "vocal")),
                          shouldUseVocalRowAnchor && rowIndex === activeVocalRowIndex ? "active-vocal-row" : "",
                          row.speakerClass ? `speaker-${row.speakerClass}` : "",
                  ].filter(Boolean);
                  const currentOffset = rowGlobalCharOffset;
                  rowGlobalCharOffset += rowRenderData.charCount;
			const rowTimedChars = rowRenderData.timedChars;
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
					isEffectFocused,
					isEffectLive,
					settingsRevision,
					globalCharOffset: currentOffset,
					activeGlobalCharIndex: rowActiveGlobalCharIndex,
					culturalAnnotations: culturalAnnotationsByRow[rowIndex],
					renderGranularity,
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
                          "data-karaoke-vocal-anchor-window-ms": Number.isFinite(activeVocalAnchorWindowMs)
                                  ? Math.round(activeVocalAnchorWindowMs)
                                  : undefined,
                          "data-active-karaoke-vocal-row-index": shouldUseVocalRowAnchor ? activeVocalRowIndex : undefined,
                  },
                  stackChildren
          );
  }

	const furiganaEnabled = CONFIG?.visual?.["furigana-enabled"] === true;
	const furiganaReady = window.FuriganaConverter?.isAvailable?.() === true;
	const { furiganaMap, timedChars, motionProfiles, endTime, wrapByWord, textDirection, useTextRun, preserveInlineStyles } = useMemo(() => {
		const sourceSyllables = Array.isArray(line.syllables) && line.syllables.length > 0
			? line.syllables
			: getTimedSyllablesFromLine(line);
		const rawLineText = sourceSyllables.map((syllable) => syllable?.text || "").join("")
			|| getCopyableText(line.text)
			|| "";
		const processedText = furiganaMapOverride instanceof Map
			? ""
			: Utils.applyFuriganaIfEnabled(rawLineText);
		const compensatedTimedChars = applyKaraokeWhitespaceCompensation(buildKaraokeTimedChars(line));
		const detectedTextDirection = getKaraokeTextDirection(rawLineText);

		const renderTimedChars = wordTimed
			? assignKaraokeWordIndexes(compensatedTimedChars, line.karaokeGranularity === "word", lyricsLocale)
			: compensatedTimedChars;

		return {
			furiganaMap: furiganaMapOverride instanceof Map
				? furiganaMapOverride
				: buildKaraokeFuriganaMap(processedText),
			timedChars: renderTimedChars,
			motionProfiles: renderTimedChars.map((_, index) => getKaraokeMotionProfile(renderTimedChars, index)),
			endTime: compensatedTimedChars.reduce(
				(maxEndTime, charInfo) => Math.max(maxEndTime, Number.isFinite(charInfo?.endTime) ? charInfo.endTime : 0),
				getKaraokeLineBounds(line).endTime
			),
			wrapByWord: shouldWrapKaraokeByWord(rawLineText),
			textDirection: detectedTextDirection,
			useTextRun: shouldUseKaraokeTextRun(rawLineText),
			preserveInlineStyles: !KARAOKE_JOINING_SCRIPT_REGEX.test(rawLineText),
		};
	}, [line, furiganaEnabled, furiganaReady, furiganaMapOverride, wordTimed, lyricsLocale]);
	// Keep completed glyphs on the active paint path while the parent line fades
	// out. Gating this by isActive made the fill disappear in a single frame at
	// every line hand-off.
	const isComplete = endTime > 0 && position >= endTime;
	const timedText = timedChars.map(charInfo => String(charInfo?.char || "")).join("");
	const wordStartTimes = new Map();
	if (wordTimed) {
		timedChars.forEach((charInfo) => {
			const wordIndex = Number.isInteger(charInfo?.karaokeWordIndex)
				? charInfo.karaokeWordIndex
				: null;
			if (wordIndex === null) return;
			const startTime = Number.isFinite(charInfo?.karaokeFillStartTime)
				? charInfo.karaokeFillStartTime
				: charInfo?.startTime;
			if (!Number.isFinite(startTime)) return;
			wordStartTimes.set(
				wordIndex,
				Math.min(wordStartTimes.get(wordIndex) ?? Infinity, startTime)
			);
		});
	}
	const culturalMarkersByCharIndex = new Map();
	const fallbackCulturalAnnotations = [];
	for (const annotation of culturalAnnotations) {
		const expressionStart = annotation.expression
			? timedText.indexOf(annotation.expression)
			: -1;
		if (useTextRun || expressionStart < 0) {
			fallbackCulturalAnnotations.push(annotation);
			continue;
		}

		const expressionEnd = expressionStart + annotation.expression.length;
		let textOffset = 0;
		let markerCharIndex = -1;
		for (let index = 0; index < timedChars.length; index += 1) {
			textOffset += String(timedChars[index]?.char || "").length;
			if (textOffset >= expressionEnd) {
				markerCharIndex = index;
				break;
			}
		}
		if (markerCharIndex < 0) {
			fallbackCulturalAnnotations.push(annotation);
			continue;
		}

		const markers = culturalMarkersByCharIndex.get(markerCharIndex) || [];
		markers.push(annotation);
		culturalMarkersByCharIndex.set(markerCharIndex, markers);
	}

	const charElements = useTextRun ? [] : timedChars.map((charInfo, index) => {
		const wordIndex = Number.isInteger(charInfo?.karaokeWordIndex)
			? charInfo.karaokeWordIndex
			: null;
		const wordStartTime = wordIndex === null ? null : wordStartTimes.get(wordIndex);
		const fillRatio = wordTimed
			? getKaraokeInstantWordFill(
				{ startTime: Number.isFinite(wordStartTime) ? wordStartTime : charInfo?.startTime },
				position,
				isActive,
				isComplete
			) / 100
			: getKaraokeCharFill(
				position,
				isActive,
				Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo.startTime,
				Number.isFinite(charInfo?.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo.endTime,
				isComplete
			);
		const charState = fillRatio <= 0 ? "pending" : fillRatio >= 1 ? "done" : "active";
		const bounce = wordTimed || !motionProfiles[index] ? KARAOKE_BOUNCE_IDLE : getKaraokeBounceValues(
			position,
			isActive,
			Number.isFinite(charInfo?.karaokeFillStartTime) ? charInfo.karaokeFillStartTime : charInfo.startTime,
			Number.isFinite(charInfo?.karaokeFillEndTime) ? charInfo.karaokeFillEndTime : charInfo.endTime,
			1,
			motionProfiles[index]
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
			karaokeStyle["--karaoke-motion-glow"] = bounce.glow;
		}
		const className = getCachedKaraokeStateClassName(
			KARAOKE_CHAR_STATE_CLASS_NAMES,
			charState,
			bounce.active,
			isComplete
		);
		const charNode = react.createElement(
			"span",
			{
				className,
				style: karaokeStyle,
				"data-outline-text": charInfo.char,
				key: `karaoke-char-${index}`,
			},
			react.createElement(
				"span",
				{ className: "lyrics-karaoke-glyph-fill" },
				charInfo.char
			)
		);
		const reading = furiganaMap.get(index);

		let renderedCharNode = reading
			? react.createElement(
				"ruby",
				{
					className: `lyrics-karaoke-ruby lyrics-karaoke-ruby--${charState}`,
					style: karaokeStyle,
					key: `karaoke-ruby-${index}`,
				},
				charNode,
				react.createElement("rt", null, reading)
			)
			: charNode;
		const culturalMarkers = culturalMarkersByCharIndex.get(index) || [];
		if (culturalMarkers.length === 0) {
			return renderedCharNode;
		}

		return react.createElement(
			react.Fragment,
			{ key: `karaoke-cultural-marker-${index}` },
			renderedCharNode,
			culturalMarkers.map((annotation) => react.createElement(
				"sup",
				{
					key: `karaoke-cultural-marker-${index}-${annotation.marker}`,
					className: "lyrics-cultural-marker",
				},
				`[${annotation.marker}]`
			))
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
			activeGlobalCharIndex,
			wordTimed,
			preserveInlineStyles
		)
		: (wrapByWord || wordTimed)
		? buildKaraokeWordElements(timedChars, charElements, {
			position,
			isActive,
			isComplete,
			globalCharOffset,
			activeGlobalCharIndex,
			wordTimed,
		})
		: wrapKaraokeInlineStyleRuns(timedChars, charElements);

	return react.createElement(
		"span",
		{
			className: `lyrics-karaoke-line${wrapByWord || wordTimed || useTextRun ? " has-word-wrap" : ""}${wordTimed ? " is-word-timed" : ""}${useTextRun ? " is-text-run" : ""}${textDirection === "rtl" ? " is-rtl" : ""}${isActive ? " is-active" : ""}${isEffectLive ? " is-effect-live" : ""}${isEffectFocused ? " is-effect-focused" : ""}${isComplete ? " is-complete" : ""}`,
			dir: useTextRun ? (textDirection === "rtl" ? "ltr" : textDirection) : undefined,
		},
		lineChildren,
		fallbackCulturalAnnotations.map((annotation) => react.createElement(
				"sup",
				{
					key: `karaoke-cultural-fallback-${annotation.marker}`,
					className: "lyrics-cultural-marker",
				},
				`[${annotation.marker}]`
			))
	);
});

const SyncedLyricsPage = react.memo(({ lyrics = [], provider, contributors, copyright, isKara, karaokeSource = null, karaokeRenderGranularity = null, reRenderLyricsPage = null }) => {
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
			tabIndex: 0,
			role: "region",
			"aria-label": I18n.t("lyricsTitle") || "Synced lyrics",
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
                          karaokeRenderGranularity,
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
	const renderItems = useMemo(() => lyricsArray.map((line, index) => {
		const { text, originalText, text2 } = getEmbeddedAuxiliaryDisplayValues(line);
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
			culturalNote: line?.culturalNote || null,
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
				culturalNote: item.culturalNote,
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
			contributors: lyricsContainer.state.contributors,
			syncType: lyricsContainer.state.syncType,
			syncPoints: lyricsContainer.state.syncPoints
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
	wordMode = 3,
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
	syncType = null,
	syncPoints = null,
	syncTypeBreakdown = null,
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

		if ((mode === karaokeMode || mode === wordMode) && karaoke) {
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
					karaokeRenderGranularity: mode === wordMode ? "word" : "character",
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
		wordMode,
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
		syncType,
		syncPoints,
		syncTypeBreakdown,
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
			syncType,
			syncPoints,
		})
	);
});

window.LyricsPageRenderer = LyricsPageRenderer;
window.ivLyricsLyricRendererPrimitives = Object.freeze({
	LyricsLineBlock,
	IdlingIndicator,
	useLyricsPlaybackPosition,
	getPseudoKaraokeRenderAdvance,
	prepareGlobalCharTimeline,
	queryGlobalCharTimeline,
	EMPTY_GLOBAL_CHAR_STATE,
	getInterludeInfo,
	createActiveTrailingKaraokeInterludeLine,
	getEmbeddedAuxiliaryDisplayValues,
	buildLyricDisplayState,
	getKaraokeLineMetaClass,
	getKaraokeSpeakerStyle,
});
