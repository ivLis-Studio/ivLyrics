import { renderSyncCreatorLineInspector } from '#ivlyrics/features/sync/syncCreatorStyleControls.mjs';
import { renderSyncCreatorStagePanel } from '#ivlyrics/features/sync/syncCreatorStageView.mjs';
import { createSyncCreatorVocalStyles } from '#ivlyrics/features/sync/syncCreatorVocalStyles.mjs';
import { rangesToCharRefs } from "#ivlyrics/features/sync/syncCreatorVocalLayout.mjs";
import { readSyncCreatorFixture, readSyncCreatorVocalEditorSource } from "./fixtures/legacy-page-source.mjs";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createLockedEditor } from './sync_creator_lock_harness.mjs';

const source = readSyncCreatorFixture().replace(/\r\n/g, '\n');
const plain = value => JSON.parse(JSON.stringify(value));
const section = (startMarker, endMarker, input = source) => {
	const start = input.indexOf(startMarker);
	const end = input.indexOf(endMarker, start + startMarker.length);
	assert.ok(start >= 0 && end > start, `missing production section: ${startMarker}`);
	return input.slice(start, end);
};
const styleMemo = section('\tconst currentLineMeta = useMemo(', '\tconst getParallelTemplateForLine =');
const charMemo = section('\tconst currentLineCharRefs = useMemo(', '\tscoreInputContextRef.current =');
const effectMeta = section('\tconst currentSpeakerMeta =', '\tuseEffect(() => {');
const vocalEditorSource = readSyncCreatorVocalEditorSource();
const metaCallbacks = section('\tconst updateParallelPartMeta =', '\tconst updateCurrentLineStyleRanges =', vocalEditorSource);
const styleCallback = section('\tconst updateCurrentLineStyleRanges =', '\tconst applySongVocalSpeaker =', vocalEditorSource);
const inspectors = section('\tconst updateCurrentTextEffect =', '\tconst syncGranularityRecordingHint =');
const stageRenderer = section('\tconst renderStagePanel =', '\tconst { getCurrentLastCharEndInfo, setCurrentLastCharEnd }');

function* nodes(tree) {
	if (tree === null || tree === undefined || typeof tree === 'boolean') return;
	if (Array.isArray(tree)) {
		for (const child of tree) yield* nodes(child);
	} else {
		yield tree;
		if (typeof tree === 'object') yield* nodes(tree.children);
	}
}

