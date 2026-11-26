import { createLyricsGenerationStatusController } from "../src/lyrics/lyricsGenerationStatusController.mjs";
import { createVideoBackgroundLoadingStatus } from "../src/features/video/videoBackgroundLoadingStatus.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import test from 'node:test';
import { createPageLyricsGenerationHandlers } from "../src/lyrics/pageLyricsGenerationHandlers.mjs";
import { renderLyricsGenerationStatus } from '../src/lyrics/lyricsPageGenerationStatus.mjs';

const languages = Object.fromEntries(['Ko', 'En'].map(lang => [lang, readLanguageTable(`Lang${lang}.js`)]));

function harness() {
    let now = 0, timerId = 0;
    const timers = new Map(), active = [];
    const h = { language: 'Ko', enabled: true };
    const translate = key => key.split('.').reduce((value, part) => value?.[part], languages[h.language]) || key;
    const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
    const app = {
        state: { uri: 'track-a', generationPills: {} }, currentTrackUri: 'track-a', _isComponentMounted: true,
        setState(update) {
            const value = typeof update === 'function' ? update(this.state) : update;
            this.state = { ...this.state, ...value };
        },
        renderStatus() {
            return renderLyricsGenerationStatus({
                react, translate, generationPills: this.state.generationPills,
                isSyncCreatorActive: false, isFullscreenMarketplace: false,
            });
        },
    };
    const manager = {
        isProviderEnabled: () => h.enabled,
        getAddon: () => ({ getWordSyncStatuses: uri => active.filter(status => status.uri === uri) }),
    };
    Object.assign(app, createPageLyricsGenerationHandlers({
        page: app, readLyricsAddonManager: () => manager, readPronunciationFirst: () => null, translate,
    }));
    const controllerTimers = {
        isMounted: () => app._isComponentMounted,
        scheduleTimer: (fn, delay) => { const id = ++timerId; timers.set(id, { fn, at: now + delay }); return id; },
        cancelTimer: id => timers.delete(id),
    };
    const controller = createLyricsGenerationStatusController({
        ...controllerTimers, setState: update => app.setState(update),
    });
    app.generationStatus = controller;
    const video = createVideoBackgroundLoadingStatus({
        ...controllerTimers, statusPills: controller,
        readTrackUri: () => app.currentTrackUri,
        readPhase: () => app.state.generationPills["video-background"]?.phase,
    });
    return Object.assign(h, {
        app, active, controller, timers, video,
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
    h.controller.startRequest('translation'); h.advance(1000);
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
    assert.equal(h.controller.hasRequests('word-sync'), true);
    h.status('complete');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'complete');
    h.advance(520);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'exiting');
    h.advance(180);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
});

test('cancelling obsolete timing leaves a concurrent request eligible for a success indicator', () => {
    const h = harness();
    h.status('generating');
    h.status('generating', 'request-b');
    h.status('cancelled');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'loading');
    h.status('complete', 'request-b');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'complete');
    h.status('generating', 'request-c');
    h.status('cancelled', 'request-c');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
});

test('failed generation shows a localized failure with a cross, without completing or clearing translation', () => {
    const h = harness(); h.controller.startRequest('translation'); h.advance(1000);
    h.status('generating'); h.status('failed');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'failed');
    assert.equal(h.app.state.generationPills.translation.phase, 'loading');
    assert.equal(h.controller.hasRequests('translation'), true);
    const nodes = flatten(h.app.renderStatus());
    const pill = nodes.find(node => node.props?.['data-kind'] === 'word-sync');
    assert.equal(pill.props.className, 'lyrics-translation-loading-indicator is-failed');
    assert.ok(nodes.includes('단어 싱크 실패'));
    assert.ok(nodes.includes('단어 단위 싱크 데이터를 생성하거나 적용하지 못했습니다. 기존 가사를 유지합니다.'));
    assert.ok(flatten(pill).some(node => node.props?.className === 'lyrics-generation-status-error'));
    assert.ok(!flatten(pill).some(node => node.props?.className === 'lyrics-generation-status-check'));
    h.language = 'En';
    assert.ok(flatten(h.app.renderStatus()).includes('Word timing failed'));
    h.advance(3999);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'failed');
    h.advance(1);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'failed-exiting');
    assert.ok(flatten(h.app.renderStatus()).includes('Word timing failed'));
    h.advance(180);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
});

test('a retry cancels the failure timers and cannot be completed by the old request', () => {
    const h = harness(); h.status('generating'); h.status('failed');
    h.status('generating', 'request-b');
    h.advance(4180);
    h.status('complete', 'request-a');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'loading');
    h.status('complete', 'request-b');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'complete');
});

