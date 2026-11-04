import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const read = (name) => readFileSync(new URL('../' + name, import.meta.url), 'utf8');

const KO = (() => {
	const context = { window: {} };
	vm.runInNewContext(read('langs/LangKo.js'), context);
	return Object.values(context.window)[0];
})();
const t = (key) => key.split('.').reduce((value, part) => value?.[part], KO) ?? key;

/**
 * Runs the real PlaylistPicker module against a fake Spicetify: playlist
 * discovery, membership checks and add/remove calls are the ones production
 * makes, so the assertions below describe behaviour rather than markup.
 *
 * One harness == one module instance, so several pickers can be opened in the
 * same "page" and share whatever the module caches between them.
 */
const createHarness = ({
	rootlist = [],
	contains = new Set(),
	trackUri = 'spotify:track:t1',
	failAdd = false,
	failLoad = false,
	buttonClassName = 'fullscreen-control-btn',
	anchored = false,
	theme = null
} = {}) => {
	const calls = { add: [], remove: [], find: [], rootlist: 0 };
	const toasts = [];
	const warnings = [];
	const portalled = [];
	const anchorRect = { top: 400, bottom: 436, left: 100, right: 136 };
	let now = 1_700_000_000_000;
	let active = null;
	const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => Object.is(value, b[i]));

	const react = {
		useState: (initial) => {
			const owner = active;
			const index = owner.cursor++;
			if (!(index in owner.slots)) owner.slots[index] = { value: typeof initial === 'function' ? initial() : initial };
			return [owner.slots[index].value, (next) => {
				const value = typeof next === 'function' ? next(owner.slots[index].value) : next;
				if (!Object.is(value, owner.slots[index].value)) {
					owner.slots[index].value = value;
					owner.dirty = true;
				}
			}];
		},
		useMemo: (factory, deps) => {
			const owner = active;
			const index = owner.cursor++;
			if (!owner.slots[index] || !sameDeps(owner.slots[index].deps, deps)) owner.slots[index] = { value: factory(), deps };
			return owner.slots[index].value;
		},
		useCallback: (callback, deps) => react.useMemo(() => callback, deps),
		useRef: (current) => react.useMemo(() => ({ current }), []),
		useEffect: (effect, deps) => {
			const owner = active;
			const index = owner.cursor++;
			if (!owner.slots[index] || !sameDeps(owner.slots[index].deps, deps)) {
				owner.effects.push(() => {
					owner.slots[index]?.cleanup?.();
					owner.slots[index] = { deps, cleanup: effect() };
				});
			}
		},
		memo: (component) => component,
		Fragment: Symbol('Fragment'),
		// React would attach the real node; a measurable stand-in is enough to
		// exercise the anchored placement.
		createElement: (type, props, ...children) => {
			if (props?.ref) props.ref.current = { getBoundingClientRect: () => anchorRect };
			return { type, props: { ...props, children } };
		}
	};

	const spicetify = {
		React: react,
		SVGIcons: {},
		Config: {},
		Player: { data: { item: { uri: trackUri } } },
		Platform: {
			LocalStorageAPI: { namespace: 'spotify:user:tester' },
			RootlistAPI: {
				getContents: async () => {
					calls.rootlist += 1;
					if (failLoad) throw new Error('rootlist down');
					return { items: rootlist };
				}
			},
			PlaylistAPI: {
				getMetadata: async () => null,
				find: async (playlistUri, uris) => {
					calls.find.push([playlistUri, uris]);
					return contains.has(playlistUri) ? { [uris[0]]: { uids: ['uid-1'] } } : {};
				},
				getContents: async () => ({ items: [] }),
				add: async (playlistUri, uris) => {
					calls.add.push([playlistUri, uris]);
					if (failAdd) throw new Error('nope');
				},
				remove: async (playlistUri, items) => { calls.remove.push([playlistUri, items]); }
			}
		}
	};

	// Production resolves ReactDOM off window, the way the rest of the app does.
	// Never inject a bare `reactDom` global here: the bundle has no such binding.
	const context = vm.createContext({
		window: {
			innerWidth: 1200,
			innerHeight: 900,
			addEventListener() {},
			removeEventListener() {},
			Spicetify: {
				ReactDOM: {
					createPortal: (children, container) => {
						portalled.push(container);
						return { __portal: children, container };
					}
				}
			}
		},
		document: { addEventListener() {}, removeEventListener() {}, body: {} },
		console: { warn: (...args) => warnings.push(args.join(' ')), log() {}, error() {} },
		// Controllable clock so cache expiry can be exercised without timers.
		Date: class extends Date { static now() { return now; } },
		setTimeout,
		clearTimeout,
		react,
		Spicetify: spicetify,
		I18n: { t },
		Toast: {
			success: (message) => toasts.push(['success', message]),
			error: (message) => toasts.push(['error', message])
		}
	});
	vm.runInContext(read('PlaylistPicker.js'), context);
	const { PlaylistPickerButton } = context.window.PlaylistPicker;

	const create = (overrides = {}) => {
		const props = { trackUri, buttonClassName, anchored, theme, ...overrides };
		const instance = { slots: [], cursor: 0, dirty: false, effects: [], tree: null };

		instance.render = () => {
			do {
				instance.dirty = false;
				instance.cursor = 0;
				instance.effects.length = 0;
				active = instance;
				instance.tree = PlaylistPickerButton(props);
				instance.effects.forEach((effect) => effect());
			} while (instance.dirty || instance.effects.length);
			active = null;
		};

		instance.settle = async () => {
			for (let step = 0; step < 12; step++) {
				instance.render();
				await Promise.resolve();
				await new Promise((resolve) => setImmediate(resolve));
			}
			instance.render();
		};

		const walk = (node, visit) => {
			if (Array.isArray(node)) return node.forEach((child) => walk(child, visit));
			if (!node || typeof node !== 'object') return;
			visit(node);
			walk(node.props?.children, visit);
			if (node.__portal) walk(node.__portal, visit);
		};
		const find = (predicate) => {
			const found = [];
			walk(instance.tree, (node) => { if (predicate(node)) found.push(node); });
			return found;
		};

		instance.trigger = () => find((node) => node.type === 'button' && node.props['aria-haspopup'] === 'menu')[0];
		instance.popover = () => find((node) => node.props?.role === 'menu')[0];
		instance.menuItems = () => find((node) => node.type === 'button' && node.props?.className?.startsWith('fullscreen-playlist-item'));
		instance.states = () => find((node) => typeof node.props?.className === 'string' && node.props.className.startsWith('fullscreen-playlist-state'));
		instance.stateText = () => instance.states().map((node) => node.props.children[0]).filter(Boolean);
		instance.nameOf = (item) => item.props.children[1].props.children[0].props.children[0];

		instance.open = async () => {
			instance.render();
			instance.trigger().props.onClick();
			await instance.settle();
		};
		instance.close = async () => {
			instance.trigger().props.onClick();
			await instance.settle();
		};
		instance.clickItem = async (index) => {
			instance.menuItems()[index].props.onClick();
			await instance.settle();
		};

		instance.render();
		return instance;
	};

	return {
		calls, toasts, warnings, portalled, create,
		advance: (ms) => { now += ms; },
		plain: (value) => JSON.parse(JSON.stringify(value))
	};
};

