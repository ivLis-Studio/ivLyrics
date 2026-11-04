import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const source = read('PlaylistPicker.js');

const KO = (() => {
	const context = { window: {} };
	vm.runInNewContext(read('langs/LangKo.js'), context);
	return Object.values(context.window)[0];
})();
const t = (key) => key.split('.').reduce((value, part) => value?.[part], KO) ?? key;

const start = source.indexOf('const PLAYLIST_POPOVER_GAP');
const end = source.indexOf('const PlaylistPicker = (() => {');
const context = vm.createContext({
	react: {
		Fragment: Symbol('Fragment'),
		createElement: (type, props, ...children) => ({ type, props, children })
	},
	I18n: { t }
});
vm.runInContext(`${source.slice(start, end)}\nglobalThis.Panel = PlaylistPickerPanel;`, context);
const Panel = context.Panel;

const COPY = {
	title: t('fullscreen.controls.addToPlaylist'),
	loading: t('fullscreen.controls.playlistLoading'),
	tracks: t('fullscreen.controls.playlistTracks'),
	checking: t('fullscreen.controls.playlistChecking'),
	alreadyIn: t('fullscreen.controls.playlistAlreadyInList'),
	remove: t('fullscreen.controls.playlistRemove')
};

const playlist = (id, overrides = {}) => ({ id, uri: `spotify:playlist:${id}`, name: `List ${id}`, total: 12, ...overrides });
const render = (props = {}) => Panel({ copy: COPY, playlists: [], error: '', loading: false, statuses: {}, pendingPlaylistId: '', onItemAction: () => {}, ...props });

const walk = (node, visit) => {
	if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
	if (!node || typeof node !== 'object') return;
	visit(node);
	walk(node.children, visit);
};
const findAll = (tree, predicate) => {
	const found = [];
	walk(tree, (node) => {
		if (predicate(node)) found.push(node);
	});
	return found;
};
const textOf = (node) => {
	let text = '';
	walk(node, (child) => {
		child.children.forEach((value) => {
			if (typeof value === 'string') text += value;
		});
	});
	return text;
};
const items = (tree) => findAll(tree, (node) => node.type === 'button' && node.props?.className?.startsWith('fullscreen-playlist-item'));
const states = (tree) => findAll(tree, (node) => typeof node.props?.className === 'string' && node.props.className.startsWith('fullscreen-playlist-state'));

test('the panel titles the menu with the add to playlist label', () => {
	const title = findAll(render(), (node) => node.props?.className === 'fullscreen-playlist-popover-title');

	assert.equal(title.length, 1);
	assert.equal(title[0].children[0], COPY.title);
});

test('the panel reports loading, then an error, instead of listing playlists', () => {
	const loading = states(render({ loading: true, playlists: [playlist('a')] }));
	assert.equal(loading.length, 1);
	assert.equal(loading[0].children[0], COPY.loading);
	assert.equal(items(render({ loading: true, playlists: [playlist('a')] })).length, 0);

	const failed = states(render({ error: 'boom' }));
	assert.equal(failed.length, 1);
	assert.ok(failed[0].props.className.includes('error'));
	assert.equal(failed[0].children[0], 'boom');
	assert.equal(items(render({ error: 'boom', playlists: [playlist('a')] })).length, 0);
});

test('every playlist renders its name, track count and artwork', () => {
	const withImage = render({ playlists: [playlist('a', { image: 'https://img/a.png' })] });
	const [imageItem] = items(withImage);
	const image = findAll(imageItem, (node) => node.type === 'img');

	assert.equal(image.length, 1);
	assert.equal(image[0].props.src, 'https://img/a.png');
	assert.equal(image[0].props.className, 'fullscreen-playlist-item-image');
	assert.ok(textOf(imageItem).includes('List a'));
	assert.ok(textOf(imageItem).includes(`12 ${COPY.tracks}`));

	const fallbackGlyph = findAll(items(render({ playlists: [playlist('b')] }))[0], (node) => node.props?.className === 'fullscreen-playlist-item-fallback');
	assert.equal(fallbackGlyph.length, 1);
	assert.equal(fallbackGlyph[0].children[0], '♪');
});

test('clicking an item hands the whole playlist to the action handler', () => {
	const onItemAction = [];
	const list = playlist('a');
	const [item] = items(render({ playlists: [list], onItemAction: (value) => onItemAction.push(value) }));

	item.props.onClick();

	assert.deepEqual(onItemAction, [list]);
	assert.equal(item.props.role, 'menuitem');
});

test('a playlist that already holds the track offers removal instead of adding', () => {
	const list = playlist('a');
	const [plain, contained] = items(render({ playlists: [list, playlist('b', {})], statuses: { b: { status: 'contains', uids: ['uid-1'] } } }));

	assert.equal(plain.props.className, 'fullscreen-playlist-item');
	assert.ok(!textOf(plain).includes(COPY.remove));

	assert.equal(contained.props.className, 'fullscreen-playlist-item contains-current-track');
	assert.ok(textOf(contained).includes(COPY.alreadyIn));
	assert.ok(textOf(contained).includes(COPY.remove));
});

test('bare string statuses are read the same way as object statuses', () => {
	const [contained] = items(render({ playlists: [playlist('a')], statuses: { a: 'contains' } }));

	assert.equal(contained.props.className, 'fullscreen-playlist-item contains-current-track');
});

test('checking and pending playlists cannot be activated twice', () => {
	const checking = items(render({ playlists: [playlist('a')], statuses: { a: { status: 'checking', uids: [] } } }))[0];
	assert.equal(checking.props.disabled, true);
	assert.ok(textOf(checking).includes(COPY.checking));

	const pending = items(render({ playlists: [playlist('a'), playlist('b')], pendingPlaylistId: 'b' }))[0];
	assert.equal(pending.props.disabled, true);
	assert.ok(textOf(items(render({ playlists: [playlist('a')], pendingPlaylistId: 'a' }))[0]).includes('...'));
});

test('a missing status means the playlist can still be added to', () => {
	const [item] = items(render({ playlists: [playlist('a')], statuses: {} }));

	assert.equal(item.props.className, 'fullscreen-playlist-item');
	assert.equal(item.props.disabled, false);
});