test('track cleanup hides both loading and failure without reporting a new failure', () => {
    const h = harness(); h.status('generating'); h.app.clearWordSyncLoading();
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
    h.status('generating', 'request-b'); h.status('failed', 'request-b');
    h.app.clearWordSyncLoading(); h.advance(4180);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
    h.status('complete', 'request-b');
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'idle');
});

test('every supported language includes word sync failure text', () => {
    for (const file of readdirSync(new URL('../src/i18n/langs/', import.meta.url)).filter(file => /^Lang.*\.js$/.test(file))) {
        const messages = readLanguageTable(file).generationStatus;
        assert.ok(messages.wordSyncFailed?.trim(), file);
        assert.ok(messages.externalWordSyncFailed?.trim(), file);
    }
});

test('prefetch status for another track never appears on the current track', () => {
    const h = harness(); h.status('generating', 'other-request', 'track-b');
    assert.equal(h.controller.hasRequests('word-sync'), false);
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
    assert.equal(h.controller.hasRequests('word-sync'), true);
    assert.equal(h.app.state.generationPills['word-sync'].phase, 'loading');
});

test('disabled lrc.red does not show a generation pill', () => {
    const h = harness(); h.enabled = false; h.status('generating');
    assert.equal(h.controller.hasRequests('word-sync'), false);
});


test('an obsolete loading callback cannot shorten the next request’s delay', () => {
    const h = harness();
    const oldToken = h.controller.startRequest('translation');
    const staleCallback = [...h.timers.values()][0].fn;
    h.controller.clearRequest('translation', oldToken);
    const currentToken = h.controller.startRequest('translation');
    staleCallback();
    h.controller.clearRequest('translation', oldToken, { completed: true });
    assert.equal(h.app.state.generationPills.translation.phase, 'idle');
    h.advance(999);
    assert.equal(h.app.state.isTranslationLoading, false);
    h.advance(1);
    assert.equal(h.app.state.generationPills.translation.phase, 'loading');
    h.controller.clearRequest('translation', currentToken, { completed: true });
    assert.equal(h.app.state.generationPills.translation.phase, 'complete');
});

test('a motion result can only settle its own track and stage request', () => {
    const h = harness();
    const report = (phase, uri, requestId) => h.app.handleMotionDirectionStatus({ detail: { phase, uri, requestId } });
    const phase = () => h.app.state.generationPills['motion-direction']?.phase ?? 'idle';
    report('loading', 'track-a', 'stage-a');
    assert.equal(phase(), 'loading');
    h.app.currentTrackUri = 'track-b';
    h.app.clearMotionDirectionLoading();
    report('loading', 'track-b', 'stage-b');
    report('failed', 'track-a', 'stage-a');
    report('idle', 'track-a', 'stage-a');
    assert.equal(phase(), 'loading');
    report('loading', 'track-b', 'retake-b');
    report('complete', 'track-b', 'stage-b');
    assert.equal(phase(), 'loading');
    report('complete', 'track-b', 'retake-b');
    assert.equal(phase(), 'complete');
});

test('disposing the page cancels all scheduled status transitions including motion direction', () => {
    const h = harness();
    h.app.handleMotionDirectionStatus({ detail: { phase: 'loading' } });
    h.app.handleMotionDirectionStatus({ detail: { phase: 'complete' } });
    h.controller.startRequest('translation');
    assert.equal(h.timers.size, 3);
    const staleCallbacks = [...h.timers.values()].map(timer => timer.fn);
    h.app._isComponentMounted = false;
    h.controller.dispose();
    assert.equal(h.timers.size, 0);
    h.app._isComponentMounted = true;
    h.app.handleMotionDirectionStatus({ detail: { phase: 'loading' } });
    staleCallbacks.forEach(fn => fn());
    assert.equal(h.app.state.generationPills['motion-direction'].phase, 'loading');
    assert.equal(h.controller.hasRequests('translation'), false);
});

test('video loading delays keep the current track’s notice when an older video is cleaned up', () => {
    const h = harness();
    h.video.handle({ trackUri: 'track-a', phase: 'loading', label: 'Previous video' });
    const staleCallback = [...h.timers.values()][0].fn;
    h.app.currentTrackUri = 'track-b';
    h.video.handle({ trackUri: 'track-b', phase: 'loading', label: 'Current video' });
    h.video.handle({ trackUri: 'track-a', phase: 'idle' });
    staleCallback();
    h.advance(999);
    assert.equal(h.app.state.generationPills['video-background'].phase, 'idle');
    h.advance(1);
    assert.equal(h.app.state.generationPills['video-background'].label, 'Current video');
    h.video.handle({ trackUri: 'track-a', phase: 'complete' });
    assert.equal(h.app.state.generationPills['video-background'].phase, 'loading');
    h.video.handle({ trackUri: 'track-b', phase: 'complete' });
    assert.equal(h.app.state.generationPills['video-background'].phase, 'complete');
});
