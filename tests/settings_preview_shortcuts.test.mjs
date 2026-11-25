import { readPcStylesheet } from "../.github/scripts/pc_stylesheet.mjs";
import { createSettingsPreviewDock } from "../src/features/settings/settingsPreviewDock.mjs";
import { readSettingsSource, readSettingsStylesFixture } from "./fixtures/legacy-page-source.mjs";
import { readLanguageTable } from "./fixtures/language-source.mjs";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readSettingsSource();
const styleSource = readSettingsStylesFixture();
const css = vm.runInNewContext(styleSource + "\nSETTINGS_MODAL_CSS;", { APP_NAME: "ivLyrics" });
const toolbarCss = readPcStylesheet();
const slice = (start, end, text = source) => {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from);
  return text.slice(from, to);
};

test("the layer preview has one edit action and four informational color labels", () => {
  const calls = [];
  const react = { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) };
  const SettingsDock = createSettingsPreviewDock({
    react: { ...react, useState: initial => [initial()], useEffect() {} },
    SettingsUiIcon: "SettingsUiIcon",
    SettingsLyricsPreview: "SettingsLyricsPreview",
    getSettingsText: (_key, fallback) => fallback,
  });
  const dock = SettingsDock({ open: true, menu: "appearance", onNavigate: (...args) => calls.push(args) });
  const legendContainer = dock.children[1].children.find(child => child?.type?.name === "SettingsPreviewLayerControls");
  assert.ok(legendContainer);
  const tree = legendContainer.type(legendContainer.props);
  assert.equal(tree.props.className, "settings-preview-layers");
  assert.equal(tree.props.role, "group");
  assert.equal(tree.props["aria-label"], "Lyric layers");
  const [heading, legend] = tree.children;
  const button = heading.children[1];
  assert.equal(button.type, "button");
  assert.equal(button.props.type, "button");
  assert.equal(button.props.className, "settings-preview-edit-link");
  assert.equal(button.props["aria-label"], "Lyric layers · Edit");
  assert.equal(button.children[0].children[0], "Edit");
  button.props.onClick();
  assert.equal(legend.type, "ul");
  assert.equal(legend.props.className, "settings-preview-legend");
  assert.equal(legend.children.length, 4);
  const names = ["Original", "Pronunciation", "Translation", "Furigana"];
  legend.children.forEach((label, index) => {
    assert.equal(label.type, "li");
    assert.equal(label.props.onClick, undefined);
    assert.equal(label.props.tabIndex, undefined);
    assert.equal(label.children[1].children[0], names[index]);
    assert.equal(label.children[0].props["aria-hidden"], "true");
    assert.equal(label.children.length, 2, "informational labels have no navigation arrows");
  });
  assert.deepEqual(calls, [["appearance", "lyric-layers"]]);
  assert.match(source, /onNavigate: navigateToDestination/);
});

test("the shared edit action uses existing translated strings in every locale", () => {
  const languages = readdirSync(new URL("../src/i18n/langs/", import.meta.url)).filter(name => /^Lang.*\.js$/.test(name));
  assert.equal(languages.length, 22);
  for (const language of languages) {
    const strings = readLanguageTable(language);
    assert.ok(strings.buttons.edit?.trim(), `${language}: edit action`);
    assert.ok(strings.settingsUi.sections.lyricLayers.title?.trim(), `${language}: layer editor name`);
  }
});

test("layer labels wrap and the single edit action keeps a visible inner keyboard outline", () => {
  assert.match(css, /\.settings-preview-legend \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.settings-preview-layer-label > span \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.settings-preview-edit-link \{[^}]*min-height: 32px/);
  assert.match(css, /\.settings-preview-edit-link:focus-visible \{[^}]*outline: 2px[^}]*outline-offset: -2px/);
  assert.doesNotMatch(css, /settings-preview-layer-link/);
});

test("toolbar focus ring stays inside entries clipped by the scroll container", () => {
  assert.match(toolbarCss, /\.ivl-tb-item:focus-visible \{\s*outline: 2px solid var\(--ivl-tb-accent-text\);\s*outline-offset: -3px;\s*box-shadow: none;/);
  assert.match(toolbarCss, /\.ivl-tb-content \{[^}]*overflow-x: hidden;[^}]*overflow-y: auto;/);
  assert.doesNotMatch(toolbarCss, /\.ivl-tb-item:focus-visible \{\s*outline: none/);
});
