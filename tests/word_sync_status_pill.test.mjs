import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../index.js', import.meta.url), 'utf8');
const section = (start, end) => {
    const from = source.indexOf(start), to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from, start);
    return source.slice(from, to);
};
const languages = Object.fromEntries(['Ko', 'En'].map(lang => {
    const context = { window: {} };
    vm.runInNewContext(readFileSync(new URL(`../langs/Lang${lang}.js`, import.meta.url), 'utf8'), context);
    return [lang, Object.values(context.window)[0]];
}));

function harness() {
    let now = 0, timerId = 0;
    const timers = new Map(), active = [];
    const h = { language: 'Ko', enabled: true };
    const context = vm.createContext({
        window: { LyricsAddonManager: {
            isProviderEnabled: () => h.enabled,
            getAddon: () => ({ getWordSyncStatuses: uri => active.filter(status => status.uri === uri) }),
        } },
        I18n: { t: key => key.split('.').reduce((value, part) => value?.[part], languages[h.language]) || key },
        react: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
        isSyncCreatorActive: false, isFullscreenMarketplace: false,
        setTimeout: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
        clearTimeout: id => timers.delete(id),
    });
    vm.runInContext(`
        ${section('const GENERATION_PILL_TIMING =', '// Enhanced FAD container detection')}
        class Container {
            ${section('  clearGenerationPillTimers(kind)', '  clearVideoBackgroundLoadingDelay()')}
            ${section('  startGenerationRequestLoading(kind', '  startLyricsLoading()')}
            renderStatus() {
                ${section('    const computeGenerationStatusStack =', '    const generationStatusStack = computeGenerationStatusStack();')}
                return computeGenerationStatusStack();
            }
        }
        globalThis.app = new Container();
        for (const config of Object.values(GENERATION_REQUEST_PILL_CONFIG)) {
            app[config.tokensKey] = new Set(); app[config.sequenceKey] = 0;
            app[config.timerKey] = null; app[config.failureKey] = false;
        }
    `, context);
    const app = context.app;
    Object.assign(app, {
        state: { uri: 'track-a', generationPills: {} }, currentTrackUri: 'track-a', _isComponentMounted: true,
        _generationPillTimers: new Map(), _generationPillRevisions: new Map(),
        _visibleGenerationPills: new Set(), _generationRequestDetails: new Map(), _wordSyncStatusTokens: new Map(),
        setState(update) { const value = typeof update === 'function' ? update(this.state) : update; this.state = { ...this.state, ...value }; },
    });
    return Object.assign(h, {
        app, active,
        status: (phase, requestId = 'request-a', uri = app.currentTrackUri) => app.handleWordSyncLoading({ phase, requestId, uri }),
        advance: ms => {
            now += ms;
            for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.fn(); }
        },
    });
}

const flatten = node => !node ? [] : Array.isArray(node) ? node.flatMap(flatten)
    : typeof node === 'object' ? [node, ...node.children.flatMap(flatten)] : [node];

test('word sync uses the same top-left stack as translation, with live localized text', () => {
    const h = harness();
    h.app.startGenerationRequestLoading('translation'); h.advance(1000);
    h.status('generating');
    const tree = h.app.renderStatus(), nodes = flatten(tree);
    assert.equal(tree.props.className, 'lyrics-generation-status-stack');
    assert.equal(tree.props.role, 'status');
    const pills = nodes.filter(node => node.props?.['data-kind']);
    assert.equal(pills.length, 2);
    assert.ok(pills.every(pill => pill.props.className === 'lyrics-translation-loading-indicator is-loading'));
    assert.ok(nodes.includes('단어 싱크'));
    assert.ok(nodes.includes('외부 가사 서버에서 단어 단위 싱크 데이터를 생성 중입니다.'));
    h.language = 'En';
    const english = flatten(h.app.renderStatus());
    assert.ok(english.includes('Word timing'));
    assert.ok(english.includes('Generating word-level timing on an external lyrics server.'));
});

test('one request produces one pill and follows the shared complete/exit lifecycle', () => {
    const h = harness(); h.status('generating'); h.status('generating');
    assert.equal(h.app._activeWordSyncLoadingTokens.size, 1);
    h.status('complete');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'complete');
    h.advance(520);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'exiting');
    h.advance(180);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
});

test('failed generation hides its pill without completing or clearing translation', () => {
    const h = harness(); h.app.startGenerationRequestLoading('translation'); h.advance(1000);
    h.status('generating'); h.status('failed');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
    assert.equal(h.app.state.generationPills.translation.phase, 'loading');
    assert.equal(h.app._activeTranslationLoadingTokens.size, 1);
});

test('prefetch status for another track never appears on the current track', () => {
    const h = harness(); h.status('generating', 'other-request', 'track-b');
    assert.equal(h.app._activeWordSyncLoadingTokens.size, 0);
    assert.equal(h.app.renderStatus(), null);
});

test('a late completion cannot close a newer request after a track transition', () => {
    const h = harness(); h.status('generating'); h.app.clearWordSyncLoading();
    h.app.currentTrackUri = 'track-b'; h.app.state.uri = 'track-b';
    h.status('generating', 'request-b');
    h.status('complete', 'request-a', 'track-a');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'loading');
    h.status('complete', 'request-b');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'complete');
});

test('opening/reloading the page restores an existing generation without another request', () => {
    const h = harness();
    h.active.push({ uri: 'track-a', requestId: 'existing-job', phase: 'generating' });
    h.app.restoreWordSyncLoading();
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'loading');
    h.app.clearWordSyncLoading(); h.app.restoreWordSyncLoading();
    assert.equal(h.app._activeWordSyncLoadingTokens.size, 1);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'loading');
});

test('disabled lrc.red does not show a generation pill', () => {
    const h = harness(); h.enabled = false; h.status('generating');
    assert.equal(h.app._activeWordSyncLoadingTokens.size, 0);
});
