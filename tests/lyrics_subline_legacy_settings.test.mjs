import { createLyricSubLineRenderer } from "#ivlyrics/lyrics/createLyricSubLineRenderer.mjs";
import assert from 'node:assert/strict';
import test from 'node:test';

for (const singleLineScroll of [false, true]) {
  test(`legacy highlight preferences preserve ordinary sublines (vinyl scroll: ${singleLineScroll})`, () => {
    const annotations = [{ marker: 1 }];
    const html = 'Translation <sup>1</sup>';
    const onContextMenu = () => {};
    const visual = {
      'inactive-color': '#aaa',
      'phonetic-semantic-highlight': true,
      'translation-semantic-highlight': true,
    };
    const render = createLyricSubLineRenderer({
      getInactiveColor: () => visual['inactive-color'],
      react: { createElement: (type, props, ...children) => ({ type, props, children }) },
      renderHtml(text, received) {
        assert.equal(text, 'Translation');
        assert.equal(received, annotations);
        return html;
      },
    });
    for (const kind of ['phonetic', 'translation']) {
      const tree = render(kind, 'Translation', onContextMenu,
        singleLineScroll, annotations, kind,
        { line: { text: 'Original', startTime: 1000 }, kind, position: 1500 });
      assert.equal(tree.type, 'p');
      assert.equal(tree.props.onContextMenu, onContextMenu);
      assert.equal(tree.props.key, kind);
      assert.equal(tree.props.style['--sub-lyric-color'], '#aaa');
      if (singleLineScroll) {
        assert.equal(tree.children[0].type, 'span');
        assert.equal(tree.children[0].props.className, 'ivlyrics-vinyl-lyric-scroll-content');
        assert.equal(tree.children[0].props.dangerouslySetInnerHTML.__html, html);
      } else {
        assert.equal(tree.props.dangerouslySetInnerHTML.__html, html);
      }
    }
  });
}
