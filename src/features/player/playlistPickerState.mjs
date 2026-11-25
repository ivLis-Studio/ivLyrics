const EMPTY_PLAYLISTS = [];
const EMPTY_STATUSES = {};
const STATUS_BATCH_SIZE = 4;

const isSpotifyTrack = (uri) => /^spotify:track:[^:]+/.test(uri || "");

export function createPlaylistPickerStateHook({ react, repository, getToast }) {
	const { useEffect, useMemo, useRef, useState } = react;
	const useCommitEffect = react.useLayoutEffect || useEffect;
	const isCurrent = (scope) => scope.active && repository.getCurrentSpotifyUserId() === scope.accountId;

	return function usePlaylistPickerState({ open, trackUri, onClose, copy }) {
		const accountId = repository.getCurrentSpotifyUserId();
		const [list, setList] = useState(null);
		const [membership, setMembership] = useState(null);
		const [operation, setOperation] = useState(null);
		const pending = useRef(null);
		const currentList = list?.accountId === accountId ? list : null;
		const playlists = currentList?.playlists ?? EMPTY_PLAYLISTS;
		const loading = open && (!currentList || currentList.loading === true);
		const error = currentList?.failed ? copy.loadFailed
			: !loading && currentList && playlists.length === 0 ? copy.empty : "";

		// Retire the library read in the same commit that hides the menu.
		useCommitEffect(() => {
			if (!open) return;

			const cached = repository.getCachedPlaylists(accountId);
			if (cached) {
				setList((previous) => previous?.accountId === accountId && previous.playlists === cached
					? previous : { accountId, playlists: cached });
				return;
			}

			const controller = new AbortController();
			setList({ accountId, loading: true });
			const stillCurrent = () => !controller.signal.aborted && repository.getCurrentSpotifyUserId() === accountId;
			void repository.requestWritableUserPlaylists(accountId, controller.signal).then((playlists) => {
				if (stillCurrent() && playlists) setList(previous => stillCurrent() ? { accountId, playlists } : previous);
			}, (failure) => {
				if (!stillCurrent()) return;
				console.warn("[PlaylistPicker] Failed to load playlists:", failure);
				setList(previous => stillCurrent() ? { accountId, failed: true } : previous);
			});
			return () => controller.abort();
		}, [open, accountId]);

		const scope = useMemo(() => ({ accountId, trackUri, active: false }), [open, accountId, playlists, trackUri]);
		const checking = useMemo(() => isSpotifyTrack(trackUri)
			? Object.fromEntries(playlists.map(({ id }) => [id, "checking"]))
			: EMPTY_STATUSES, [playlists, trackUri]);
		const statuses = membership?.scope === scope ? membership.statuses : checking;

		const mergeStatuses = (updates) => {
			setMembership((previous) => isCurrent(scope) ? {
				scope,
				statuses: { ...(previous?.scope === scope ? previous.statuses : checking), ...updates },
			} : previous);
		};

		useCommitEffect(() => {
			scope.active = open;
			return () => { scope.active = false; };
		}, [scope]);

		useCommitEffect(() => {
			if (!open || !isSpotifyTrack(trackUri)) return;
			const controller = new AbortController();
			const changedPlaylists = new Set();
			const unsubscribe = repository.subscribeToMembershipChanges(accountId, trackUri, (playlistId, contains) => {
				if (!isCurrent(scope)) return;
				changedPlaylists.add(playlistId);
				mergeStatuses({ [playlistId]: contains ? "contains" : "missing" });
			});

			async function checkMembership() {
				for (let index = 0; index < playlists.length && isCurrent(scope); index += STATUS_BATCH_SIZE) {
					const batch = playlists.slice(index, index + STATUS_BATCH_SIZE);
					const entries = await Promise.all(batch.map(async (playlist) => {
						try {
							const match = await repository.getPlaylistTrackMatch(playlist, trackUri, accountId, controller.signal);
							return match ? [playlist.id, match.contains ? "contains" : "missing"] : null;
						} catch (failure) {
							if (!isCurrent(scope)) return null;
							console.warn("[PlaylistPicker] Failed to check playlist track status:", playlist.uri, failure);
							return [playlist.id, "missing"];
						}
					}));
					const currentEntries = entries.filter(entry => entry && !changedPlaylists.has(entry[0]));
					if (currentEntries.length && isCurrent(scope)) mergeStatuses(Object.fromEntries(currentEntries));
				}
			}

			void checkMembership();
			return () => {
				unsubscribe();
				controller.abort();
			};
		}, [scope]);

		const handleAction = async (playlist) => {
			if (!isCurrent(scope) || !playlist?.id || pending.current?.scope === scope) return;
			const known = statuses[playlist.id];
			if (known === "checking") return;
			if (!isSpotifyTrack(trackUri)) {
				getToast().error(copy.noTrack);
				return;
			}

			const nextOperation = { scope, playlistId: playlist.id };
			pending.current = nextOperation;
			setOperation(nextOperation);
			const removing = known === "contains";
			try {
				const result = await repository.setPlaylistTrackMembership(
					playlist, trackUri, !removing, accountId, () => isCurrent(scope),
				);
				if (!result || !isCurrent(scope)) return;
				if (!result.changed) return;
				if (!removing) onClose?.();
				const message = removing ? copy.removed : copy.added;
				getToast().success(message.replace("{playlist}", playlist.name || "playlist"));
			} catch (failure) {
				console.warn("[PlaylistPicker] Failed to update playlist track:", failure);
				if (isCurrent(scope)) getToast().error(removing ? copy.removeFailed : copy.addFailed);
			} finally {
				if (pending.current === nextOperation) {
					pending.current = null;
					if (isCurrent(scope)) setOperation(null);
				}
			}
		};

		return {
			playlists, loading, error, statuses, onItemAction: handleAction,
			pendingPlaylistId: operation?.scope === scope ? operation.playlistId : "",
		};
	};
}
