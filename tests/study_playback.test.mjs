import assert from 'node:assert/strict';
import test from 'node:test';
import { createStudyPlayback } from '../src/features/learning/studyPlayback.mjs';

const track = (name) => `spotify:track:${name}`;
const line = (name, startTime = 2400) => ({ trackUri: track(name), startTime, endTime: startTime + 1400 });

function setup() {
    let nextTimer = 0;
    let playing = false;
    const timers = new Map();
    const intervals = new Map();
    const calls = [];
    const errors = [];
    const utterances = [];
    const state = { open: true };
    const player = {
        data: { item: { uri: track('current') } },
        isPlaying: () => playing,
        playUri: uri => calls.push(['open', uri]),
        seek: time => calls.push(['seek', time]),
        pause() { playing = false; calls.push(['pause']); },
        togglePlay() { playing = !playing; calls.push(['toggle', playing]); },
    };
    const schedule = (queue, callback, delay) => {
        const timer = nextTimer++;
        queue.set(timer, { callback, delay });
        return timer;
    };
    const host = {
        setTimeout: (callback, delay) => schedule(timers, callback, delay),
        clearTimeout: timer => timers.delete(timer),
        setInterval: (callback, delay) => schedule(intervals, callback, delay),
        clearInterval: timer => intervals.delete(timer),
        SpeechSynthesisUtterance: class {
            constructor(text) { this.text = text; }
        },
        speechSynthesis: {
            cancel() { utterances.at(-1)?.onerror(); },
            speak(utterance) { utterances.push(utterance); },
        },
    };
    const playback = createStudyPlayback({
        host, isOpen: () => state.open, readPlayer: () => player, readToast: () => ({ error: message => errors.push(message) }), t: key => key,
    });
    const changeTrack = (name) => { player.data.item.uri = track(name); };
    const runTimer = delay => {
        const [timer, job] = [...timers].find(([, job]) => job.delay === delay) ?? [];
        assert.ok(job, `expected a ${delay} ms timer`);
        timers.delete(timer);
        job.callback();
    };
    return {
        playback, player, state, timers, intervals, calls, errors, utterances, changeTrack, runTimer,
        setPlaying: value => { playing = value; },
    };
}

test('a lyric clip waits for the selected track and only stops its own playback', () => {
    const f = setup();
    f.playback.playLyricAt(line('next'));
    f.runTimer(450);
    assert.deepEqual(f.calls, [['open', track('next')]]);
    f.changeTrack('next');
    f.runTimer(150);
    assert.deepEqual(f.calls, [['open', track('next')], ['seek', 2400], ['toggle', true]]);
    f.changeTrack('skipped-to');
    f.runTimer(1400);
    assert.equal(f.calls.length, 3);
    assert.equal(f.timers.size, 0);
});

test('a new line, a skipped track and closing the panel discard stale clip callbacks', () => {
    const f = setup();
    f.playback.playLyricAt(line('first'));
    const first = f.timers.values().next().value.callback;
    f.playback.playLyricAt(line('second', 4000));
    first();
    f.changeTrack('skipped-to');
    f.runTimer(450);
    f.playback.playLyricAt(line('third'));
    const third = f.timers.values().next().value.callback;
    f.state.open = false;
    f.playback.disablePlaybackGuard();
    f.changeTrack('third');
    third();
    assert.deepEqual(f.calls, ['first', 'second', 'third'].map(name => ['open', track(name)]));
    assert.equal(f.timers.size, 0);
});

test('reselecting a line on the same track replaces its stop timer', () => {
    const f = setup();
    f.playback.playLyricAt(line('current'));
    const oldStop = f.timers.values().next().value.callback;
    f.playback.playLyricAt(line('current', 4200));
    oldStop();
    assert.deepEqual(f.calls, [['seek', 2400], ['toggle', true], ['seek', 4200]]);
    f.runTimer(1400);
    assert.deepEqual(f.calls.at(-1), ['pause']);
    assert.equal(f.timers.size, 0);
});

test('the end of a clip cannot pause a later playback instance of the same song', () => {
    const f = setup();
    f.player.data.playbackId = 'first';
    f.playback.playLyricAt(line('current'));
    f.player.data.playbackId = 'next';
    f.runTimer(1400);
    assert.deepEqual(f.calls, [['seek', 2400], ['toggle', true]]);
});

test('seeking far outside the clip leaves the manually selected playback alone', () => {
    const f = setup();
    f.player.getProgress = () => 45_000;
    f.playback.playLyricAt(line('current'));
    f.runTimer(1400);
    assert.deepEqual(f.calls, [['seek', 2400], ['toggle', true]]);
});

