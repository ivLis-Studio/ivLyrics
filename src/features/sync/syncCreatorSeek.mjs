export function getSyncCreatorPlayerForTrack(player, trackUri) {
	return trackUri && player?.data?.item?.uri === trackUri ? player : null;
}

export function readSyncCreatorPosition(value) {
	if (typeof value === 'string' && value.trim()) value = Number(value);
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function readSyncCreatorDuration(player) {
	return readSyncCreatorPosition(player?.getDuration?.()) || readSyncCreatorPosition(player?.data?.item?.duration?.milliseconds) || null;
}

export function seekSyncCreatorByOffset(player, offsetMs) {
	const position = readSyncCreatorPosition(player?.getProgress?.());
	if (typeof player?.seek !== 'function' || position === null || !Number.isFinite(offsetMs)) return;
	const duration = readSyncCreatorDuration(player);
	player.seek(Math.max(0, Math.min(position + offsetMs, duration ?? Infinity)));
}

export function seekSyncCreatorFromProgressBar(player, event) {
	const rect = event.currentTarget?.getBoundingClientRect?.();
	const clientX = event.touches?.[0]?.clientX ?? event.changedTouches?.[0]?.clientX ?? event.clientX;
	const duration = readSyncCreatorDuration(player);
	if (typeof player?.seek !== 'function' || duration === null || !Number.isFinite(clientX)
		|| !Number.isFinite(rect?.width) || rect.width <= 0 || !Number.isFinite(rect.left)) return;
	const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
	player.seek(duration * ratio);
}