// Reuse the existing production-backed mouse/keyboard host, without changing it.
// Add the shipping metadata/style memos, updaters, stage and speaker inspector.
// Only React hosting and unrelated stage content are replaced. State writes
// can be batched; selection itself is made by production event handlers.
function createStyleEditor({ text = 'ABCDEFGH', mode = 'idle' } = {}) {
	const h = createLockedEditor({ text, saved: Array.from(text, (_, i) => 10 + i * 0.25) });
	const c = h.context;
	const queued = [];
	let deferWrites = false, claims = 0;
	Object.assign(c, {
		rangesToCharRefs, renderSyncCreatorLineInspector, renderSyncCreatorStagePanel,
		syncCreatorVocalStyles: createSyncCreatorVocalStyles({
			getSpeakerColors: () => null, getActiveColor: () => null, translate: key => key,
		}),
		mode, offsetSelectionRange: null, currentLineText: c.currentLineChars.join(''),
		bulkCustomSpeakerColor: '', bulkCustomSpeakerFallback: 'MALE 1',
		customSpeakerMetaMemoryRef: { current: new Map() },
		TOSS_BORDER: '#333', TOSS_BLUE: '#08f', TOSS_BLUE_SOFT: '#123', TOSS_BLUE_BORDER: '#357', TOSS_BLUE_RING: '#456',
		s: { effectPill: {}, effectCard: {} },
		claimSessionForLocalEditing() { claims++; },
		react: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
		requestSongVocalSpeaker() {},
		isLoading: false, error: null, previousNavigableLineIndex: -1, nextNavigableLineIndex: -1,
		isCurrentLineSynced: true, showLivePreview: false, syncGranularityRecordingHint: '',
		goToPrevLine() {}, goToNextLine() {}, renderManualSplitEditor: () => null,
		renderLivePreviewOverlay: () => null, getSyncCreatorFuriganaReact: text => text,
		renderCurrentLineCharacters: () => null, renderParallelPartLine: () => null,
	});
	for (const name of ['bulkCustomSpeakerColor', 'bulkCustomSpeakerFallback']) {
		c[`set${name[0].toUpperCase()}${name.slice(1)}`] = update => {
			c[name] = typeof update === 'function' ? update(c[name]) : update;
		};
	}
	for (const name of ['lineStyleDrafts', 'lineMetaDrafts', 'parallelPartMetaDrafts', 'syncData']) {
		c[`set${name[0].toUpperCase()}${name.slice(1)}`] = update => {
			const apply = () => { c[name] = typeof update === 'function' ? update(c[name]) : update; };
			if (deferWrites) queued.push(apply);
			else apply();
		};
	}
	const render = (selected = c.activeParallelPartId, { refreshTarget = true } = {}) => {
		if (refreshTarget) {
			h.render(selected);
			// The shared offset host also picks a vocal for an unsplit row. Match
			// shipping target resolution before running the actual character memos.
			if (!c.multiVocalMode || !c.hasCurrentParallelParts) {
				Object.assign(c, { activeParallelPart: null, activeParallelTargetId: 'full', activeParallelPartId: 'full' });
			}
			vm.runInContext(`Object.assign(globalThis, (() => {
				${charMemo}
				return { currentLineCharRefs, currentLineChars };
			})());`, c);
		}
		c.currentLineText = c.currentLineChars.join('');
		vm.runInContext(`Object.assign(globalThis, (() => {
			${styleMemo}
			${effectMeta}
			const { normalizeSyncCreatorMetaFieldValue, applySyncCreatorStyleRangePatch } = syncCreatorVocalStyles;
			${metaCallbacks}
			${styleCallback}
			${inspectors}
			${stageRenderer}
			return { currentLineMeta, currentLineStyleRanges, currentTextEffectKind,
				updateCurrentLineStyleRanges, renderLineInspector, renderStagePanel };
		})());`, c);
	};
	const styleTree = () => [c.renderStagePanel(), c.renderLineInspector()];
	const control = (predicate, label) => {
		const node = [...nodes(styleTree())].find(predicate);
		assert.ok(node, `${label} must be rendered`);
		assert.notEqual(node.props.disabled, true, `${label} must be enabled`);
		return node;
	};
	const effectButton = value => control(node => node?.type === 'button'
		&& node.props.className === 'ivlyrics-sync-effect-card' && node.props.key === value, `effect ${value}`);
	const speakerButton = value => control(node => node?.type === 'button'
		&& node.props['data-speaker'] === value, `speaker ${value}`);
	render();
	return {
		...h, render,
		get claims() { return claims; },
		selection: () => plain(c.offsetSelectionRangeRef.current),
		style: patch => c.updateCurrentLineStyleRanges(patch),
		chooseEffect(value) { render(); effectButton(value).props.onClick(); },
		chooseSpeaker(value) { render(); speakerButton(value).props.onClick(); },
		chooseColor(value) {
			render();
			control(node => node?.type === 'input' && node.props.type === 'color', 'custom color').props.onChange({ target: { value } });
		},
		blurColor(value) {
			render();
			const target = { value };
			control(node => node?.type === 'input' && node.props.type === 'text', 'custom HEX color').props.onBlur({ target });
			return target.value;
		},
		chooseFallback(value) {
			render();
			const fallback = control(node => node?.type === 'select'
				&& ![...nodes(node.children)].some(option => option?.type === 'option' && option.props.value === ''), 'custom speaker fallback');
			fallback.props.onChange({ target: { value } });
		},
		clearStyle() {
			render();
			control(node => node?.type === 'button' && node.props.title === 'syncCreator.rangeStyleClear', 'clear style').props.onClick();
		},
		styleTree, effectButton, speakerButton,
		deferWrites() { deferWrites = true; },
		flushWrites() { deferWrites = false; while (queued.length) queued.shift()(); },
	};
}

const withoutStyles = data => ({ ...plain(data), lines: plain(data.lines).map(({ styleRanges, ...line }) => line) });
const styleAt = (ranges, index) => {
	const range = ranges?.find(range => range.start <= index && range.end >= index);
	if (!range) return null;
	const { start, end, ...meta } = plain(range);
	return meta;
};
const lineStyles = h => h.line().styleRanges || [];