const owned = (id, overrides = {}) => ({ type: 'playlist', uri: `spotify:playlist:${id}`, name: `List ${id}`, isOwnedBySelf: true, ...overrides });

test('the menu stays closed until the trigger is pressed', async () => {
	const picker = createHarness({ rootlist: [owned('a')] }).create();

	assert.equal(picker.trigger().props['aria-expanded'], 'false');
	assert.equal(picker.popover(), undefined);

	await picker.open();

	assert.equal(picker.trigger().props['aria-expanded'], 'true');
	assert.ok(picker.popover());
});

test('opening lists the playlists the viewer can edit', async () => {
	const picker = createHarness({
		rootlist: [owned('a'), owned('b'), { type: 'playlist', uri: 'spotify:playlist:foreign', name: 'Someone else', owner: { id: 'spotify:user:other' } }]
	}).create();

	await picker.open();

	assert.deepEqual(picker.menuItems().map(picker.nameOf), ['List a', 'List b']);
});

test('clicking a playlist without the track adds it and closes the menu', async () => {
	const harness = createHarness({ rootlist: [owned('a')] });
	const picker = harness.create();
	await picker.open();

	await picker.clickItem(0);

	assert.deepEqual(harness.plain(harness.calls.add), [['spotify:playlist:a', ['spotify:track:t1']]]);
	assert.deepEqual(harness.calls.remove, []);
	assert.equal(picker.popover(), undefined);
	assert.deepEqual(harness.toasts, [['success', t('fullscreen.controls.playlistAdded').replace('{playlist}', 'List a')]]);
});

test('clicking a playlist that already holds the track removes it and keeps the menu open', async () => {
	const harness = createHarness({ rootlist: [owned('a')], contains: new Set(['spotify:playlist:a']) });
	const picker = harness.create();
	await picker.open();

	await picker.clickItem(0);

	assert.deepEqual(harness.plain(harness.calls.remove), [['spotify:playlist:a', [{ uri: 'spotify:track:t1', uid: 'uid-1' }]]]);
	assert.deepEqual(harness.calls.add, []);
	assert.ok(picker.popover());
	assert.deepEqual(harness.toasts, [['success', t('fullscreen.controls.playlistRemoved').replace('{playlist}', 'List a')]]);
});

test('tracks that are not Spotify tracks are refused before any playlist API call', async () => {
	const harness = createHarness({ rootlist: [owned('a')], trackUri: 'local:track:abc' });
	const picker = harness.create();
	await picker.open();

	await picker.clickItem(0);

	assert.deepEqual(harness.calls.add, []);
	assert.deepEqual(harness.toasts, [['error', t('fullscreen.controls.playlistNoTrack')]]);
});

