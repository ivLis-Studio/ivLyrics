import { createSpotifyPlaylistRepository } from "./spotifyPlaylistRepository.mjs";
import { createPlaylistPickerStateHook } from "./playlistPickerState.mjs";

/**
 * Shared "Add to playlist" menu.
 *
 * The fullscreen player controls and the Sync Creator profile offer the same
 * picker, so playlist discovery, membership lookup and the add/remove calls
 * live here once. Each host only decides where the menu is anchored.
 */

const PLAYLIST_POPOVER_GAP = 12;
const PLAYLIST_POPOVER_PADDING = 8;
const PLAYLIST_ADD_ICON_PATH = '<path d="M5 6h8"/><path d="M5 12h8"/><path d="M5 18h6"/><path d="M17 10v8"/><path d="M13 14h8"/>';

function getPlaylistPickerCopy(i18n) {
	return {
		title: i18n.t("fullscreen.controls.addToPlaylist") || "Add to playlist",
		loading: i18n.t("fullscreen.controls.playlistLoading") || "Loading playlists...",
		empty: i18n.t("fullscreen.controls.playlistEmpty") || "No editable playlists found.",
		loadFailed: i18n.t("fullscreen.controls.playlistLoadFailed") || "Failed to load playlists.",
		noTrack: i18n.t("fullscreen.controls.playlistNoTrack") || "Only Spotify tracks can be added to playlists.",
		added: i18n.t("fullscreen.controls.playlistAdded") || "Added to {playlist}.",
		removed: i18n.t("fullscreen.controls.playlistRemoved") || "Removed from {playlist}.",
		addFailed: i18n.t("fullscreen.controls.playlistAddFailed") || "Failed to add to playlist.",
		removeFailed: i18n.t("fullscreen.controls.playlistRemoveFailed") || "Failed to remove from playlist.",
		tracks: i18n.t("fullscreen.controls.playlistTracks") || "tracks",
		checking: i18n.t("fullscreen.controls.playlistChecking") || "Checking...",
		alreadyIn: i18n.t("fullscreen.controls.playlistAlreadyInList") || "Already in",
		remove: i18n.t("fullscreen.controls.playlistRemove") || "Remove"
	};
}

/**
 * Presentational body of the picker. It owns no state, so the same markup and
 * the same `fullscreen-playlist-*` styles apply wherever it is mounted.
 */
export function PlaylistPickerPanel({
	react,
	copy,
	playlists,
	error,
	loading,
	statuses,
	pendingPlaylistId,
	onItemAction
}) {
	const renderItem = (playlist) => {
		const status = statuses?.[playlist.id]?.status ?? statuses?.[playlist.id];
		const isChecking = status === "checking";
		const alreadyContainsTrack = status === "contains";
		const isPending = pendingPlaylistId === playlist.id;

		return react.createElement(
			"button",
			{
				key: playlist.id,
				className: `fullscreen-playlist-item ${alreadyContainsTrack ? "contains-current-track" : ""}`.trim(),
				onClick: () => onItemAction(playlist),
				disabled: !!pendingPlaylistId || isChecking,
				role: "menuitem"
			},
			playlist.image
				? react.createElement("img", {
					src: playlist.image,
					className: "fullscreen-playlist-item-image",
					alt: ""
				})
				: react.createElement("span", { className: "fullscreen-playlist-item-fallback" }, "♪"),
			react.createElement(
				"span",
				{ className: "fullscreen-playlist-item-text" },
				react.createElement("span", { className: "fullscreen-playlist-item-name" }, playlist.name),
				react.createElement("span", { className: "fullscreen-playlist-item-count" }, `${playlist.total} ${copy.tracks}`)
			),
			isPending
				? react.createElement("span", { className: "fullscreen-playlist-item-loading" }, "...")
				: isChecking
					? react.createElement(
						"span",
						{ className: "fullscreen-playlist-item-status checking" },
						copy.checking
					)
					: alreadyContainsTrack && react.createElement(
						"span",
						{ className: "fullscreen-playlist-item-status contains" },
						react.createElement(
							"span",
							{ className: "fullscreen-playlist-item-status-default" },
							copy.alreadyIn
						),
						react.createElement(
							"span",
							{ className: "fullscreen-playlist-item-status-remove" },
							copy.remove
						)
					)
		);
	};

	return react.createElement(
		react.Fragment,
		null,
		react.createElement("div", { className: "fullscreen-playlist-popover-title" }, copy.title),
		loading && react.createElement("div", { className: "fullscreen-playlist-state" }, copy.loading),
		!loading && error && react.createElement("div", { className: "fullscreen-playlist-state error" }, error),
		!loading && !error && playlists.map(renderItem)
	);
}

