import {
	SYNC_CREATOR_SOURCE_ADDON_ID, doesSyncCreatorLrclibSourceMatchShape, getSyncCreatorLrclibTextShape,
	hasExactSyncCreatorLineShape, isCompleteSyncCreatorLrclibSource,
} from './lrclibSyncSource.mjs';
import { sanitizeSyncCreatorLastCharEnds } from './timingValidation.mjs';

export async function exportSyncCreatorFile({
	syncData, track, lyrics, timing, saveWork, files, toast, translate, isDraftCurrent = () => true,
}) {
	if (!isDraftCurrent()) return;
	if (!syncData?.lines || syncData.lines.length === 0) {
		toast.error(translate('syncCreator.noSyncData') || 'No sync data to export');
		return;
	}

	try {
		const expanded = timing.attachSource(sanitizeSyncCreatorLastCharEnds(timing.materialize(syncData)));
		timing.validate(expanded);
		const encoded = timing.compact(expanded, lyrics.chars, lyrics.language || undefined);
		const contents = JSON.stringify(encoded, null, 2);
		const baseName = [track.title, track.artist].map(value => String(value || '').trim()).filter(Boolean).join('-');
		const fallbackName = track.id ? `sync-${track.id}` : 'ivLyrics-sync';
		const fileName = `${files.sanitizeFileName(baseName, fallbackName)}.json`;
		const saveTarget = await files.requestSaveFileTarget(fileName, {
			description: 'ivLyrics Sync Data',
			mimeType: 'application/json',
			extensions: ['.json'],
		});
		if (saveTarget.canceled) return;

		const blob = new Blob([contents], { type: 'application/json' });
		await files.saveBlobAs(blob, fileName, saveTarget);
		if (isDraftCurrent()) {
			try {
				await saveWork(JSON.parse(contents));
			} catch (error) {
				console.warn('[SyncDataCreator] Could not checkpoint the exported snapshot:', error);
			}
		}
		toast.success(translate('syncCreator.exportSuccess') || 'Exported sync data');
	} catch (error) {
		console.error('[SyncDataCreator] Export error:', error);
		toast.error(error?.message || translate('syncCreator.submitError'));
	}
}

export function createSyncCreatorImportPicker({ captureDraftOwnership, isEditorOpen }) {
	let active = null;

	function cancel() {
		const previous = active;
		active = null;
		previous?.releaseInput();
		previous?.controller.abort();
	}

	function open(options) {
		if (!isEditorOpen()) return;
		const ownsDraft = captureDraftOwnership();
		cancel();

		const { createInput, ...transfer } = options;
		const input = createInput();
		const controller = new AbortController();
		const releaseInput = () => {
			input.onchange = null;
			input.oncancel = null;
		};
		const request = { controller, releaseInput };
		active = request;
		const isCurrent = () => active === request && isEditorOpen() && ownsDraft();

		input.type = 'file';
		input.accept = '.json';
		input.oncancel = () => {
			if (active === request) cancel();
		};
		input.onchange = async event => {
			releaseInput();
			try {
				const file = event.target.files?.[0];
				if (file && isCurrent()) {
					await importSyncCreatorFile(file, { ...transfer, isCurrent, signal: controller.signal });
				}
			} finally {
				if (active === request) active = null;
			}
		};
		input.click();
	}

	return { open, cancel };
}

async function importSyncCreatorFile(file, {
	lyricsText, currentSource, timing, prepareLrclibSource, applyImport, toast, translate, isCurrent, signal,
}) {
	let committing = false;
	try {
		const contents = await file.text();
		if (!isCurrent()) return;
		const data = JSON.parse(contents);
		if (!Array.isArray(data.lines)) throw new Error('Invalid sync data format');

		const prepared = await prepareSyncCreatorFileImport(data, {
			lyricsText, currentSource, timing, prepareLrclibSource, isCurrent, signal,
		});
		if (!prepared || !isCurrent()) return;
		committing = true;
		applyImport(prepared.data, prepared.target);
		toast.success(translate('syncCreator.importSuccess') || 'Imported sync data');
	} catch (error) {
		if (!committing && !isCurrent()) return;
		console.error('[SyncDataCreator] Import error:', error);
		toast.error((translate('syncCreator.importError') || 'Import failed') + ': ' + error.message);
	}
}

async function prepareSyncCreatorFileImport(data, { lyricsText, currentSource, timing, prepareLrclibSource, isCurrent, signal }) {
	let target = currentSource;
	const source = data.source;
	const currentShape = getSyncCreatorLrclibTextShape(lyricsText);
	const completeFileSource = isCompleteSyncCreatorLrclibSource(source);
	let lrclibSource;
	if (completeFileSource && !hasExactSyncCreatorLineShape(source.lineCharCounts, currentShape.lineCharCounts)) {
		// Validate the file before loading its exact text.
		timing.validate(timing.sanitize(data));
		const loaded = await prepareLrclibSource(source, isCurrent, signal);
		if (!loaded || !isCurrent()) return null;
		target = {
			...loaded, lrclibSource: loaded.lrclibSource || source,
			provider: SYNC_CREATOR_SOURCE_ADDON_ID, addonId: SYNC_CREATOR_SOURCE_ADDON_ID,
		};
		lrclibSource = source;
	} else {
		// Matching row lengths allow positional timing import. The source ID
		// still needs to describe the text the editor will actually display.
		lrclibSource = [source, currentSource.lrclibSource].find(candidate =>
			doesSyncCreatorLrclibSourceMatchShape(candidate, currentShape)
		) || (!completeFileSource && source?.provider === SYNC_CREATOR_SOURCE_ADDON_ID ? source : null);
		target = { ...currentSource, lrclibSource };
	}
	const sanitized = timing.sanitize(data, target.lyricsChars);
	timing.validate(sanitized);
	const imported = { ...sanitized };
	if (lrclibSource) imported.source = lrclibSource;
	else if (imported.source?.provider === SYNC_CREATOR_SOURCE_ADDON_ID) delete imported.source;
	return { data: imported, target };
}
