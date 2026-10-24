import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = read('Pages.js');

const start = source.indexOf('const CreatorProfileTrackRow =');
const end = source.indexOf('const CreatorDecorationEditor =');
assert.ok(start >= 0 && end > start, 'CreatorProfileTrackRow must be its own component');

const pickerCalls = [];
const PlaylistPickerButton = (props) => {
	pickerCalls.push(props);
	return { type: 'PlaylistPickerButton', props };
};
const context = vm.createContext({
	window: { PlaylistPicker: { PlaylistPickerButton } },
	react: {
		Fragment: Symbol('Fragment'),
		memo: (component) => component,
		createElement: (type, props, ...children) => (
			typeof type === 'function'
				? type({ ...props, children })
				: { type, props, children }
		)
	},
	CreatorProfileTrackCover: 'Cover',
	SyncScoreBadge: 'ScoreBadge',
	formatContributorTimestamp: () => '2 days ago'
});
vm.runInContext(`${source.slice(start, end)}\nglobalThis.Row = CreatorProfileTrackRow;`, context);
const Row = context.Row;

const walk = (node, visit, parents = []) => {
	if (Array.isArray(node)) return node.forEach((child) => walk(child, visit, parents));
	if (!node || typeof node !== 'object') return;
	visit(node, parents);
	walk(node.children, visit, [...parents, node]);
};
const findAll = (tree, predicate) => {
	const found = [];
	walk(tree, (node) => {
		if (predicate(node)) found.push(node);
	});
	return found;
};
const item = (overrides = {}) => ({ trackId: '4uLU6hMCjMI75M1A2tKUQC', trackName: 'Everlong', artists: 'Foo Fighters', provider: 'lrclib', ...overrides });

const render = (overrides = {}) => {
	pickerCalls.length = 0;
	const navigations = [];
	const tree = Row({
		item: item(),
		copy: { unknownTrack: 'Unknown Track', updated: 'Updated' },
		onTrackClick: (trackId) => navigations.push(trackId),
		openPlaylistTrackKey: null,
		onPlaylistOpenChange: () => {},
		theme: null,
		...overrides
	});
	return { tree, navigations, picker: pickerCalls[0] };
};

const openTrackButton = (tree) => findAll(tree, (node) => node.type === 'button' && node.props?.className === 'lyrics-creator-profile-track-open')[0];

test('the row is a container, not a button, so the picker can sit beside it', () => {
	const { tree } = render();

	assert.equal(tree.type, 'div');
	assert.equal(tree.props.className, 'lyrics-creator-profile-track');
});

test('the track title stays clickable and still navigates by raw track id', () => {
	const { tree, navigations } = render();
	const open = openTrackButton(tree);

	assert.ok(open, 'the cover and title keep their own button');
	open.props.onClick();

	assert.deepEqual(navigations, ['4uLU6hMCjMI75M1A2tKUQC']);
	assert.equal(findAll(open, (node) => node.type === 'Cover').length, 1);
});

test('the playlist picker is a sibling of the track button, never nested inside it', () => {
	const { tree } = render();
	const open = openTrackButton(tree);

	assert.equal(findAll(open, (node) => node.type === 'PlaylistPickerButton').length, 0);
	assert.equal(findAll(tree, (node) => node.type === 'PlaylistPickerButton').length, 1);

	let ancestors = null;
	walk(tree, (node, parents) => {
		if (node.type !== 'PlaylistPickerButton') return;
		ancestors = parents.map((parent) => parent.props?.className).filter(Boolean);
	});
	assert.ok(!ancestors.includes('lyrics-creator-profile-track-open'));
	assert.ok(ancestors.includes('lyrics-creator-profile-track-actions'));
});

test('the picker adds the Spotify track for that row', () => {
	const { picker } = render();

	assert.equal(picker.trackUri, 'spotify:track:4uLU6hMCjMI75M1A2tKUQC');
	assert.equal(picker.anchored, true, 'the profile grid scrolls, so the menu is portalled');
});

test('each row offers the picker for its own track', () => {
	const { picker } = render({ item: item({ trackId: '0eGsygTp906u18L0Oimnem' }) });

	assert.equal(picker.trackUri, 'spotify:track:0eGsygTp906u18L0Oimnem');
});

test('only the row with the open menu is marked open', () => {
	const key = '4uLU6hMCjMI75M1A2tKUQC:lrclib';
	assert.equal(render({ openPlaylistTrackKey: key }).picker.open, true);
	assert.equal(render({ openPlaylistTrackKey: 'other:lrclib' }).picker.open, false);
});

test('the updated date reads with the track, not with the row actions', () => {
	const { tree } = render();
	const updated = findAll(tree, (node) => node.props?.className === 'lyrics-creator-profile-track-updated');

	assert.equal(updated.length, 1);
	assert.equal(updated[0].children[0], 'Updated 2 days ago');

	let zone = null;
	walk(tree, (node, parents) => {
		if (node !== updated[0]) return;
		zone = parents.map((parent) => parent.props?.className).filter(Boolean);
	});
	assert.ok(zone.includes('lyrics-creator-profile-track-main'), 'the date belongs to the track');
	assert.ok(!zone.includes('lyrics-creator-profile-track-actions'), 'and not to the actions cluster');
});

test('the actions cluster keeps only the score, provider and picker', () => {
	const { tree } = render();
	const cluster = findAll(tree, (node) => node.props?.className === 'lyrics-creator-profile-track-actions')[0];

	assert.equal(findAll(cluster, (node) => node.props?.className === 'lyrics-creator-profile-track-updated').length, 0);
	assert.equal(findAll(cluster, (node) => node.type === 'ScoreBadge').length, 1, 'the score badge still shows');
	assert.equal(findAll(cluster, (node) => node.type === 'PlaylistPickerButton').length, 1);
});

test('the picker is bounded by the profile modal so its menu cannot escape it', () => {
	const { picker } = render();

	assert.equal(picker.boundary, '.lyrics-creator-profile-modal');
});

test('the menu follows the profile theme toggle', () => {
	assert.equal(render({ theme: 'light' }).picker.theme, 'light');
	assert.equal(render({ theme: 'dark' }).picker.theme, 'dark');
});

test('a contribution without a Spotify track id does not offer the picker', () => {
	const { tree, picker } = render({ item: item({ trackId: '' }) });

	assert.equal(picker, undefined, 'nothing to add to a playlist without a track');
	assert.ok(openTrackButton(tree), 'the track itself stays navigable');
});

test('rows for tracks without a name fall back to the localized placeholder', () => {
	const { tree } = render({ item: item({ trackName: '' }) });
	const labels = findAll(tree, (node) => node.props?.className === 'lyrics-creator-profile-track-title');

	assert.equal(labels.length, 1);
	assert.equal(labels[0].children[0], 'Unknown Track');
});