export function resolvePlaylistPopoverPlacement({
	anchor,
	popover,
	viewport,
	boundary,
	gap = PLAYLIST_POPOVER_GAP,
	padding = PLAYLIST_POPOVER_PADDING
} = {}) {
	const anchorTop = Number(anchor?.top) || 0;
	const anchorBottom = Number(anchor?.bottom) || 0;
	const anchorLeft = Number(anchor?.left) || 0;
	const anchorRight = Number(anchor?.right) || 0;
	const popoverWidth = Number(popover?.width) || 0;
	const popoverHeight = Number(popover?.height) || 0;
	const viewportWidth = Number(viewport?.width) || 0;
	const viewportHeight = Number(viewport?.height) || 0;

	const aboveTop = anchorTop - popoverHeight - gap;
	const belowTop = anchorBottom + gap;
	const fitsAbove = aboveTop >= padding;
	const fitsBelow = belowTop + popoverHeight <= viewportHeight - padding;

	let placement;
	let top;
	if (fitsAbove) {
		placement = "above";
		top = aboveTop;
	} else if (fitsBelow) {
		placement = "below";
		top = belowTop;
	} else {
		placement = anchorTop - padding >= viewportHeight - padding - anchorBottom ? "above" : "below";
		top = placement === "above" ? aboveTop : belowTop;
		top = Math.max(padding, Math.min(top, viewportHeight - popoverHeight - padding));
	}

	// A right-edge control (a track row's playlist button) keeps the menu inside
	// the panel that owns it: hang left of the trigger, flip right only when that
	// would not fit, and never leave the boundary.
	const boundaryLeft = Number.isFinite(Number(boundary?.left)) ? Number(boundary.left) : 0;
	const boundaryRight = Number.isFinite(Number(boundary?.right)) ? Number(boundary.right) : viewportWidth;
	const minLeft = boundaryLeft + padding;
	const maxLeft = Math.max(minLeft, boundaryRight - popoverWidth - padding);

	let preferredLeft = anchorLeft - popoverWidth;
	if (preferredLeft < minLeft) preferredLeft = anchorRight;
	const left = Math.max(minLeft, Math.min(preferredLeft, maxLeft));

	return { placement, top, left };
}

