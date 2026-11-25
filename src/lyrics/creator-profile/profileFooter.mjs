import {
	CREATOR_PROFILE_PAGE_SIZE,
	getCreatorDecorationStyle,
	getDisplayContributors,
	mergeCreatorProfileContributions,
	normalizeCreatorGreetingLocale,
	prepareCreatorGreetingTranslationState,
	shouldFetchCreatorGreetingTranslation,
} from "./profileData.mjs";
import { createCreatorTrackCover, createCreatorTrackRow, createSyncScoreBadge } from "./profileTracks.mjs";

import { createCreatorProfileModal } from "./profileModal.mjs";

export function createCreatorProfileFooter({
	react, translate, profileApi, notify, fetchCover, getPlaylistPickerButton,
	readTheme, writeTheme, prefersLightTheme, getLocaleCandidates, getDefaultLocale,
	getReactDOM, getPortalBody, listenForKeyDown, openTrack,
}) {
	const { useState, useMemo, useEffect, useRef, useCallback } = react;

	const getCreatorProfileCopy = () => buildCreatorProfileCopy(translate);

	function getCreatorProfileLocale() {
		const candidates = getLocaleCandidates();

		for (const candidate of candidates) {
			const locale = normalizeCreatorGreetingLocale(candidate);
			if (locale) {
				return locale;
			}
		}

		return normalizeCreatorGreetingLocale(getDefaultLocale()) || "ko";
	}

	const prepareGreeting = (profileData, locale, currentProfile = null) => (
		prepareCreatorGreetingTranslationState(profileData, locale, currentProfile, getCreatorProfileLocale)
	);
	const SyncScoreBadge = createSyncScoreBadge({ react, getPointsLabel: () => translate("creatorProfile.pointsShort") || "pts" });
	const CreatorProfileTrackCover = createCreatorTrackCover({ react, fetchCover });
	const CreatorProfileTrackRow = createCreatorTrackRow({ react, CreatorProfileTrackCover, SyncScoreBadge, getPlaylistPickerButton });

	const SyncCreatorProfileModal = createCreatorProfileModal({
		react, getCreatorProfileCopy, getCreatorProfileLocale, readTheme, writeTheme, prefersLightTheme,
		CreatorProfileTrackRow, getDecorationDefaults: profileApi.getCreatorDecorationDefaults,
		warn: notify.warning,
	});

	const CreditFooter = react.memo(({ provider, contributors }) => {
		const copy = getCreatorProfileCopy();
		const reactDom = getReactDOM();
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
				.filter((contributor) => contributor.linked && profileApi.isDiscordUserHash(contributor.userHash))
				.map((contributor) => contributor.userHash);
			if (!discordIds.length) return undefined;

			let cancelled = false;
			Promise.all(discordIds.map(async (userHash) => {
					try {
						return [userHash, await profileApi.fetchDiscordSupportTier(userHash)];
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

			return listenForKeyDown(onKeyDown);
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
				const result = await profileApi.fetchSyncCreatorGreetingTranslation(profileData.userHash, locale);
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
				const data = await profileApi.fetchSyncCreatorProfile(contributor.userHash, {
					limit: CREATOR_PROFILE_PAGE_SIZE,
					offset,
					artist
				});
				if (requestIdRef.current !== requestId) {
					return;
				}

				const profileLocale = getCreatorProfileLocale();
				const dataWithInitialGreetingState = prepareGreeting(data, profileLocale);
				setCreatorProfile((currentProfile) => {
					const dataWithGreetingState = prepareGreeting(data, profileLocale, currentProfile);
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
					notify.error(error.message || copy.loadFailed);
					return;
				}
				if (append) {
					notify.error(error.message || copy.loadFailed);
				} else if (preserveProfile) {
					notify.error(error.message || copy.loadFailed);
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
				notify.error(copy.likeLoginRequired);
				return;
			}

			setLikePending(true);
			try {
				const result = await profileApi.setSyncCreatorLike(creatorProfile.userHash, !creatorProfile.viewer?.liked);
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
				notify.error(error.message || copy.likeActionFailed);
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
				const result = await profileApi.setSyncCreatorGreeting(nextGreeting, {
					creatorUserHash: creatorProfile.userHash
				});
				const savedGreeting = typeof result?.greeting === "string" ? result.greeting : "";
				const savedGreetingLang = typeof result?.greetingLang === "string" ? result.greetingLang : null;
				const profileLocale = getCreatorProfileLocale();
				const nextGreetingState = prepareGreeting({
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
				notify.success(copy.greetingSaveSuccess);
				return result;
			} catch (error) {
				notify.error(error.message || copy.greetingSaveFailed);
				throw error;
			} finally {
				setGreetingPending(false);
			}
		}, [copy.greetingSaveFailed, copy.greetingSaveSuccess, creatorProfile, loadCreatorGreetingTranslation]);

		const handleSaveDecoration = useCallback(async (decoration) => {
			if (!activeContributor?.userHash) return;
			setDecorationPending(true);
			try {
				const result = await profileApi.saveOwnCreatorDecoration(decoration);
				profileApi.setCachedDiscordSupportTier(activeContributor.userHash, result.tier);
				setSupportByUserHash((current) => ({
					...current,
					[activeContributor.userHash]: { tier: result.tier, decoration: result.decoration }
				}));
				notify.success(copy.decorationSaved);
			} catch (error) {
				const message = error?.code === "monthly_supporter_required"
					? copy.monthlyOnlyGradient
					: error?.code === "supporter_required"
						? copy.supportRoleNotFound
						: copy.decorationSaveFailed;
				notify.error(message);
			} finally {
				setDecorationPending(false);
			}
		}, [activeContributor, copy.decorationSaveFailed, copy.decorationSaved]);

		const handleResetDecoration = useCallback(async () => {
			if (!activeContributor?.userHash) return;
			setDecorationPending(true);
			try {
				await profileApi.resetOwnCreatorDecoration();
				setSupportByUserHash((current) => ({
					...current,
					[activeContributor.userHash]: {
						tier: current[activeContributor.userHash]?.tier || "none",
						decoration: null
					}
				}));
				notify.success(copy.decorationReset);
			} catch (error) {
				notify.error(error?.message || copy.decorationSaveFailed);
			} finally {
				setDecorationPending(false);
			}
		}, [activeContributor, copy.decorationReset, copy.decorationSaveFailed]);

		const handleRefreshSupport = useCallback(async () => {
			if (!activeContributor?.userHash) return;
			setDecorationPending(true);
			try {
				const tier = await profileApi.fetchDiscordSupportTier(activeContributor.userHash, { forceRefresh: true });
				setSupportByUserHash((current) => ({
					...current,
					[activeContributor.userHash]: {
						tier,
						decoration: current[activeContributor.userHash]?.decoration || null
					}
				}));
			} catch (error) {
				notify.error(copy.supportRoleRefreshFailed);
			} finally {
				setDecorationPending(false);
			}
		}, [activeContributor, copy.supportRoleRefreshFailed]);

		const handleTrackClick = useCallback((trackId) => {
			if (!trackId) {
				return;
			}

			closeProfile();
			openTrack(trackId);
		}, [closeProfile]);

		if (!provider) {
			return null;
		}

		const renderFooter = () => react.createElement(
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
						translate("misc.lyricsProvider") || "Lyrics Provider"
					),
						react.createElement(
							"span",
							{ className: "lyrics-credit-footer-value" },
							provider === "open-lyrics" ? "Open Lyrics" : provider
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
							translate("misc.syncContributor") || "Sync Contributor"
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

		const footer = renderFooter();

		const renderCreatorProfileModal = () => {
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
			return activeContributor
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
		};

		const modal = renderCreatorProfileModal();

		return react.createElement(
			react.Fragment,
			null,
			footer,
			modal && reactDom?.createPortal && getPortalBody()
				? reactDom.createPortal(modal, getPortalBody())
				: modal
		);
	});

	return CreditFooter;
}

function buildCreatorProfileCopy(translate) {
	return {
		title: translate("creatorProfile.title") || "Sync Creator",
		anonymous: translate("creatorProfile.anonymous") || "Anonymous",
		openProfile: translate("creatorProfile.openProfile") || "Open creator profile",
		loading: translate("creatorProfile.loading") || "Loading creator profile...",
		loadFailed: translate("creatorProfile.loadFailed") || "Failed to load creator profile.",
		back: translate("creatorProfile.back") || "Back",
		themeDark: translate("settingsUi.theme.darkShort") || "Dark",
		themeLight: translate("settingsUi.theme.lightShort") || "Light",
		switchToDark: translate("settingsUi.theme.dark") || "Switch to dark mode",
		switchToLight: translate("settingsUi.theme.light") || "Switch to light mode",
		contributions: translate("creatorProfile.contributions") || "Sync Contributions",
		tracks: translate("creatorProfile.tracks") || "Synced tracks",
		points: translate("creatorProfile.points") || "Contribution points",
		pointsShort: translate("creatorProfile.pointsShort") || "pts",
		likes: translate("creatorProfile.likes") || "Likes",
		like: translate("creatorProfile.like") || "Like",
		liked: translate("creatorProfile.liked") || "Liked",
		likeActionFailed: translate("creatorProfile.likeActionFailed") || "Failed to update creator like.",
		likeLoginRequired: translate("creatorProfile.likeLoginRequired") || "Discord login is required to like creators.",
		addGreeting: translate("creatorProfile.addGreeting") || "Add greeting",
		editGreeting: translate("creatorProfile.editGreeting") || "Edit greeting",
		saveGreeting: translate("creatorProfile.saveGreeting") || "Save",
		cancelGreeting: translate("creatorProfile.cancelGreeting") || "Cancel",
		greetingPlaceholder: translate("creatorProfile.greetingPlaceholder") || "Write a greeting for your profile.",
		greetingSaveFailed: translate("creatorProfile.greetingSaveFailed") || "Failed to update creator greeting.",
		greetingSaveSuccess: translate("creatorProfile.greetingSaveSuccess") || "Greeting updated.",
		ownProfile: translate("creatorProfile.ownProfile") || "This is your profile.",
		loadMore: translate("creatorProfile.loadMore") || "Load more",
		loadingMore: translate("creatorProfile.loadingMore") || "Loading more...",
		noContributions: translate("creatorProfile.noContributions") || "No sync contributions yet.",
		unknownTrack: translate("creatorProfile.unknownTrack") || "Unknown Track",
		updated: translate("creatorProfile.updated") || "Updated",
		topArtists: translate("creatorProfile.topArtists") || "Top Artists",
		artistGroups: translate("creatorProfile.artistGroups") || "Artist Groups",
		noArtistStats: translate("creatorProfile.noArtistStats") || "No artist stats yet.",
		clearArtistFilter: translate("creatorProfile.clearArtistFilter") || "Clear artist filter",
		filteredArtist: translate("creatorProfile.filteredArtist") || "Filtered artist",
		supporter: translate("creatorProfile.supporter") || "Supporter",
		monthlySupporter: translate("creatorProfile.monthlySupporter") || "Monthly Supporter",
		nicknameStyle: translate("creatorProfile.nicknameStyle") || "Nickname style",
		nicknameStyleDesc: translate("creatorProfile.nicknameStyleDesc") || "This color is used for your name in the sync creator credit below the lyrics.",
		solid: translate("creatorProfile.solid") || "Solid",
		gradient: translate("creatorProfile.gradient") || "Gradient",
		solidColor: translate("creatorProfile.solidColor") || "Solid color",
		gradientStart: translate("creatorProfile.gradientStart") || "Start color",
		gradientEnd: translate("creatorProfile.gradientEnd") || "End color",
		gradientAngle: translate("creatorProfile.gradientAngle") || "Gradient angle",
		decorationPreview: translate("creatorProfile.decorationPreview") || "Preview",
		saveDecoration: translate("creatorProfile.saveDecoration") || "Save color",
		resetDecoration: translate("creatorProfile.resetDecoration") || "Reset to default",
		refreshSupportRole: translate("creatorProfile.refreshSupportRole") || "Refresh supporter role",
		supportRoleNotFound: translate("creatorProfile.supportRoleNotFound") || "No supporter role was found. Refresh after your Discord role is assigned.",
		monthlyOnlyGradient: translate("creatorProfile.monthlyOnlyGradient") || "Gradients are available to Monthly Supporters only.",
		decorationSaved: translate("creatorProfile.decorationSaved") || "Nickname color saved.",
		decorationReset: translate("creatorProfile.decorationReset") || "Nickname color reset.",
		decorationSaveFailed: translate("creatorProfile.decorationSaveFailed") || "Failed to save nickname color.",
		supportRoleRefreshFailed: translate("creatorProfile.supportRoleRefreshFailed") || "Failed to refresh supporter role."
	};
}