const createVocalEditor = (layout, mode = 'idle') => {
	const h = createStyleEditor({ text: layout === 'grouped' ? 'AB (CD) EF (GH)' : 'ABCDEFGH', mode });
	if (layout === 'normal') return h;
	if (layout === 'grouped') {
		h.context.parentheticalLayoutDrafts[3] = 'grouped';
		h.render();
		const grouped = h.context.currentParallelParts.find(part => part.ranges.length > 1);
		assert.ok(grouped, 'use the production noncontiguous parenthetical template');
		h.render(grouped.id);
	} else {
		h.split(3);
		h.render('b');
	}
	const partId = h.context.activeParallelPart.id;
	h.context.syncData = h.materialize();
	h.render(partId);
	assert.ok(h.line().parallel.parts.find(part => part.id === partId), 'persist the real part so an accidental whole-part write is observable');
	return h;
};

test('without a visible selection the main controls edit line metadata and the range updater stays disarmed', () => {
	const h = createStyleEditor();
	h.line().styleRanges = [{ start: 4, end: 5, kind: 'echo', speaker: 'MALE 1' }];
	h.render();
	const before = plain(h.context.syncData);
	assert.equal(h.style({ kind: 'echo', speaker: 'FEMALE 1' }), false);
	assert.equal(h.claims, 0);
	assert.deepEqual(plain(h.context.syncData), before);
	const clear = [...nodes(h.styleTree())].find(node => node?.props?.title === 'syncCreator.rangeStyleClear');
	assert.ok(clear);
	assert.equal(clear.props.disabled, true);
	h.chooseEffect('whisper');
	h.chooseSpeaker('FEMALE 1');
	const expected = plain(before);
	expected.lines[1].kind = 'whisper';
	expected.lines[1].speaker = 'FEMALE 1';
	assert.deepEqual(plain(h.context.syncData), expected, 'main controls edit the current line without creating ranges');
	h.chooseSpeaker('CUSTOM');
	h.chooseColor('#12ab34');
	h.blurColor('#34cd56');
	h.chooseFallback('DUET 1');
	Object.assign(expected.lines[1], { speaker: 'CUSTOM', 'speaker-color': '#34cd56', 'speaker-fallback': 'DUET 1' });
	assert.deepEqual(plain(h.context.syncData), expected, 'custom color/fallback update only current line metadata without a selection');
	assert.deepEqual(plain(h.context.lineStyleDrafts), {});
});

for (const layout of ['split', 'grouped']) {
	test(`${layout}: without a selection main effect, speaker, color and fallback controls edit only the active part`, () => {
		const h = createVocalEditor(layout);
		h.line().styleRanges = [{ start: 3, end: h.line().end, kind: 'echo', speaker: 'MALE 1' }];
		h.render();
		const before = plain(h.context.syncData);
		const partId = h.context.activeParallelPart.id;
		const clear = [...nodes(h.styleTree())].find(node => node?.props?.title === 'syncCreator.rangeStyleClear');
		assert.equal(clear.props.disabled, true);
		clear.props.onClick();
		assert.deepEqual(plain(h.context.syncData), before);
		assert.equal(h.style({ kind: 'glow' }), false);
		h.chooseEffect('whisper');
		h.chooseSpeaker('CUSTOM');
		h.chooseColor('#12ab34');
		h.blurColor('#34cd56');
		h.chooseFallback('DUET 1');
		const expected = plain(before);
		const part = expected.lines[1].parallel.parts.find(part => part.id === partId);
		Object.assign(part, { kind: 'whisper', speaker: 'CUSTOM', 'speaker-color': '#34cd56', 'speaker-fallback': 'DUET 1' });
		assert.deepEqual(plain(h.context.syncData), expected, 'sibling parts, timing, ranges, line metadata and existing styles stay identical');
		assert.deepEqual(plain(h.context.lineMetaDrafts), {});
		assert.deepEqual(plain(h.context.lineStyleDrafts), {});
	});
}