export function createPlaylistPicker({ host, document, spicetify: Spicetify, i18n, getToast }) {
	const react = Spicetify.React;
	const { useState, useEffect, useCallback, useRef } = react;
	const reactDom = host.Spicetify?.ReactDOM ?? host.ReactDOM ?? null;

	const repository = createSpotifyPlaylistRepository(Spicetify);
	const usePlaylistPickerState = createPlaylistPickerStateHook({ react, repository, getToast });

	const PlaylistPickerMenu = ({
		trackUri,
		open,
		onClose,
		anchored = false,
		anchorRef,
		menuRef,
		theme,
		boundary
	}) => {
		const copy = getPlaylistPickerCopy(i18n);
		const state = usePlaylistPickerState({ open, trackUri, onClose, copy });
		const [placement, setPlacement] = useState(null);

		// Anchored hosts (the creator profile grid) scroll and resize under the
		// menu, so the placement is recomputed rather than measured once.
		useEffect(() => {
			if (!anchored || !open) {
				setPlacement(null);
				return undefined;
			}

			const update = () => {
				const anchorRect = anchorRef?.current?.getBoundingClientRect?.();
				if (!anchorRect) return;
				const popoverRect = menuRef?.current?.getBoundingClientRect?.();
				const boundaryElement = typeof boundary === "string"
					? anchorRef?.current?.closest?.(boundary)
					: boundary;
				const nextPlacement = resolvePlaylistPopoverPlacement({
					anchor: anchorRect,
					popover: popoverRect || { width: 0, height: 0 },
					viewport: { width: host.innerWidth, height: host.innerHeight },
					boundary: boundaryElement?.getBoundingClientRect?.() || null
				});
				setPlacement((previous) => previous?.top === nextPlacement.top && previous?.left === nextPlacement.left
					? previous : nextPlacement);
			};

			update();
			const observer = typeof host.ResizeObserver === "function" ? new host.ResizeObserver(update) : null;
			if (anchorRef?.current) observer?.observe(anchorRef.current);
			if (menuRef?.current) observer?.observe(menuRef.current);
			host.addEventListener("scroll", update, true);
			host.addEventListener("resize", update);
			return () => {
				observer?.disconnect();
				host.removeEventListener("scroll", update, true);
				host.removeEventListener("resize", update);
			};
		}, [anchored, anchorRef, boundary, menuRef, open, state.error, state.loading, state.playlists.length]);

		if (!open) return null;

		const popover = react.createElement(
			"div",
			{
				className: "fullscreen-playlist-popover",
				role: "menu",
				ref: menuRef,
				// An anchored menu is portalled to <body>, so it carries the host
				// theme itself and cannot rely on an ancestor selector.
				"data-ui-theme": theme,
				style: anchored
					? {
						position: "fixed",
						top: `${placement?.top ?? 0}px`,
						left: `${placement?.left ?? 0}px`,
						right: "auto",
						bottom: "auto",
						// The creator profile modal already owns the topmost layer.
						zIndex: "var(--iv-layer-modal)",
						visibility: placement ? "visible" : "hidden"
					}
					: undefined
			},
			PlaylistPickerPanel({ react, copy, ...state })
		);

		// The creator profile grid scrolls, so an in-flow menu would be clipped.
		return anchored && reactDom?.createPortal && document.body
			? reactDom.createPortal(popover, document.body)
			: popover;
	};

	const PlaylistPickerButton = ({
		trackUri,
		buttonClassName = "",
		buttonStyle,
		buttonTitle,
		iconSize = 24,
		anchored = false,
		activeClassName = "active",
		theme,
		boundary,
		wrapperClassName = "fullscreen-playlist-control",
		open: controlledOpen,
		onOpenChange
	}) => {
		const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
		const wrapperRef = useRef(null);
		const triggerRef = useRef(null);
		const menuRef = useRef(null);
		const isControlled = controlledOpen !== undefined;
		const open = isControlled ? controlledOpen : uncontrolledOpen;

		const setOpen = useCallback((next) => {
			if (!isControlled) setUncontrolledOpen(next);
			onOpenChange?.(next);
		}, [isControlled, onOpenChange]);

		useEffect(() => {
			if (!open) return undefined;

			const handleOutsidePointer = (event) => {
				if (wrapperRef.current?.contains?.(event.target)) return;
				if (menuRef.current?.contains?.(event.target)) return;
				setOpen(false);
			};

			document.addEventListener("mousedown", handleOutsidePointer, true);
			return () => document.removeEventListener("mousedown", handleOutsidePointer, true);
		}, [open, setOpen]);

		return react.createElement(
			"div",
			{ className: wrapperClassName, ref: wrapperRef },
			react.createElement(
				"button",
				{
					className: `${buttonClassName}${open && activeClassName ? ` ${activeClassName}` : ""}`.trim(),
					style: buttonStyle,
					onClick: () => setOpen(!open),
					title: buttonTitle || getPlaylistPickerCopy(i18n).title,
					"aria-haspopup": "menu",
					"aria-expanded": open ? "true" : "false",
					ref: triggerRef
				},
				react.createElement("svg", {
					viewBox: "0 0 24 24",
					width: iconSize,
					height: iconSize,
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					strokeLinecap: "round",
					strokeLinejoin: "round",
					"aria-hidden": "true",
					dangerouslySetInnerHTML: { __html: PLAYLIST_ADD_ICON_PATH }
				})
			),
			react.createElement(PlaylistPickerMenu, {
				trackUri,
				open,
				onClose: () => setOpen(false),
				anchored,
				anchorRef: triggerRef,
				menuRef,
				theme,
				boundary
			})
		);
	};

	return { PlaylistPickerMenu, PlaylistPickerButton };
}
