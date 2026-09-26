import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../OptionsMenu.js', import.meta.url), 'utf8');

const section = (text, startMarker, endMarker) => {
    const start = text.indexOf(startMarker);
    const end = text.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `missing source section: ${startMarker}`);
    return text.slice(start, end);
};

// Evaluate only the pure positioning helper (no Spicetify/React needed).
const helperSource = section(
    source,
    'const SYNC_ADJUST_PANEL_GAP = 10;',
    '\nconst SyncAdjustButtonFluent'
);
const context = vm.createContext({});
vm.runInContext(
    `${helperSource}\nglobalThis.computeSyncAdjustPanelPosition = computeSyncAdjustPanelPosition;`,
    context
);
const compute = context.computeSyncAdjustPanelPosition;
assert.equal(typeof compute, 'function', 'helper must be defined');

test('returns null while rects are not measurable yet', () => {
    assert.equal(compute(null, { width: 410, height: 500 }, 1920, 1080), null);
    assert.equal(
        compute({ left: 1800, top: 400, width: 44, height: 44 }, null, 1920, 1080),
        null
    );
    assert.equal(
        compute({ left: 1800, top: 400, width: 44, height: 44 }, { width: 0, height: 500 }, 1920, 1080),
        null
    );
    assert.equal(
        compute({ left: 1800, top: 400, width: 44, height: 44 }, { width: 410, height: 0 }, 1920, 1080),
        null
    );
});

test('positions the panel left of the trigger, vertically centered', () => {
    const position = compute(
        { left: 1800, top: 400, width: 44, height: 44 },
        { width: 410, height: 500 },
        1920,
        1080
    );
    assert.equal(position.left, 1380);
    assert.equal(position.top, 172);
});

test('clamps the panel inside the viewport', () => {
    // Trigger near the left edge: panel must not go off-screen.
    const nearLeft = compute(
        { left: 100, top: 400, width: 44, height: 44 },
        { width: 410, height: 500 },
        1920,
        1080
    );
    assert.equal(nearLeft.left, 12);

    // Trigger near the bottom: panel bottom must stay in view.
    const nearBottom = compute(
        { left: 1800, top: 1000, width: 44, height: 44 },
        { width: 410, height: 500 },
        1920,
        1080
    );
    assert.equal(nearBottom.top, 1080 - 500 - 12);

    // Viewport smaller than the panel: pin to the padding corner.
    const tiny = compute(
        { left: 300, top: 200, width: 44, height: 44 },
        { width: 410, height: 500 },
        500,
        400
    );
    assert.equal(tiny.left, 12);
    assert.equal(tiny.top, 12);
});

test('the sync overlay is never rendered hidden while unpositioned', () => {
    // Regression guard for "click the offset button and nothing appears":
    // the overlay used `visibility: "hidden"` until the first measurement,
    // so any missed measurement left the panel stuck invisible.
    assert.ok(
        !source.includes('window.innerWidth > 840 ? { visibility: "hidden" }'),
        'overlay must not hide itself while waiting for measurement'
    );
    assert.ok(
        source.includes('SYNC_ADJUST_PANEL_POSITION_ATTEMPTS'),
        'positioning must retry across frames instead of measuring once'
    );
});
