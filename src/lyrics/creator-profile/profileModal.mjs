import {
	getCreatorDecorationStyle,
	getCreatorGreetingTranslatingMessage,
	getCreatorPublicProfileUrl,
} from "./profileData.mjs";

export function createCreatorProfileModal({
	react, getCreatorProfileCopy, getCreatorProfileLocale,
	readTheme, writeTheme, prefersLightTheme, getDecorationDefaults, warn, CreatorProfileTrackRow,
}) {
	function getSupportBadgeLabel(tier, copy) {
		if (tier === "monthly") return copy.monthlySupporter;
		if (tier === "supporter") return copy.supporter;
		return "";
	}

	function getCreatorProfileUiTheme() {
		try {
			const storedTheme = readTheme();
			if (storedTheme === "light" || storedTheme === "dark") {
				return storedTheme;
			}

			return prefersLightTheme()
				? "light"
				: "dark";
		} catch (error) {
			return "dark";
		}
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
		const defaults = getDecorationDefaults();
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
				warn(copy.monthlyOnlyGradient);
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
		// Only one contribution row shows its playlist menu at a time.
		const [openPlaylistTrackKey, setOpenPlaylistTrackKey] = react.useState(null);
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
		const computeCreatorProfileIcons = () => {
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
		const buildThemeToggleIcon = (...iconChildren) => react.createElement(
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
			...iconChildren
		);
		const themeIcon = isDarkTheme
			? buildThemeToggleIcon(
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
			: buildThemeToggleIcon(
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

		return { closeIcon, themeIcon, likeIcon, decorationSettingsIcon };
		};
		const { closeIcon, themeIcon, likeIcon, decorationSettingsIcon } = computeCreatorProfileIcons();

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
				writeTheme(normalizedTheme);
			} catch (error) {
				// Ignore storage failures in restricted runtimes.
			}
		}, [uiTheme]);

		const renderCreatorProfileNameRow = () => (
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
					)
		);
		const renderCreatorProfileDecorationPanel = () => (
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
				)
		);
		const renderCreatorProfileStats = () => (
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
							react.createElement("strong", null, contributionPoints.toLocaleString(undefined, { maximumFractionDigits: 2 })),
							react.createElement("span", null, copy.points)
						)
					)
					: react.createElement(
						"div",
						{ className: "lyrics-creator-profile-inline-state" },
						copy.loading
				)
		);
		const renderCreatorProfileGreetingBlock = () => (
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
				)
		);
		const renderCreatorProfileHero = () => (
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
					renderCreatorProfileNameRow(),
				renderCreatorProfileDecorationPanel(),
				renderCreatorProfileGreetingBlock(),
				renderCreatorProfileStats()
			)
		)
		);
		const renderCreatorProfileSections = () => (
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
									...contributions.map((item) => react.createElement(CreatorProfileTrackRow, {
										key: `${item.trackId}:${item.provider}`,
										item,
										copy,
										onTrackClick,
										openPlaylistTrackKey,
										onPlaylistOpenChange: setOpenPlaylistTrackKey,
										theme: uiTheme
									}))
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
		const content = react.createElement(
			react.Fragment,
			null,
			renderCreatorProfileHero(),
			renderCreatorProfileSections()
		);

		const renderCreatorProfileModalShell = () => react.createElement(
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

		return renderCreatorProfileModalShell();
	});

	// CreditFooter implementing provider and contributor display
	return SyncCreatorProfileModal;
}