test('the end-of-song guard does not rewind a lyric clip or a paused song', () => {
    const f = setup();
    f.player.getDuration = () => 180_000;
    f.player.getProgress = () => 179_200;
    f.playback.enablePlaybackGuard();
    const interval = f.intervals.values().next().value;
    interval.callback();
    assert.deepEqual(f.calls, [], 'while paused near the end');
    f.playback.playLyricAt(line('current', 179_000));
    interval.callback();
    assert.deepEqual(f.calls, [['seek', 179_000], ['toggle', true]]);
    f.runTimer(1000);
    interval.callback();
    assert.deepEqual(f.calls.at(-1), ['pause']);
});

test('a track that never opens fails once and does not seek or toggle the old song', () => {
    const f = setup();
    f.playback.playLyricAt(line('unavailable'));
    f.runTimer(450);
    for (let attempt = 0; attempt < 10; attempt++) f.runTimer(150);
    assert.deepEqual(f.calls, [['open', track('unavailable')]]);
    assert.deepEqual(f.errors, ['lyricPlaybackFailed']);
    assert.equal(f.timers.size, 0);
});

test('a delayed rejection from a superseded song does not interrupt a newer clip', async () => {
    const f = setup();
    let rejectOpening;
    f.player.playUri = () => new Promise((_, reject) => { rejectOpening = reject; });
    f.playback.playLyricAt(line('unavailable'));
    f.playback.playLyricAt(line('current', 4500));
    rejectOpening(new Error('offline'));
    await Promise.resolve();
    assert.deepEqual(f.calls, [['seek', 4500], ['toggle', true]]);
    assert.deepEqual(f.errors, []);
    f.runTimer(1400);
    assert.deepEqual(f.calls.at(-1), ['pause']);
});

test('only an open study panel rewinds near the end and closing clears its interval', () => {
    const f = setup();
    f.setPlaying(true);
    f.player.getDuration = () => 180_000;
    f.player.getProgress = () => 179_000;
    f.playback.enablePlaybackGuard();
    f.playback.enablePlaybackGuard();
    assert.equal(f.intervals.size, 1);
    const interval = f.intervals.values().next().value;
    assert.equal(interval.delay, 500);
    interval.callback();
    interval.callback();
    assert.deepEqual(f.calls, [['seek', 0]]);
    f.state.open = false;
    f.playback.disablePlaybackGuard();
    interval.callback();
    assert.deepEqual(f.calls, [['seek', 0]]);
    assert.equal(f.intervals.size, 0);
});

test('replaced utterances cannot resume Spotify and the final utterance resumes once', () => {
    const f = setup();
    f.setPlaying(true);
    f.playback.speakText('example');
    const first = f.utterances[0];
    f.playback.speakText('ことば');
    first.onend();
    assert.equal(f.timers.size, 0);
    const second = f.utterances[1];
    assert.equal(second.lang, 'ja-JP');
    second.onend();
    second.onerror();
    assert.equal(f.timers.size, 1);
    f.runTimer(180);
    assert.deepEqual(f.calls, [['pause'], ['toggle', true]]);
});

test('closing while an utterance is pending or changing track cannot resume stale playback', () => {
    const f = setup();
    f.setPlaying(true);
    f.playback.speakText('word');
    const utterance = f.utterances[0];
    utterance.onend();
    const queuedResume = f.timers.values().next().value.callback;
    f.changeTrack('skipped-to');
    f.state.open = false;
    f.playback.disablePlaybackGuard();
    queuedResume();
    assert.deepEqual(f.calls, [['pause']]);
    assert.equal(f.timers.size, 0);

    const sameTrack = setup();
    sameTrack.setPlaying(true);
    sameTrack.playback.speakText('word');
    sameTrack.state.open = false;
    sameTrack.playback.disablePlaybackGuard();
    sameTrack.utterances[0].onend();
    assert.deepEqual(sameTrack.calls, [['pause'], ['toggle', true]]);
    assert.equal(sameTrack.timers.size, 0);
});

test('speech does not resume a later instance of the same song', () => {
    const f = setup();
    f.setPlaying(true);
    f.player.data.playbackId = 'first';
    f.playback.speakText('word');
    f.player.data.playbackId = 'next';
    f.utterances[0].onend();
    f.runTimer(180);
    assert.deepEqual(f.calls, [['pause']]);
});
