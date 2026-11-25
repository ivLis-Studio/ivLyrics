// 기본 설정값
export const DEFAULT_SETTINGS = {
  // 배경
  backgroundType: 'coverBlur', // 'coverBlur', 'gradient', 'solid', 'transparent'
  backgroundColor: '#121212',
  backgroundOpacity: 0.6,
  backgroundBlur: 30, // 배경 블러 강도 (px)

  // 앨범 커버
  showCover: true,
  coverSize: 120,
  coverPosition: 'left', // 'left', 'center', 'hidden'
  coverRadius: 16,
  coverBlur: 0, // 앨범 커버 블러 강도 (px)

  // 곡 정보
  showTrackInfo: true,
  trackTitleSize: 26,
  trackTitleColor: '#ffffff',
  trackTitleWeight: '700',
  trackArtistSize: 18,
  trackArtistColor: '#ffffff',
  trackArtistOpacity: 0.65,
  trackArtistWeight: '500',

  // 가사
  lyricsDetail: 'line', // 'line', 'word'
  exportScale: 1, // 1, 2, 3 (Canva-style PNG scale)
  fontSource: 'default', // 'default', 'settings', 'custom' (앱 설정/직접 입력 글꼴 사용)
  customFontFamily: '',
  fontSize: 32, // 원어 크기 (px, 원어에만 적용)
  fontWeight: '600',
  lineHeight: 1.6,
  lyricsAlign: 'left', // 'left', 'center'
  showPronunciation: true,
  showTranslation: true,
  origColor: '#ffffff',
  origWeight: '600',
  pronColor: '#ffffff',
  pronOpacity: 0.5,
  pronSize: 20, // 줄 발음 크기 (px)
  wordReadingSize: 21, // 단어 발음 크기 (px, 단어 모드)
  wordReadingColor: '#ffffff',
  wordReadingWeight: '400',
  transColor: '#1DB954',
  transSize: 22, // 줄 번역 크기 (px)
  wordGlossSize: 21, // 단어 번역 크기 (px, 단어 모드)
  wordGlossColor: '#1DB954',
  wordGlossWeight: '500',
  pronWeight: '400',
  transWeight: '500',
  blockGap: 32, // 가사 블록 간 간격
  innerGap: 4, // 원어/발음/번역 간 간격

  // 레이아웃
  imageWidth: 1080, // 이미지 너비
  padding: 60,
  aspectRatio: null, // null = auto, 1 = square, 16/9 = landscape

  // 기타
  showWatermark: true,
};

// 프리셋 (템플릿)
export const PRESETS = {
  cover: {
    name: 'Cover Blur',
    settings: {
      lyricsDetail: 'line',
      backgroundType: 'coverBlur',
      backgroundOpacity: 0.55,
      backgroundBlur: 30,
      showCover: true,
      coverSize: 130,
      coverPosition: 'left',
      coverRadius: 16,
      coverBlur: 0,
      fontSize: 34,
      fontWeight: '600',
      origWeight: '600',
      pronSize: 21,
      transSize: 23,
      wordReadingSize: 22,
      wordGlossSize: 22,
      lyricsAlign: 'left',
      blockGap: 36,
      innerGap: 3,
      padding: 60,
      aspectRatio: null,
      showPronunciation: true,
      showTranslation: true,
      showTrackInfo: true,
      showWatermark: true,
    }
  },
  gradient: {
    name: 'Gradient',
    settings: {
      lyricsDetail: 'line',
      backgroundType: 'gradient',
      backgroundOpacity: 0.6,
      backgroundBlur: 0,
      showCover: true,
      coverSize: 100,
      coverPosition: 'left',
      coverRadius: 12,
      coverBlur: 0,
      fontSize: 32,
      fontWeight: '500',
      origWeight: '500',
      pronSize: 20,
      transSize: 22,
      wordReadingSize: 21,
      wordGlossSize: 21,
      lyricsAlign: 'left',
      blockGap: 32,
      innerGap: 4,
      padding: 65,
      aspectRatio: null,
      showPronunciation: true,
      showTranslation: true,
      showTrackInfo: true,
      showWatermark: true,
    }
  },
  minimal: {
    name: 'Minimal',
    settings: {
      lyricsDetail: 'line',
      backgroundType: 'solid',
      backgroundColor: '#0a0a0a',
      backgroundOpacity: 0.6,
      backgroundBlur: 0,
      showCover: false,
      coverSize: 120,
      coverPosition: 'left',
      coverRadius: 16,
      coverBlur: 0,
      showTrackInfo: true,
      fontSize: 36,
      fontWeight: '500',
      origWeight: '500',
      pronSize: 22,
      transSize: 24,
      wordReadingSize: 24,
      wordGlossSize: 24,
      lyricsAlign: 'center',
      blockGap: 40,
      innerGap: 5,
      padding: 80,
      aspectRatio: null,
      showPronunciation: true,
      showTranslation: true,
      showWatermark: true,
    }
  },
  glass: {
    name: 'Glass',
    settings: {
      lyricsDetail: 'line',
      backgroundType: 'coverBlur',
      backgroundOpacity: 0.7,
      backgroundBlur: 50,
      showCover: true,
      coverSize: 110,
      coverPosition: 'left',
      coverRadius: 20,
      coverBlur: 0,
      fontSize: 30,
      fontWeight: '500',
      origWeight: '500',
      pronSize: 19,
      transSize: 20,
      wordReadingSize: 21,
      wordGlossSize: 21,
      lyricsAlign: 'left',
      blockGap: 30,
      innerGap: 3,
      padding: 55,
      aspectRatio: null,
      showPronunciation: true,
      showTranslation: true,
      showTrackInfo: true,
      showWatermark: true,
    }
  },
  word: {
    name: 'Word Study',
    settings: {
      lyricsDetail: 'word',
      backgroundType: 'coverBlur',
      backgroundOpacity: 0.55,
      backgroundBlur: 30,
      showCover: true,
      coverSize: 120,
      coverPosition: 'left',
      coverRadius: 16,
      coverBlur: 0,
      fontSize: 30,
      fontWeight: '600',
      origWeight: '600',
      pronSize: 19,
      transSize: 20,
      wordReadingSize: 21,
      wordGlossSize: 21,
      lyricsAlign: 'center',
      blockGap: 36,
      innerGap: 4,
      padding: 70,
      aspectRatio: null,
      showPronunciation: true,
      showTranslation: true,
      showTrackInfo: true,
      showWatermark: true,
    }
  },
};

// TEMPLATES를 PRESETS로 export (하위 호환성)
export const TEMPLATES = Object.fromEntries(
  Object.entries(PRESETS).map(([key, preset]) => [key, { name: preset.name, ...preset.settings }])
);
