export function renderShareImageControls(react, translate, settings, updateSetting) {
  const labelText = (key, fallback) => translate(`shareImage.settings.${key}`) || fallback;
  const field = (label, control) => react.createElement("div", { style: { gridColumn: 'span 2' } },
    react.createElement("label", {
      style: { color: 'rgba(255,255,255,0.7)', marginBottom: '4px', display: 'block' }
    }, label),
    control
  );
  const section = (key, fallback, first = false) => react.createElement("div", {
    className: "share-image-panel-section",
    style: {
      gridColumn: 'span 2',
      fontSize: '12px',
      fontWeight: '600',
      color: '#1db954',
      ...(!first ? { marginTop: '12px' } : {}),
      marginBottom: '4px',
      borderBottom: '1px solid rgba(29,185,84,0.2)',
      paddingBottom: '8px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      letterSpacing: '0.5px',
      textTransform: 'uppercase'
    }
  }, translate(`shareImage.sections.${key}`) || fallback);
  const range = (key, fallbackLabel, fallback, min, max, { step, percent = false } = {}) => {
    const value = percent ? Math.round((settings[key] ?? fallback) * 100) : settings[key] ?? fallback;
    return field(`${labelText(key, fallbackLabel)}: ${value}${percent ? '%' : 'px'}`,
      react.createElement("input", {
        type: 'range', min, max,
        ...(step !== undefined ? { step } : {}),
        value,
        onChange: (event) => updateSetting(key, percent ? parseInt(event.target.value) / 100 : parseInt(event.target.value)),
        style: { width: '100%', accentColor: '#1db954' }
      })
    );
  };
  const checkbox = (key, fallbackLabel, wide = false) => react.createElement("div",
    wide ? { style: { gridColumn: 'span 2' } } : null,
    react.createElement("label", {
      className: "share-image-check",
      style: { display: 'flex', alignItems: 'center', gap: '6px', color: 'rgba(255,255,255,0.7)', cursor: 'pointer' }
    },
      react.createElement("input", {
        type: 'checkbox', checked: settings[key] !== false,
        onChange: (event) => updateSetting(key, event.target.checked),
        style: { accentColor: '#1db954' }
      }),
      labelText(key, fallbackLabel)
    )
  );
  const choice = (key, fallbackLabel, options, compact = false) => field(labelText(key, fallbackLabel),
    react.createElement("div", { style: { display: 'flex', gap: '4px' } },
      options.map(([value, label]) => react.createElement("button", {
        key: value === null ? 'auto' : value,
        className: "share-image-segment-btn",
        "data-active": settings[key] === value,
        onClick: () => updateSetting(key, value),
        style: {
          flex: 1,
          padding: compact ? '5px 6px' : '5px 8px',
          borderRadius: '4px',
          border: settings[key] === value ? '1px solid #1db954' : '1px solid rgba(255,255,255,0.15)',
          background: settings[key] === value ? 'rgba(29,185,84,0.15)' : 'rgba(255,255,255,0.05)',
          color: '#fff',
          fontSize: compact ? '9px' : '10px',
          cursor: 'pointer'
        }
      }, label))
    )
  );
  const color = (key, fallbackLabel) => field(labelText(key, fallbackLabel),
    react.createElement("input", {
      type: 'color',
      value: /^#[0-9a-f]{6}$/i.test(settings[key] ?? '') ? settings[key] : '#ffffff',
      onChange: (event) => updateSetting(key, event.target.value),
      style: { width: '100%', height: '28px', padding: '2px', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '4px', background: 'rgba(255,255,255,0.05)', cursor: 'pointer' }
    })
  );
  const weights = ['400', '500', '600', '700'];
  const text = (key, fallbackLabel, placeholder = '') => field(labelText(key, fallbackLabel),
    react.createElement("input", {
      type: 'text',
      value: settings[key] ?? '',
      placeholder,
      onChange: (event) => updateSetting(key, event.target.value),
      style: { width: '100%', padding: '6px 8px', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: '12px' }
    })
  );

  return [
    section('background', '배경', true),
    choice('backgroundType', '배경 스타일', [
      ['coverBlur', labelText('coverBlur', '블러')],
      ['gradient', labelText('gradient', '그라디언트')],
      ['solid', labelText('solid', '단색')]
    ]),
    settings.backgroundType === 'coverBlur' && range('backgroundBlur', '배경 블러', 30, 0, 80),
    range('backgroundOpacity', '배경 어둡기', 0.6, 20, 90, { percent: true }),
    section('cover', '앨범 커버'),
    checkbox('showCover', '앨범 커버'),
    checkbox('showTrackInfo', '곡 정보'),
    settings.showCover && choice('coverPosition', '커버 위치', [
      ['left', labelText('posLeft', '좌측')], ['center', labelText('posCenter', '중앙')]
    ]),
    settings.showCover && range('coverSize', '커버 크기', 120, 60, 200),
    settings.showCover && range('coverRadius', '커버 둥글기', 16, 0, 50),
    settings.showCover && range('coverBlur', '커버 블러', 0, 0, 30),
    settings.showTrackInfo && range('trackTitleSize', '곡 제목 크기', 26, 12, 48),
    settings.showTrackInfo && color('trackTitleColor', '곡 제목 색상'),
    settings.showTrackInfo && choice('trackTitleWeight', '곡 제목 굵기', weights.map((weight) => [weight, weight]), true),
    settings.showTrackInfo && range('trackArtistSize', '아티스트 크기', 18, 10, 36),
    settings.showTrackInfo && color('trackArtistColor', '아티스트 색상'),
    settings.showTrackInfo && choice('trackArtistWeight', '아티스트 굵기', weights.map((weight) => [weight, weight]), true),
    section('lyrics', '가사'),
    choice('lyricsDetail', '내보내기 방식', [
      ['line', labelText('lineLevel', '줄 단위')], ['word', labelText('wordLevel', '단어 단위')]
    ]),
    choice('fontSource', '글꼴', [
      ['default', labelText('fontDefault', '기본')], ['settings', labelText('fontSettings', '앱 설정')], ['custom', labelText('fontCustom', '직접 입력')]
    ]),
    settings.fontSource === 'custom' && text('customFontFamily', '글꼴 이름', '예: Pretendard Variable'),
    checkbox('showPronunciation', '발음'),
    settings.lyricsDetail !== 'word' && range('pronSize', '발음 크기', 20, 10, 32),
    settings.lyricsDetail === 'word' && range('wordReadingSize', '문자 발음 크기', 21, 8, 40),
    settings.lyricsDetail === 'word' && color('wordReadingColor', '문자 발음 색상'),
    settings.lyricsDetail === 'word' && choice('wordReadingWeight', '문자 발음 굵기', weights.map((weight) => [weight, weight]), true),
    settings.lyricsDetail !== 'word' && color('pronColor', '발음 색상'),
    settings.lyricsDetail !== 'word' && choice('pronWeight', '발음 굵기', weights.map((weight) => [weight, weight]), true),
    checkbox('showTranslation', '번역'),
    settings.lyricsDetail === 'word' && range('wordGlossSize', '단어 번역 크기', 21, 8, 40),
    settings.lyricsDetail === 'word' && color('wordGlossColor', '문자 번역 색상'),
    settings.lyricsDetail === 'word' && choice('wordGlossWeight', '문자 번역 굵기', weights.map((weight) => [weight, weight]), true),
    range('transSize', '번역 크기', 22, 10, 32),
    color('transColor', '번역 색상'),
    choice('transWeight', '번역 굵기', weights.map((weight) => [weight, weight]), true),
    choice('lyricsAlign', '가사 정렬', [
      ['left', labelText('alignLeft', '왼쪽')], ['center', labelText('alignCenter', '가운데')], ['right', labelText('alignRight', '오른쪽')]
    ]),
    range('fontSize', '글꼴 크기', 32, 20, 48),
    range('blockGap', '줄 간격', 32, 16, 60),
    color('origColor', '원어 색상'),
    choice('origWeight', '원어 굵기', weights.map((weight) => [weight, weight]), true),
    section('layout', '레이아웃'),
    choice('exportScale', '내보내기 배율', [[1, '1x'], [2, '2x'], [3, '3x']], true),
    choice('aspectRatio', '이미지 비율', [[null, labelText('ratioAuto', '자동')], [1, '1:1'], [9 / 16, '9:16'], [16 / 9, '16:9']], true),
    range('imageWidth', '이미지 너비', 1080, 720, 1920, { step: 60 }),
    range('padding', '여백', 60, 30, 100),
    section('other', '기타'),
    checkbox('showWatermark', '워터마크 표시', true)
  ];
}