for (const mode of ['idle', 'preview']) {
	for (const layout of ['normal', 'split', 'grouped']) {
		test(`${mode} ${layout}: actual selected effect, speaker, custom color/fallback and clear callbacks edit only selected refs`, () => {
			const h = createVocalEditor(layout, mode);
			const c = h.context;
			const originalStyle = { kind: 'glow', speaker: 'MALE 1' };
			h.line().styleRanges = [{ start: 3, end: h.line().end, ...originalStyle }];
			h.render();
			const before = withoutStyles(c.syncData);
			const selectedRefs = plain(c.currentLineCharRefs.slice(1, 3));
			const selectedIndexes = new Set(selectedRefs.map(ref => ref.absoluteIndex));
			assert.ok(c.currentLineCharRefs.some(ref => !selectedIndexes.has(ref.absoluteIndex)), 'the active part includes unselected refs');
			if (layout === 'grouped') assert.ok(selectedRefs[1].absoluteIndex > selectedRefs[0].absoluteIndex + 1, 'the selected display span crosses a source gap');
			h.rightDrag(1, 2);
			const expectSelectedStyles = expected => {
				for (let index = 3; index <= h.line().end; index++) {
					assert.deepEqual(styleAt(lineStyles(h), index), selectedIndexes.has(index) ? expected : originalStyle, `absolute character ${index}`);
				}
				assert.deepEqual(withoutStyles(c.syncData), before, 'all part metadata, ranges, timings and other rows must remain unchanged');
				assert.deepEqual(plain(c.parallelPartMetaDrafts), {}, 'selection must never fall through to updateParallelPartMeta');
				assert.deepEqual(plain(c.lineMetaDrafts), {}, 'selection must never fall through to updateCurrentLineMeta');
				assert.deepEqual(plain(c.lineStyleDrafts[3]), plain(lineStyles(h)), 'draft and saved style ranges must agree');
			};
			h.chooseEffect('whisper');
			expectSelectedStyles({ kind: 'whisper', speaker: 'MALE 1' });
			h.render();
			assert.equal(h.effectButton('whisper').props['aria-pressed'], true, 'the main effect picker reads the selected refs');
			const labels = [...nodes(h.styleTree())].filter(node => typeof node === 'string').join(' ');
			assert.ok(labels.includes(`“${selectedRefs.map(ref => ref.char).join('')}”`), 'a parallel selection subtitle shows selected text before its role');
			assert.ok(labels.includes(`(${selectedRefs[0].localIndex + 1}–${selectedRefs[1].localIndex + 1})`), 'subtitle uses source-row positions');
			h.chooseSpeaker('FEMALE 1');
			expectSelectedStyles({ kind: 'whisper', speaker: 'FEMALE 1' });
			h.chooseSpeaker('CUSTOM');
			const custom = styleAt(lineStyles(h), selectedRefs[0].absoluteIndex);
			assert.equal(custom.speaker, 'CUSTOM');
			assert.equal(custom.kind, 'whisper', 'speaker changes preserve the selected effect');
			expectSelectedStyles(custom);
			h.chooseColor('#12ab34');
			expectSelectedStyles({ ...custom, 'speaker-color': '#12ab34' });
			h.blurColor('#34cd56');
			expectSelectedStyles({ ...custom, 'speaker-color': '#34cd56' });
			h.chooseFallback('DUET 1');
			expectSelectedStyles({ kind: 'whisper', speaker: 'CUSTOM', 'speaker-color': '#34cd56', 'speaker-fallback': 'DUET 1' });
			const claims = h.claims;
			assert.equal(h.blurColor('invalid'), '#34cd56', 'invalid HEX input restores the selected custom color');
			assert.equal(h.claims, claims, 'invalid color blur must not claim an edit');
			expectSelectedStyles({ kind: 'whisper', speaker: 'CUSTOM', 'speaker-color': '#34cd56', 'speaker-fallback': 'DUET 1' });
			h.clearStyle();
			expectSelectedStyles(null);
			assert.deepEqual(h.selection(), { start: 1, end: 2 }, 'clearing styles keeps the visible selection');
		});
	}
}

test('normal-row right-click reaches the real partial-effect picker and a second click disarms it', () => {
	const h = createStyleEditor();
	const before = withoutStyles(h.context.syncData);
	h.contextMenu(2);
	h.chooseEffect('whisper');
	assert.deepEqual(plain(lineStyles(h)), [{ start: 5, end: 5, kind: 'whisper' }]);
	assert.deepEqual(plain(h.context.lineStyleDrafts[3]), plain(lineStyles(h)));
	assert.deepEqual(withoutStyles(h.context.syncData), before, 'styling must not change saved timing, vocal metadata or other rows');
	h.contextMenu(2);
	assert.equal(h.selection(), null);
	assert.equal(h.style({ kind: 'echo' }), false);
	assert.deepEqual(plain(lineStyles(h)), [{ start: 5, end: 5, kind: 'whisper' }]);
});

