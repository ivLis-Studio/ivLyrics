function normalizePublicSyncType(value) {
	const normalized = String(value || "").trim().toLowerCase();
	return ["line", "word", "character", "mixed"].includes(normalized) ? normalized : "unknown";
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
		syncPoints: contributor.syncPoints != null && Number.isFinite(Number(contributor.syncPoints)) ? Number(contributor.syncPoints) : null
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

function getCreatorGreetingTranslatingMessage(locale) {
	const normalizedLocale = normalizeCreatorGreetingLocale(locale);
	return CREATOR_GREETING_TRANSLATING_MESSAGES[normalizedLocale]
		|| CREATOR_GREETING_TRANSLATING_MESSAGES.en;
}

function prepareCreatorGreetingTranslationState(profileData, locale, currentProfile, getFallbackLocale) {
	if (!profileData || typeof profileData !== "object") {
		return profileData;
	}

	const targetLocale = normalizeCreatorGreetingLocale(locale) || getFallbackLocale();
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

export {
	CREATOR_PROFILE_PAGE_SIZE,
	formatContributorTimestamp,
	getCreatorDecorationStyle,
	getCreatorGreetingTranslatingMessage,
	getCreatorPublicProfileUrl,
	getDisplayContributors,
	mergeCreatorProfileContributions,
	normalizeCreatorGreetingLocale,
	prepareCreatorGreetingTranslationState,
	shouldFetchCreatorGreetingTranslation,
};
