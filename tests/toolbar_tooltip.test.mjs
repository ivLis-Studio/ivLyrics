import { createToolbarTooltip } from "../src/app/toolbar/createToolbarTooltip.mjs";
import { createStudyButton } from "#ivlyrics/features/learning/studyComponents.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

const react = {
    Fragment: 'fragment',
    memo: component => component,
    createElement: (type, props, ...children) => ({ type, props, children }),
    cloneElement: (child, props) => ({ ...child, props: { ...child.props, ...props } }),
};
test('toolbar tooltips preserve refs and actions, portal outside scroll clipping, and dismiss', () => {
    let anchor = null, cleanup;
    const listeners = new Map();
    const document = { body: {}, addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
    const react = { Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props, children }),
        cloneElement: (child, props) => ({ ...child, props: { ...child.props, ...props } }) };
    const window = { innerWidth: 1000, innerHeight: 800, ...document,
        ReactDOM: { createPortal: (content, target) => ({ content, target }) } };
    const render = createToolbarTooltip({
        host: window, document, react: {
            ...react, useState: () => [anchor, value => { anchor = value; }],
            useEffect: effect => { cleanup?.(); cleanup = effect(); },
        },
    });
    const ref = { current: {} };
    let clicks = 0, enters = 0;
    const children = { type: 'button', ref, props: { onClick: () => clicks++, onMouseEnter: () => enters++ } };
    const event = { currentTarget: { getBoundingClientRect: () => ({ left: 940, top: 100, height: 40 }) } };
    let result = render({ children, label: 'Sync' });
    assert.equal(result.children[0].ref, ref);
    result.children[0].props.onMouseEnter(event);
    result = render({ children, label: 'Sync' });
    assert.equal(enters, 1);
    assert.equal(result.children[1].target, document.body);
    assert.equal(result.children[1].content.props.role, 'tooltip');
    result.children[0].props.onClick(event);
    assert.equal(clicks, 1);
    assert.equal(anchor, null);
    result.children[0].props.onFocus(event);
    render({ children, label: 'Sync' });
    listeners.get('keydown')({ key: 'Escape' });
    assert.equal(anchor, null);
    cleanup();
    assert.equal(listeners.size, 0);
});

test('disabled controls expose their tooltip without enabling or forwarding the action', () => {
    let anchor = null;
    const document = { body: {}, addEventListener() {}, removeEventListener() {} };
    const window = { innerWidth: 1000, innerHeight: 800, addEventListener() {}, removeEventListener() {},
        ReactDOM: { createPortal: (content, target) => ({ content, target }) } };
    const render = createToolbarTooltip({
        host: window, document,
        react: { ...react, useState: () => [anchor, value => { anchor = value; }], useEffect() {} },
    });
    const ref = { current: {} };
    const action = () => assert.fail('disabled action must not run');
    const children = { type: 'button', ref, props: { disabled: true, onClick: action } };
    let result = render({ children, label: 'Regenerate translation' });
    const trigger = result.children[0];
    assert.equal(trigger.type, 'span');
    assert.equal(trigger.props.onClick, undefined);
    assert.equal(trigger.children[0].ref, ref);
    assert.equal(trigger.children[0].props.disabled, true);
    assert.equal(trigger.children[0].props.onClick, action);
    trigger.props.onMouseEnter({ currentTarget: {
        getBoundingClientRect: () => ({ left: 940, top: 100, height: 34 }),
    } });
    result = render({ children, label: 'Regenerate translation' });
    assert.equal(result.children[1].target, document.body);
    assert.equal(result.children[1].content.children[0], 'Regenerate translation');
    result.children[0].props.onMouseLeave();
    assert.equal(anchor, null);
    delete window.ReactDOM;
    result = render({ children, label: 'Regenerate translation' });
    assert.equal(result.children[0].props.title, 'Regenerate translation');
});

test('long tooltip labels remain inside the viewport at either corner', () => {
    let anchor = null;
    const document = { body: {} };
    const window = { innerWidth: 800, innerHeight: 600,
        ReactDOM: { createPortal: content => content } };
    const render = createToolbarTooltip({
        host: window, document,
        react: { ...react, useState: () => [anchor, value => { anchor = value; }], useEffect() {} },
    });
    const children = { type: 'button', props: {} };
    for (const [left, top] of [[10, 0], [790, 580], [400, 300]]) {
        let result = render({ children, label: 'A long translated menu description' });
        result.children[0].props.onFocus({ currentTarget: { getBoundingClientRect: () => ({ left, top, height: 20 }) } });
        result = render({ children, label: 'A long translated menu description' });
        const tooltip = result.children[1];
        const element = { style: {}, getBoundingClientRect() {
            const right = window.innerWidth - parseFloat(this.style.right);
            const middle = parseFloat(this.style.top);
            return { left: right - 320, right, top: middle - 60, bottom: middle + 60 };
        } };
        for (let rerender = 0; rerender < 2; rerender++) {
            tooltip.props.ref(element);
            const rect = element.getBoundingClientRect();
            assert.ok(rect.left >= 8 && rect.right <= 792);
            assert.ok(rect.top >= 8 && rect.bottom <= 592);
        }
    }
});

test('study control shares the toolbar tooltip and keeps a native fallback', () => {
    let opens = 0;
    const tooltip = () => {};
    const window = { IvLyricsTooltip: tooltip, Spicetify: { ReactComponent: {
        TooltipWrapper: () => assert.fail('Spotify private tooltip must not be used'),
    } } };
    const render = createStudyButton({
        react, readTooltip: () => window.IvLyricsTooltip, t: () => 'Study', open: () => opens++,
    });
    let result = render({ disabled: false });
    assert.equal(result.type, tooltip);
    assert.equal(result.props.label, 'Study');
    assert.equal(result.children[0].props['aria-pressed'], undefined);
    assert.equal(result.children[0].props['aria-haspopup'], 'dialog');
    result.children[0].props.onClick({ stopPropagation() {} });
    assert.equal(opens, 1);
    render({ disabled: true }).children[0].props.onClick({ stopPropagation() {} });
    assert.equal(opens, 1);
    delete window.IvLyricsTooltip;
    result = render({ disabled: false });
    assert.equal(result.type, 'button');
    assert.equal(result.props.title, 'Study');
});