for (const mode of ['idle', 'preview']) {
	for (const [start, end] of [[1, 3], [3, 1]]) {
		test(`${mode}: right-drag ${start} to ${end} styles exactly that span and consumes the trailing context menu`, () => {
			const h = createStyleEditor({ mode });
			const before = withoutStyles(h.context.syncData);
			h.rightDrag(start, end);
			assert.deepEqual(h.selection(), { start: 1, end: 3 });
			assert.equal(h.style({ kind: 'echo' }), true, 'the synchronous selection ref works even before a React rerender');
			assert.deepEqual(plain(lineStyles(h)), [{ start: 4, end: 6, kind: 'echo' }]);
			assert.deepEqual(withoutStyles(h.context.syncData), before);
		});
	}
}

test('record-mode right-click and right-drag remain timing locks, never partial styles', () => {
	const h = createStyleEditor();
	h.contextMenu(1);
	const before = plain(h.context.syncData);
	h.context.mode = 'record';
	h.render();
	assert.ok(h.selection(), 'the updater must reject a record-mode edit even before the clearing effect runs');
	assert.equal([...nodes(h.styleTree())].find(node => node?.props?.title === 'syncCreator.rangeStyleClear').props.disabled, true);
	assert.equal(h.style({ kind: 'echo' }), false);
	h.resetSelection({ mode: 'record' });
	h.contextMenu(2);
	h.rightDrag(3, 4);
	assert.deepEqual(plain(h.context.getActiveRecordingLockRange()), { start: 3, end: 4 });
	assert.equal(h.selection(), null);
	h.render();
	assert.equal([...nodes(h.styleTree())].find(node => node?.props?.title === 'syncCreator.rangeStyleClear').props.disabled, true, 'a timing lock cannot arm clear-style');
	assert.equal(h.style({ kind: 'whisper', speaker: 'FEMALE 1' }), false);
	assert.equal(h.claims, 0);
	assert.deepEqual(plain(h.context.syncData), before);
	assert.deepEqual(plain(h.context.lineStyleDrafts), {});
});

test('full-row right-drag remains visible and styles the entire row', () => {
	const h = createStyleEditor();
	h.rightDrag(0, 7);
	assert.deepEqual(h.selection(), { start: 0, end: 7 });
	h.chooseEffect('glow');
	assert.deepEqual(plain(lineStyles(h)), [{ start: 3, end: 10, kind: 'glow' }]);
	assert.equal(vm.runInContext('resolveSyncCreatorOffsetSelectionRange(0, 7, 8)', h.context), null, 'the pure offset API keeps its existing whole-line fallback');
});

test('a full-row style selection still shifts the whole row rather than neighbor-clamping it as a partial offset', () => {
	const h = createStyleEditor();
	const original = plain(h.line().chars);
	h.rightDrag(0, 7);
	h.api.adjustCurrentLineOffset(1000);
	assert.deepEqual(plain(h.line().chars), original.map(time => time + 1));
	assert.deepEqual(h.selection(), { start: 0, end: 7 }, 'offsetting does not destroy the full-row style selection');
	assert.equal(h.style({ kind: 'echo' }), true);
});

test('contiguous parallel-vocal selection maps into the selected part, not the source-row prefix', () => {
	const h = createStyleEditor();
	h.split(3); h.render('b');
	const before = withoutStyles(h.context.syncData);
	assert.equal(h.context.currentLineText, 'DEFGH');
	h.rightDrag(0, 1);
	h.chooseEffect('whisper');
	assert.deepEqual(plain(lineStyles(h)), [{ start: 6, end: 7, kind: 'whisper' }]);
	assert.equal(styleAt(lineStyles(h), 3), null, 'the first source character must never inherit a later vocal selection');
	assert.deepEqual(withoutStyles(h.context.syncData), before);
	const labels = [...nodes(h.styleTree())].filter(node => typeof node === 'string').join(' ');
	assert.match(labels, /“DE”/);
	assert.match(labels, /\(4–5\)/, 'selection labels are positions in the full row, not in the shortened vocal');
});