test('the trigger marks itself active only while the menu is open', async () => {
	const picker = createHarness({ rootlist: [owned('a')] }).create();

	assert.equal(picker.trigger().props.className, 'fullscreen-control-btn');

	await picker.open();

	assert.equal(picker.trigger().props.className, 'fullscreen-control-btn active');
});

test('the trigger keeps the styling the host asked for', async () => {
	const picker = createHarness({ rootlist: [owned('a')], buttonClassName: 'lyrics-creator-profile-track-playlist' }).create();

	await picker.open();

	assert.equal(picker.trigger().props.className, 'lyrics-creator-profile-track-playlist active');
});

test('the anchored menu is portalled and pinned above the creator profile modal', async () => {
	const harness = createHarness({ rootlist: [owned('a')], anchored: true });
	const picker = harness.create();
	await picker.open();

	const { style } = picker.popover().props;
	assert.equal(style.position, 'fixed');
	assert.equal(style.right, 'auto');
	assert.equal(style.bottom, 'auto');
	assert.equal(style.zIndex, 'var(--iv-layer-modal)');
	assert.ok(harness.portalled.length > 0, 'the menu is rendered through window ReactDOM');
	assert.ok(harness.portalled.every(Boolean), 'portalled onto the document body');
});

test('the anchored menu is revealed once its position is measured', async () => {
	const picker = createHarness({ rootlist: [owned('a')], anchored: true }).create();
	await picker.open();

	assert.equal(picker.popover().props.style.visibility, 'visible');
});

test('the menu carries the host theme so the shared styles can follow it', async () => {
	const themed = createHarness({ rootlist: [owned('a')], anchored: true, theme: 'light' }).create();
	await themed.open();
	assert.equal(themed.popover().props['data-ui-theme'], 'light');

	const unthemed = createHarness({ rootlist: [owned('a')] }).create();
	await unthemed.open();
	assert.ok(!unthemed.popover().props['data-ui-theme'], 'no attribute when the host has no theme');
});

test('the fullscreen menu keeps its in-flow positioning and no inline style', async () => {
	const harness = createHarness({ rootlist: [owned('a')] });
	const picker = harness.create();
	await picker.open();

	assert.deepEqual(harness.portalled, []);
	assert.equal(picker.popover().props.style, undefined);
	assert.equal(picker.popover().props.className, 'fullscreen-playlist-popover');
});

test('a failing add reports the error and keeps the menu open', async () => {
	const harness = createHarness({ rootlist: [owned('a')], failAdd: true });
	const picker = harness.create();
	await picker.open();

	await picker.clickItem(0);

	assert.equal(harness.calls.add.length, 1);
	assert.ok(picker.popover());
	assert.deepEqual(harness.toasts, [['error', t('fullscreen.controls.playlistAddFailed')]]);
	assert.ok(harness.warnings.some((warning) => warning.includes('Failed to update playlist track')));
});

test('the playlist list is fetched once and reused when the menu reopens', async () => {
	const harness = createHarness({ rootlist: [owned('a')] });
	const picker = harness.create();

	await picker.open();
	await picker.close();
	await picker.open();

	assert.equal(harness.calls.rootlist, 1);
});

test('a second row reuses the list instead of fetching it again', async () => {
	const harness = createHarness({ rootlist: [owned('a'), owned('b')] });
	const first = harness.create({ trackUri: 'spotify:track:one' });
	const second = harness.create({ trackUri: 'spotify:track:two' });

	await first.open();
	await second.open();

	assert.equal(harness.calls.rootlist, 1, 'the shared list is loaded once for every row');
	assert.deepEqual(second.menuItems().map(second.nameOf), ['List a', 'List b']);
});

test('a row opened after the list is cached shows it immediately, with no loading state', async () => {
	const harness = createHarness({ rootlist: [owned('a')] });
	await harness.create().open();

	const later = harness.create({ trackUri: 'spotify:track:two' });
	await later.open();

	assert.deepEqual(later.stateText(), [], 'no "Loading playlists..." on a warm cache');
	assert.deepEqual(later.menuItems().map(later.nameOf), ['List a']);
});

test('a failing load reports the error instead of retrying in a loop', async () => {
	const harness = createHarness({ rootlist: [owned('a')], failLoad: true });
	const picker = harness.create();

	await picker.open();

	// One attempt: the getContents call plus its documented Cosmos fallback.
	assert.equal(harness.calls.rootlist, 2, 'an open menu must not hammer a failing rootlist');
	assert.deepEqual(picker.stateText(), [t('fullscreen.controls.playlistLoadFailed')]);

	const second = harness.create();
	await second.open();

	assert.equal(harness.calls.rootlist, 4, 'a failure never poisons the cache, so a new menu retries');
});

test('the cached list is refreshed once it goes stale', async () => {
	const harness = createHarness({ rootlist: [owned('a')] });
	await harness.create().open();

	harness.advance(4 * 60 * 1000);
	await harness.create().open();
	assert.equal(harness.calls.rootlist, 1, 'still fresh a minute before expiry');

	harness.advance(2 * 60 * 1000);
	await harness.create().open();
	assert.equal(harness.calls.rootlist, 2, 'refetched once the list is stale');
});