test('noncontiguous parallel vocals patch only the exact selected refs and leave the gaps untouched', () => {
	const h = createStyleEditor({ text: 'AB (CD) EF (GH)' });
	h.context.parentheticalLayoutDrafts[3] = 'grouped';
	h.render();
	const grouped = h.context.currentParallelParts.find(part => part.ranges.length > 1);
	assert.ok(grouped, 'the production parenthetical template must expose a noncontiguous vocal');
	h.render(grouped.id);
	const selectedRefs = h.context.currentLineCharRefs.slice(1, 3);
	assert.ok(selectedRefs[1].absoluteIndex > selectedRefs[0].absoluteIndex + 1, 'the fixture must cross a real source-row gap');
	const before = withoutStyles(h.context.syncData);
	h.rightDrag(1, 2);
	h.chooseEffect('echo');
	const selectedIndexes = new Set(selectedRefs.map(ref => ref.absoluteIndex));
	for (let index = 3; index <= h.line().end; index++) {
		assert.deepEqual(styleAt(lineStyles(h), index), selectedIndexes.has(index) ? { kind: 'echo' } : null, `absolute character ${index}`);
	}
	assert.deepEqual(withoutStyles(h.context.syncData), before, 'all parallel timing arrays, ranges and vocal metadata stay identical');
	const pending = [...h.context.scorePendingEffectsRef.current.values()].at(-1);
	assert.deepEqual(plain(pending.ranges), plain(selectedRefs.map(ref => ({ start: ref.absoluteIndex, end: ref.absoluteIndex }))), 'effect scoring must not claim the unselected gap either');
});

test('a full parallel-vocal selection styles that vocal, while offsets retain whole-part semantics', () => {
	const h = createStyleEditor();
	h.split(4); h.render('b');
	const before = plain(h.context.currentParallelData.parts);
	h.rightDrag(0, 3);
	h.chooseEffect('whisper');
	assert.deepEqual(plain(lineStyles(h)), [{ start: 7, end: 10, kind: 'whisper' }]);
	h.api.adjustCurrentLineOffset(1000);
	const after = plain(h.line().parallel.parts);
	assert.deepEqual(after[0].chars, before[0].chars, 'the sibling vocal keeps its original timings');
	assert.deepEqual(after[1].chars, before[1].chars.map(time => time + 1));
	assert.deepEqual(plain(lineStyles(h)), [{ start: 7, end: 10, kind: 'whisper' }]);
});

for (const change of ['line', 'part', 'text', 'same-text remap']) {
	test(`a stale selection cannot style a changed ${change} before the clearing effect runs`, () => {
		const h = createStyleEditor();
		h.rightDrag(1, 2);
		const before = plain(h.context.syncData);
		const c = h.context;
		if (change === 'line') { c.currentLineIndex = 2; c.currentLineStart = 11; }
		if (change === 'part') c.activeParallelTargetId = 'different-vocal';
		if (change === 'text') c.currentLineChars = Array.from('XXXXXXXX');
		if (change === 'same-text remap') c.currentLineCharRefs = c.currentLineCharRefs.map((ref, i, all) => ({ ...ref, absoluteIndex: all[(i + 1) % all.length].absoluteIndex }));
		h.render(undefined, { refreshTarget: false });
		assert.ok(h.selection(), 'do not run the selection-clearing effect; the updater itself must reject the old owner');
		assert.equal(h.style({ kind: 'echo' }), false);
		h.effectButton('echo').props.onClick();
		h.speakerButton('FEMALE 1').props.onClick();
		const clear = [...nodes(h.styleTree())].find(node => node?.props?.title === 'syncCreator.rangeStyleClear');
		assert.equal(clear.props.disabled, false, 'state still contains the old selection before its clearing effect');
		clear.props.onClick();
		assert.equal(h.claims, 0, 'reject stale ownership before claiming a local edit');
		assert.deepEqual(plain(c.syncData), before);
		assert.deepEqual(plain(c.lineStyleDrafts), {});
		assert.deepEqual(plain(c.lineMetaDrafts), {}, 'stale picker callbacks cannot fall through to line metadata');
		assert.deepEqual(plain(c.parallelPartMetaDrafts), {}, 'stale picker callbacks cannot fall through to part metadata');
	});
}

for (const changes of [{ currentLineIndex: 2 }, { activeParallelTargetId: 'other' }, { mode: 'record' }]) {
	test(`the real clearing effect disarms both selection and its owner after ${Object.keys(changes)[0]} changes`, () => {
		const h = createStyleEditor();
		h.rightDrag(1, 2);
		h.pointerStart(9, { button: 2, clientX: 1, clientY: 0 });
		h.resetSelection(changes);
		assert.equal(h.selection(), null);
		assert.equal(h.context.offsetSelectionTargetRef.current, null);
		assert.equal(h.context.pointerGestureRef.current, null);
		assert.equal(h.style({ kind: 'whisper' }), false);
	});
}

test('editing an effect preserves the selected color metadata and untargeted styled spans', () => {
	const h = createStyleEditor();
	const custom = { speaker: 'CUSTOM', 'speaker-color': '#123abc', 'speaker-fallback': 'DUET 1' };
	h.line().styleRanges = [
		{ start: 3, end: 3, kind: 'echo', speaker: 'MALE 1' },
		{ start: 4, end: 8, kind: 'glow', ...custom },
		{ start: 9, end: 10, kind: 'whisper', speaker: 'FEMALE 1' },
	];
	h.render();
	const before = withoutStyles(h.context.syncData);
	h.rightDrag(2, 3);
	assert.equal(h.style({ kind: 'echo' }), true);
	assert.deepEqual(styleAt(lineStyles(h), 5), { kind: 'echo', ...custom });
	assert.deepEqual(styleAt(lineStyles(h), 6), { kind: 'echo', ...custom });
	assert.deepEqual(styleAt(lineStyles(h), 4), { kind: 'glow', ...custom });
	assert.deepEqual(styleAt(lineStyles(h), 8), { kind: 'glow', ...custom });
	assert.deepEqual(styleAt(lineStyles(h), 3), { kind: 'echo', speaker: 'MALE 1' });
	assert.deepEqual(styleAt(lineStyles(h), 10), { kind: 'whisper', speaker: 'FEMALE 1' });
	assert.deepEqual(withoutStyles(h.context.syncData), before);
});

test('the speaker picker changes only selected color metadata, preserving existing text effects', () => {
	const h = createStyleEditor();
	h.line().styleRanges = [{ start: 3, end: 10, kind: 'echo', speaker: 'MALE 1' }];
	h.render();
	h.rightDrag(1, 2);
	h.chooseSpeaker('FEMALE 1');
	for (let index = 3; index <= 10; index++) {
		assert.deepEqual(styleAt(lineStyles(h), index), { kind: 'echo', speaker: index === 4 || index === 5 ? 'FEMALE 1' : 'MALE 1' });
	}
});

test('batched effect and color writes compose from the latest draft and saved state without rerendering', () => {
	const h = createStyleEditor();
	h.rightDrag(1, 2);
	const before = withoutStyles(h.context.syncData);
	h.deferWrites();
	assert.equal(h.style({ kind: 'whisper' }), true);
	assert.equal(h.style({ speaker: 'CUSTOM', 'speaker-color': '#12ab34', 'speaker-fallback': 'DUET 1' }), true);
	h.flushWrites();
	const expected = [{ start: 4, end: 5, kind: 'whisper', speaker: 'CUSTOM', 'speaker-color': '#12ab34', 'speaker-fallback': 'DUET 1' }];
	assert.deepEqual(plain(lineStyles(h)), expected);
	assert.deepEqual(plain(h.context.lineStyleDrafts[3]), expected);
	assert.deepEqual(withoutStyles(h.context.syncData), before);
});

test('batched writes to two successive selections preserve both spans and unrelated draft rows', () => {
	const h = createStyleEditor();
	h.context.lineStyleDrafts[0] = [{ start: 0, end: 1, kind: 'echo' }];
	h.rightDrag(1, 2);
	h.deferWrites();
	assert.equal(h.style({ kind: 'whisper' }), true);
	h.contextMenu(6);
	assert.equal(h.style({ kind: 'glow' }), true);
	h.flushWrites();
	const expected = [{ start: 4, end: 5, kind: 'whisper' }, { start: 9, end: 9, kind: 'glow' }];
	assert.deepEqual(plain(lineStyles(h)), expected);
	assert.deepEqual(plain(h.context.lineStyleDrafts[3]), expected);
	assert.deepEqual(plain(h.context.lineStyleDrafts[0]), [{ start: 0, end: 1, kind: 'echo' }]);
});

test('styling a merged display row patches each source record without replacing the later row metadata', () => {
	const h = createStyleEditor({ text: 'ABCD' });
	const c = h.context;
	c.multiVocalMode = false;
	c.mergedLineDrafts[3] = [7];
	c.syncData.lines[1].styleRanges = [{ start: 3, end: 6, kind: 'echo', speaker: 'MALE 1' }];
	c.syncData.lines[2].styleRanges = [{ start: 7, end: 10, kind: 'glow', speaker: 'FEMALE 1' }];
	c.syncData.lines[2].note = { keep: 'later-row' };
	h.render();
	assert.equal(c.currentLineText, 'ABCDTAIL');
	const before = withoutStyles(c.syncData);
	h.rightDrag(2, 5);
	assert.equal(h.style({ kind: 'whisper' }), true);
	assert.deepEqual(plain(c.syncData.lines[1].styleRanges), [
		{ start: 3, end: 4, kind: 'echo', speaker: 'MALE 1' },
		{ start: 5, end: 6, kind: 'whisper', speaker: 'MALE 1' },
	]);
	assert.deepEqual(plain(c.syncData.lines[2].styleRanges), [
		{ start: 7, end: 8, kind: 'whisper', speaker: 'FEMALE 1' },
		{ start: 9, end: 10, kind: 'glow', speaker: 'FEMALE 1' },
	]);
	assert.deepEqual(withoutStyles(c.syncData), before);
});

test('clear-style action removes only the chosen span and keeps neighboring style metadata and timing', () => {
	const h = createStyleEditor();
	h.line().styleRanges = [{ start: 3, end: 10, kind: 'echo', speaker: 'FEMALE 1' }];
	h.rightDrag(2, 3);
	h.render();
	const before = withoutStyles(h.context.syncData);
	const clear = [...nodes(h.styleTree())].find(node => node?.type === 'button' && node.children.includes('syncCreator.rangeStyleClear'));
	assert.ok(clear);
	assert.equal(clear.props.disabled, false);
	clear.props.onClick();
	assert.deepEqual(plain(lineStyles(h)), [
		{ start: 3, end: 4, kind: 'echo', speaker: 'FEMALE 1' },
		{ start: 7, end: 10, kind: 'echo', speaker: 'FEMALE 1' },
	]);
	assert.deepEqual(withoutStyles(h.context.syncData), before);
});

test('style selection helper merges exact adjacent indices, not the hidden gaps or unselected refs', () => {
	const h = createStyleEditor();
	const ranges = vm.runInContext(`getSyncCreatorStyleSelectionRanges(
		{start: 1, end: 4},
		[3, 7, 8, 11, 12, 14].map(absoluteIndex => ({absoluteIndex})), 3, 14
	)`, h.context);
	assert.deepEqual(plain(ranges), [{ start: 7, end: 8 }, { start: 11, end: 12 }]);
	for (const expression of [
		'null, [{absoluteIndex:3}], 3, 10',
		'{start:-1,end:0}, [{absoluteIndex:3}], 3, 10',
		'{start:0,end:1}, [{absoluteIndex:3}], 3, 10',
		'{start:1,end:0}, [{absoluteIndex:3},{absoluteIndex:4}], 3, 10',
		'{start:0,end:0}, [{absoluteIndex:2}], 3, 10',
		'{start:0,end:0}, [{absoluteIndex:11}], 3, 10',
		'{start:0,end:0}, [{}], 3, 10',
	]) assert.deepEqual(plain(vm.runInContext(`getSyncCreatorStyleSelectionRanges(${expression})`, h.context)), [], expression);
});

test('astral Unicode characters use character refs rather than UTF-16 byte or code-unit offsets', () => {
	const h = createStyleEditor({ text: 'A🎵漢字B' });
	const before = withoutStyles(h.context.syncData);
	h.rightDrag(1, 2);
	h.chooseEffect('glow');
	assert.deepEqual(plain(lineStyles(h)), [{ start: 4, end: 5, kind: 'glow' }]);
	const labels = [...nodes(h.styleTree())].filter(node => typeof node === 'string').join(' ');
	assert.match(labels, /“🎵漢”/);
	assert.deepEqual(withoutStyles(h.context.syncData), before);
});
