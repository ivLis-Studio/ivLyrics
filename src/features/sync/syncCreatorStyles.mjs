export const SYNC_CREATOR_PROGRESS_COLOR = 'rgb(var(--spice-rgb-accent, 30, 215, 96))';
export const SYNC_CREATOR_PROGRESS_BACKGROUND = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.18)';
export const SYNC_CREATOR_SYNCED_BACKGROUND = 'rgba(255, 255, 255, 0.055)';
export const SYNC_CREATOR_RECORDING_BACKGROUND = 'rgba(255, 152, 0, 0.6)';

export const TOSS_BLUE = 'rgb(var(--spice-rgb-accent, 30, 215, 96))';
export const TOSS_BLUE_SOFT = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.13)';
export const TOSS_BLUE_BORDER = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.36)';
const TOSS_BLUE_RING = 'rgba(var(--spice-rgb-accent, 30, 215, 96), 0.15)';
export const TOSS_RED = '#e5484d';
export const TOSS_BORDER = 'rgba(255,255,255,0.08)';

const staticStyles = {
	overlay: {
		position: 'fixed', inset: 0,
		background: '#0f1215',
		color: 'var(--spice-text)',
		zIndex: 'var(--iv-layer-modal, 2147483647)',
		display: 'flex', flexDirection: 'column',
		overflow: 'hidden',
		fontFamily: 'var(--font-family, inherit)',
		letterSpacing: '-0.005em',
		'--iv-sync-accent-rgb': 'var(--spice-rgb-accent, 30, 215, 96)'
	},
	header: {
		display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px',
		minHeight: '56px',
		padding: '0 18px',
		background: '#11161b',
		borderBottom: `1px solid ${TOSS_BORDER}`,
		flexShrink: 0,
		position: 'relative', zIndex: 3
	},
	backBtn: {
		background: 'transparent',
		border: '1px solid transparent',
		color: 'var(--spice-text)', cursor: 'pointer',
		padding: '7px 9px', borderRadius: '8px',
		display: 'inline-flex', alignItems: 'center', gap: '6px',
		fontSize: '12px', fontWeight: '600',
		letterSpacing: '-0.005em'
	},
	granularityControl: {
		display: 'inline-flex', alignItems: 'center', gap: '2px',
		padding: '3px', borderRadius: '9px',
		background: 'rgba(255,255,255,0.035)',
		border: `1px solid ${TOSS_BORDER}`
	},
	granularityButton: {
		height: '26px', padding: '0 9px', borderRadius: '6px',
		background: 'transparent', borderWidth: '1px', borderStyle: 'solid', borderColor: 'transparent',
		color: 'var(--spice-subtext)', cursor: 'pointer',
		fontSize: '10.5px', fontWeight: '600', lineHeight: 1,
		whiteSpace: 'nowrap'
	},
	granularityButtonActive: {
		background: TOSS_BLUE_SOFT,
		borderColor: TOSS_BLUE_BORDER,
		color: TOSS_BLUE
	},
	submitBtn: {
		background: TOSS_BLUE, color: '#fff',
		border: 'none', padding: '8px 17px', borderRadius: '999px',
		fontWeight: '700', cursor: 'pointer', fontSize: '13px',
		letterSpacing: '-0.005em',
		boxShadow: 'none'
	},
	trackMeta: { flex: 1, minWidth: 0 },
	trackName: { fontSize: '14px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	artistName: { fontSize: '12px', color: 'var(--spice-subtext)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	bulkVocalControl: {
		display: 'inline-flex',
		alignItems: 'center',
		gap: '5px',
		padding: '0',
		borderRadius: '0',
		background: 'transparent',
		border: 'none'
	},
	bulkVocalLabel: { fontSize: '10.5px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
	virtualKaraokeBadge: {
		background: TOSS_BLUE_SOFT, color: TOSS_BLUE,
		border: `1px solid ${TOSS_BLUE_BORDER}`,
		borderRadius: '999px', padding: '5px 11px',
		fontSize: '10.5px', fontWeight: '700', whiteSpace: 'nowrap',
		letterSpacing: '0.02em'
	},
	select: {
		background: 'rgba(255,255,255,0.04)', color: 'var(--spice-text)',
		border: `1px solid ${TOSS_BORDER}`, borderRadius: '10px',
		height: '34px', padding: '0 11px', fontSize: '12px', fontWeight: '500',
		cursor: 'pointer', outline: 'none'
	},
	loadBtn: {
		background: 'rgba(255,255,255,0.055)', color: 'var(--spice-text)',
		border: `1px solid ${TOSS_BORDER}`,
		height: '32px', padding: '0 12px', borderRadius: '999px',
		fontWeight: '600', cursor: 'pointer', fontSize: '12px',
		letterSpacing: '-0.005em'
	},
	candidatePanelHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '10px', gridColumn: '1 / -1' },
	candidatePanelTitle: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.8 },
	candidatePanel: {
		display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) minmax(0, 1fr)',
		gap: '12px', padding: '14px 18px',
		background: 'transparent',
		borderBottom: `1px solid ${TOSS_BORDER}`,
		flexShrink: 0,
		minHeight: 0,
		overflow: 'hidden'
	},
	candidateList: { display: 'flex', flexDirection: 'column', gap: 0, maxHeight: '230px', overflowY: 'auto', overflowX: 'hidden', paddingRight: '4px', minWidth: 0 },
	candidateItem: {
		background: 'transparent',
		border: 'none',
		borderBottom: `1px solid ${TOSS_BORDER}`,
		borderRadius: '0', padding: '11px 10px',
		cursor: 'pointer', textAlign: 'left',
		color: 'var(--spice-text)'
	},
	candidateItemActive: {
		border: 'none',
		borderBottom: `1px solid ${TOSS_BLUE_BORDER}`,
		background: TOSS_BLUE_SOFT,
		boxShadow: `inset 2px 0 0 ${TOSS_BLUE}`
	},
	candidateItemApplied: { background: TOSS_BLUE_SOFT, borderColor: TOSS_BLUE_BORDER },
	candidateTitleRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', minWidth: 0 },
	candidateTitle: { fontSize: '13px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.005em', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	candidateSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '3px' },
	candidateMetaRow: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '10px' },
	candidateBadge: {
		display: 'inline-flex', alignItems: 'center',
		padding: '3px 9px', borderRadius: '999px',
		fontSize: '10px', fontWeight: '700',
		background: TOSS_BLUE_SOFT,
		color: TOSS_BLUE,
		letterSpacing: '0.02em', textTransform: 'uppercase'
	},
	candidateIdBadge: {
		display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
		flexShrink: 0, padding: '3px 8px', borderRadius: '999px',
		fontSize: '10px', fontWeight: '800',
		background: TOSS_BLUE_SOFT,
		border: `1px solid ${TOSS_BLUE_BORDER}`,
		color: TOSS_BLUE, cursor: 'copy',
		letterSpacing: '0', textTransform: 'none', lineHeight: 1.2
	},
	candidatePreview: {
		minHeight: '0',
		background: 'rgba(255,255,255,0.025)',
		border: `1px solid ${TOSS_BORDER}`,
		borderRadius: '12px', padding: '14px 16px',
		display: 'flex', flexDirection: 'column', gap: '12px',
		maxHeight: '230px', overflow: 'hidden', minWidth: 0
	},
	candidatePreviewHeader: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' },
	candidatePreviewTitle: { fontSize: '14px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.01em' },
	candidatePreviewSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '3px' },
	candidatePreviewActions: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
	candidateIdButton: {
		display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
		flexShrink: 0, padding: '7px 11px', borderRadius: '999px',
		fontSize: '11px', fontWeight: '800',
		background: TOSS_BLUE_SOFT,
		border: `1px solid ${TOSS_BLUE_BORDER}`,
		color: TOSS_BLUE, cursor: 'copy',
		letterSpacing: '0', lineHeight: 1
	},
	candidatePreviewText: {
		margin: 0, whiteSpace: 'pre-wrap',
		fontSize: '12px', lineHeight: 1.6,
		color: 'var(--spice-text)',
		maxHeight: '140px', overflowY: 'auto',
		padding: '10px 12px',
		background: '#101418',
		border: '1px solid rgba(255,255,255,0.04)',
		borderRadius: '10px'
	},
	candidateEmpty: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '180px', fontSize: '12px', color: 'var(--spice-subtext)', opacity: 0.7 },
	secondaryBtn: {
		background: 'transparent', color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		height: '32px', padding: '0 10px', borderRadius: '8px',
		fontWeight: '600', cursor: 'pointer', fontSize: '12px',
		letterSpacing: '-0.005em'
	},
	characterPronunciationProgress: {
		display: 'flex', flexDirection: 'column', gap: '5px',
		width: '220px', maxWidth: 'min(220px, 100%)',
		padding: '8px 0', borderRadius: '0',
		border: 'none',
		background: 'transparent',
		boxSizing: 'border-box'
	},
	characterPronunciationProgressText: { fontSize: '11px', lineHeight: 1.3, color: 'var(--spice-subtext)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
	characterPronunciationProgressTrack: { width: '100%', height: '4px', borderRadius: '999px', background: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
	characterPronunciationProgressFill: { height: '100%', borderRadius: '999px', background: TOSS_BLUE, transition: 'width 160ms ease', boxShadow: 'none' },
	playbackTime: { fontSize: '11px', color: 'var(--spice-subtext)', minWidth: '42px', fontVariantNumeric: 'tabular-nums', fontFeatureSettings: '"tnum"', fontWeight: '500' },
	playbackBar: {
		flex: 1, height: '6px',
		background: 'rgba(255,255,255,0.08)',
		borderRadius: '999px', cursor: 'pointer',
		overflow: 'hidden', position: 'relative'
	},
	playbackFill: { height: '100%', background: TOSS_BLUE, borderRadius: '999px', boxShadow: 'none' },
	seekBtn: {
		background: 'transparent', color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		height: '28px', padding: '0 7px', borderRadius: '7px',
		fontSize: '10.5px', fontWeight: '600', cursor: 'pointer',
		letterSpacing: '-0.005em', fontVariantNumeric: 'tabular-nums'
	},
	offsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '600', letterSpacing: '0.02em', textTransform: 'uppercase', opacity: 0.8 },
	offsetValue: {
		fontSize: '12px', color: 'var(--spice-text)', fontWeight: '700',
		minWidth: '64px', textAlign: 'center',
		padding: '4px 8px', borderRadius: '7px',
		background: 'transparent',
		border: 'none',
		fontVariantNumeric: 'tabular-nums'
	},
	offsetBtn: {
		background: 'transparent', color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		height: '28px', padding: '0 7px', borderRadius: '7px',
		fontSize: '10.5px', fontWeight: '600', cursor: 'pointer',
		fontVariantNumeric: 'tabular-nums'
	},
	lineOffsetBox: {
		display: 'flex',
		flexDirection: 'column',
		gap: '8px',
		marginTop: '8px',
		padding: '10px 0',
		borderRadius: '0',
		background: 'transparent',
		border: 'none'
	},
	lineOffsetHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' },
	lineOffsetLabel: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase' },
	lineOffsetValue: {
		fontSize: '11px',
		color: 'var(--spice-text)',
		fontWeight: '800',
		fontVariantNumeric: 'tabular-nums',
		padding: '3px 0',
		borderRadius: '0',
		background: 'transparent',
		border: 'none'
	},
	lineOffsetButtonRow: { display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '6px' },
	lineOffsetBtn: {
		background: 'transparent',
		color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		borderRadius: '7px',
		height: '28px',
		padding: '0 8px',
		fontSize: '10.5px',
		fontWeight: '800',
		cursor: 'pointer',
		fontVariantNumeric: 'tabular-nums'
	},
	lineNav: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px', marginBottom: '14px' },
	navBtn: {
		background: 'transparent', color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		width: '34px', height: '34px', borderRadius: '8px',
		cursor: 'pointer',
		display: 'flex', alignItems: 'center', justifyContent: 'center',
		fontSize: '14px', fontWeight: '600'
	},
	lineInfo: { textAlign: 'center', minWidth: '120px' },
	lineCount: { fontSize: '18px', fontWeight: '700', color: 'var(--spice-text)', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' },
	lineStatus: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '2px', fontWeight: '500' },
	multiVocalSwitchBtn: {
		background: 'transparent',
		border: '1px solid transparent',
		color: TOSS_BLUE,
		height: '30px', padding: '0 9px',
		borderRadius: '7px',
		fontSize: '11px',
		fontWeight: '800',
		cursor: 'pointer',
		letterSpacing: '-0.005em'
	},
	multiVocalBanner: {
		alignSelf: 'center',
		margin: '-6px 0 12px',
		padding: '7px 10px',
		borderRadius: '8px',
		background: TOSS_BLUE_SOFT,
		border: 'none',
		color: 'var(--spice-text)',
		fontSize: '11px',
		fontWeight: '700',
		letterSpacing: '-0.005em'
	},
	parallelSplitEditor: {
		alignSelf: 'stretch',
		maxWidth: '920px',
		width: '100%',
		margin: '-2px auto 12px',
		padding: '10px 0',
		borderRadius: '0',
		background: 'transparent',
		borderTop: `1px solid ${TOSS_BORDER}`,
		borderBottom: `1px solid ${TOSS_BORDER}`,
		boxSizing: 'border-box'
	},
	parallelSplitHeader: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' },
	parallelSplitTitle: { fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '800', letterSpacing: '0.04em', textTransform: 'uppercase' },
	parallelSplitBadge: {
		padding: '3px 8px',
		borderRadius: '999px',
		background: TOSS_BLUE_SOFT,
		border: `1px solid ${TOSS_BLUE_BORDER}`,
		color: 'var(--spice-text)',
		fontSize: '10px',
		fontWeight: '800',
		fontVariantNumeric: 'tabular-nums'
	},
	parallelSplitResetBtn: {
		background: 'transparent',
		border: '1px solid transparent',
		color: 'var(--spice-subtext)',
		padding: '4px 9px',
		borderRadius: '7px',
		fontSize: '10px',
		fontWeight: '800',
		cursor: 'pointer'
	},
	parallelSplitToggleBtn: {
		background: 'transparent',
		border: '1px solid transparent',
		color: 'var(--spice-subtext)',
		padding: '4px 9px',
		borderRadius: '7px',
		fontSize: '10px',
		fontWeight: '800',
		cursor: 'pointer'
	},
	parallelSplitBody: {
		maxHeight: 'min(220px, 24vh)',
		overflowY: 'auto',
		overflowX: 'hidden',
		overscrollBehavior: 'contain',
		scrollbarWidth: 'thin',
		padding: '2px 4px 4px'
	},
	parallelSplitTape: { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: '2px 0', lineHeight: 1.2 },
	parallelSplitChar: {
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		minWidth: '12px',
		padding: '5px 1px',
		color: 'var(--spice-text)',
		fontSize: '17px',
		fontWeight: '700',
		boxSizing: 'border-box'
	},
	parallelSplitBoundary: {
		width: '12px',
		minWidth: '12px',
		margin: '0 -2px',
		padding: 0,
		border: 'none',
		borderRadius: '999px',
		background: 'transparent',
		color: 'rgba(255,255,255,0.28)',
		cursor: 'pointer',
		fontSize: '14px',
		fontWeight: '900',
		lineHeight: 1
	},
	parallelSplitBoundaryActive: {
		background: TOSS_BLUE_SOFT,
		color: 'var(--spice-text)',
		boxShadow: `0 0 0 1px ${TOSS_BLUE_BORDER}`
	},
	speakerGroups: { display: 'flex', flexDirection: 'column', gap: '11px' },
	speakerGroupTitle: { fontSize: '10px', fontWeight: '850', color: 'var(--spice-subtext)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: '6px' },
	speakerGrid: { display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '7px' },
	speakerChoice: {
		minHeight: '34px',
		borderRadius: '8px',
		border: '1px solid transparent',
		background: 'transparent',
		color: 'var(--spice-text)',
		display: 'inline-flex',
		alignItems: 'center',
		gap: '8px',
		padding: '0 11px',
		fontSize: '11px',
		fontWeight: '850',
		cursor: 'pointer',
		textAlign: 'left',
		letterSpacing: '0.01em',
		outline: 'none'
	},
	speakerDot: { width: '8px', height: '8px', borderRadius: '999px', flexShrink: 0 },
	customSpeakerColorEditor: {
		display: 'grid',
		gridTemplateColumns: '42px minmax(0, 1fr)',
		gap: '10px',
		alignItems: 'start',
		marginTop: '10px',
		padding: '12px 0 0',
		borderRadius: '0',
		border: 'none',
		borderTop: `1px solid ${TOSS_BORDER}`,
		background: 'transparent'
	},
	customSpeakerColorPicker: {
		width: '42px',
		height: '42px',
		padding: '3px',
		borderRadius: '8px',
		border: `1px solid ${TOSS_BORDER}`,
		background: 'transparent',
		cursor: 'pointer'
	},
	customSpeakerColorFields: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
	customSpeakerColorLabel: { fontSize: '11px', fontWeight: '850', color: 'var(--spice-text)' },
	customSpeakerColorDescription: { fontSize: '10px', lineHeight: 1.45, color: 'var(--spice-subtext)' },
	customSpeakerColorText: {
		width: '100%',
		minHeight: '34px',
		boxSizing: 'border-box',
		borderRadius: '8px',
		border: `1px solid ${TOSS_BORDER}`,
		background: 'rgba(0,0,0,0.18)',
		color: 'var(--spice-text)',
		fontFamily: 'monospace',
		fontSize: '12px',
		padding: '0 10px',
		outline: 'none'
	},
	effectGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '6px' },
	effectCard: {
		minHeight: '72px',
		borderRadius: '8px',
		border: '1px solid transparent',
		background: 'rgba(255,255,255,0.025)',
		color: 'var(--spice-text)',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		padding: '12px 8px',
		cursor: 'pointer',
		overflow: 'visible',
		boxSizing: 'border-box',
		outline: 'none'
	},
	effectLabel: {
		minWidth: 0,
		maxWidth: '100%',
		overflow: 'visible',
		whiteSpace: 'nowrap',
		fontSize: '19px',
		lineHeight: 1.1,
		fontWeight: '900',
		color: 'var(--spice-text)',
		transformOrigin: 'center',
		letterSpacing: 0
	},
	effectStripRow: {
		flexShrink: 0,
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'flex-start',
		gap: '12px',
		marginTop: '4px',
		padding: '12px 0 0',
		borderTop: `1px solid ${TOSS_BORDER}`,
		containerType: 'inline-size',
		containerName: 'ivlyrics-sync-effects'
	},
	effectStripTitle: {
		fontSize: '12px',
		fontWeight: '850',
		color: 'var(--spice-subtext)',
		whiteSpace: 'nowrap',
		letterSpacing: '0.04em',
		paddingTop: '4px'
	},
	effectStrip: {
		display: 'flex',
		flexWrap: 'wrap',
		alignItems: 'stretch',
		gap: '6px',
		flex: '1 1 340px',
		minWidth: 0,
		padding: '4px 4px 8px'
	},
	effectPill: {
		flex: '0 0 auto',
		minWidth: '105px',
		height: '54px',
		borderRadius: '9px',
		border: `1px solid ${TOSS_BORDER}`,
		background: 'rgba(255,255,255,0.025)',
		color: 'var(--spice-text)',
		display: 'inline-flex',
		alignItems: 'center',
		justifyContent: 'center',
		padding: '0 14px',
		cursor: 'pointer',
		overflow: 'visible',
		outline: 'none',
		scrollSnapAlign: 'start'
	},
	effectPillLabel: {
		minWidth: 0,
		whiteSpace: 'nowrap',
		fontSize: '16px',
		fontWeight: '850',
		lineHeight: 1.1,
		color: 'inherit',
		transformOrigin: 'center'
	},
	parallelStack: { width: '100%', display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'stretch' },
	parallelStackLineActive: {
		background: TOSS_BLUE_SOFT,
		borderColor: TOSS_BLUE_BORDER,
		boxShadow: `inset 0 0 0 1px ${TOSS_BLUE_RING}`
	},
	parallelStackLineDuet: {
		background: 'rgba(156, 92, 255, 0.055)',
		borderColor: 'rgba(190, 150, 255, 0.20)'
	},
	parallelStackLineDuetActive: {
		background: 'rgba(156, 92, 255, 0.13)',
		borderColor: 'rgba(200, 168, 255, 0.52)'
	},
	parallelStackMeta: {
		color: 'var(--spice-subtext)',
		fontSize: '10px',
		fontWeight: '800',
		letterSpacing: '0.04em',
		textTransform: 'uppercase',
		fontVariantNumeric: 'tabular-nums',
		lineHeight: 1
	},
	parallelStackMetaDuet: { color: '#d9c7ff' },
	parallelStackText: { display: 'inline-flex', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'stretch', gap: '0px', maxWidth: '100%' },
	parallelStackJoinSeparator: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '14px', minWidth: '14px', flexShrink: 0, color: 'transparent', pointerEvents: 'none' },
	parallelStackChar: {
		padding: '6px 1px',
		borderRadius: 0,
		fontSize: '28px',
		fontWeight: '600',
		minWidth: '6px',
		boxSizing: 'border-box',
		textAlign: 'center',
		flexShrink: 0,
		color: 'inherit',
		letterSpacing: 0,
		lineHeight: 1.15
	},
	parallelStackCharSynced: { background: SYNC_CREATOR_SYNCED_BACKGROUND },
	lyricsBoxParallelScrollable: {
		alignItems: 'stretch',
		// Grow to fit 3 vocal lines before inner scrolling kicks in.
		// overscrollBehavior auto lets wheel scroll chain to the outer
		// stage (text effect / partial effects) at the top/bottom edge.
		maxHeight: 'min(500px, 54vh)',
		overflowY: 'auto',
		overflowX: 'hidden',
		overscrollBehavior: 'auto',
		scrollbarWidth: 'thin',
		paddingRight: '14px',
		paddingLeft: '14px',
		touchAction: 'pan-y'
	},
	charSpanPronunciationPrimary: { display: 'inline-flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', gap: '2px' },
	// No horizontal padding: it would sit between adjacent unit bubbles as a
	// transparent slit (the group's box is not painted, only the chars are).
	charWordGroupPrimary: { flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', minHeight: '68px', padding: '2px 0 6px', boxSizing: 'border-box' },
	charSpanInWordPrimary: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 'auto', width: 'auto', minHeight: '24px', padding: '4px 0 0', fontSize: '14px', lineHeight: 1, letterSpacing: 0 },
	charFixedPrimaryCell: { width: '28px', minWidth: '28px', maxWidth: '28px', padding: '4px 0 6px', overflow: 'visible' },
	charFuriganaWrap: { position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '1em', lineHeight: 'inherit' },
	charOriginalSmall: { display: 'flex', alignItems: 'flex-end', justifyContent: 'center', height: '30px', minWidth: '100%', fontSize: '14px', fontWeight: '600', color: 'inherit', opacity: 0.82, lineHeight: 1, letterSpacing: 0 },
	charPronunciationPrimary: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '26px', fontSize: '24px', fontWeight: '700', color: 'inherit', lineHeight: 1.05, whiteSpace: 'nowrap', letterSpacing: 0 },
	charPronunciationPrimaryFixed: { position: 'absolute', left: '50%', bottom: '7px', transform: 'translateX(-50%)', width: 'max-content', minWidth: '100%', textAlign: 'center', pointerEvents: 'none' },
	charSynced: { background: SYNC_CREATOR_SYNCED_BACKGROUND },
	charRecording: { background: 'rgba(255, 152, 0, 0.6)' },
	charLocked: { boxShadow: `inset 0 -3px 0 ${TOSS_BLUE}` },
	nextLineBox: { textAlign: 'center', padding: '10px 8px', opacity: 0.55 },
	nextLineLabel: { fontSize: '10px', color: 'var(--spice-subtext)', marginBottom: '5px', textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: '700' },
	nextLineText: { fontSize: '14px', color: 'var(--spice-subtext)', lineHeight: 1.7, letterSpacing: '-0.005em' },
	hint: { fontSize: '12px', color: 'var(--spice-subtext)', textAlign: 'center', padding: '10px 8px', fontStyle: 'italic', opacity: 0.8 },
	ctrlBtn: {
		background: 'transparent', color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		height: '32px', padding: '0 10px', borderRadius: '7px',
		fontWeight: '600', cursor: 'pointer', fontSize: '12px',
		letterSpacing: '-0.005em'
	},
	modeBtn: {
		border: '1px solid transparent',
		height: '32px', padding: '0 12px', borderRadius: '8px',
		fontWeight: '700', cursor: 'pointer', fontSize: '12px',
		minWidth: '92px', letterSpacing: '-0.005em'
	},
	deleteBtn: {
		background: 'transparent',
		color: '#ff7c73',
		border: '1px solid transparent',
		height: '32px', padding: '0 10px', borderRadius: '7px',
		fontWeight: '600', cursor: 'pointer', fontSize: '12px',
		letterSpacing: '-0.005em'
	},
	loading: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--spice-subtext)', fontSize: '13px', fontWeight: '500' },
	error: { textAlign: 'center', padding: '40px', color: '#ff7a72', fontSize: '13px', fontWeight: '500' },
	// 공통 모달 스타일
	lrcLibModal: {
		position: 'fixed', inset: 0,
		background: 'rgba(0,0,0,0.72)',
		zIndex: 'var(--iv-layer-modal, 2147483647)',
		display: 'flex', alignItems: 'center', justifyContent: 'center',
		padding: '24px'
	},
	lrcLibContent: {
		background: '#171b20',
		border: '1px solid rgba(255,255,255,0.08)',
		borderRadius: '14px', padding: '24px',
		width: '90%', maxWidth: '620px', maxHeight: '85vh',
		display: 'flex', flexDirection: 'column', gap: '14px',
		boxShadow: '0 24px 64px rgba(0,0,0,0.42)'
	},
	lrcLibTitle: { fontSize: '18px', fontWeight: '700', color: 'var(--spice-text)', margin: 0, letterSpacing: '-0.015em' },
	lrcLibDesc: { fontSize: '13px', color: 'var(--spice-subtext)', lineHeight: 1.55 },
	multiVocalDecisionPreview: {
		fontSize: '13px',
		lineHeight: 1.55,
		color: 'var(--spice-text)',
		padding: '12px 14px',
		background: 'rgba(255,255,255,0.045)',
		border: '1px solid rgba(255,255,255,0.08)',
		borderRadius: '12px',
		whiteSpace: 'nowrap',
		overflow: 'hidden',
		textOverflow: 'ellipsis'
	},
	parentheticalLayoutOriginal: {
		fontSize: '12px',
		lineHeight: 1.55,
		color: 'var(--spice-subtext)',
		padding: '10px 12px',
		background: 'rgba(255,255,255,0.035)',
		border: '1px solid rgba(255,255,255,0.07)',
		borderRadius: '10px',
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-word'
	},
	parentheticalLayoutGrid: {
		display: 'grid',
		gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
		gap: '10px'
	},
	parentheticalLayoutOption: {
		background: 'transparent',
		border: '1px solid rgba(255,255,255,0.09)',
		borderRadius: '10px',
		padding: '13px',
		color: 'var(--spice-text)',
		textAlign: 'left',
		cursor: 'pointer',
		display: 'flex',
		flexDirection: 'column',
		gap: '9px',
		minWidth: 0
	},
	parentheticalLayoutOptionPrimary: {
		background: TOSS_BLUE_SOFT,
		border: `1px solid ${TOSS_BLUE_BORDER}`,
		boxShadow: 'none'
	},
	parentheticalLayoutOptionTitle: { fontSize: '13px', fontWeight: '800', letterSpacing: '-0.005em' },
	parentheticalLayoutOptionDesc: { fontSize: '11.5px', color: 'var(--spice-subtext)', lineHeight: 1.45 },
	parentheticalLayoutPreview: {
		display: 'flex',
		flexDirection: 'column',
		gap: '4px',
		padding: '10px',
		borderRadius: '9px',
		background: 'rgba(0,0,0,0.22)',
		border: '1px solid rgba(255,255,255,0.07)',
		fontSize: '13px',
		fontWeight: '700',
		lineHeight: 1.35,
		whiteSpace: 'pre-wrap',
		wordBreak: 'break-word'
	},
	lrcLibBtnRow: { display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap', marginTop: '4px' },
	lrcLibBtn: {
		background: TOSS_BLUE, color: '#fff',
		border: 'none', height: '34px', padding: '0 16px', borderRadius: '999px',
		fontWeight: '700', cursor: 'pointer', fontSize: '13px',
		letterSpacing: '-0.005em',
		boxShadow: 'none'
	},
	lrcLibBtnCancel: {
		background: 'transparent', color: 'var(--spice-subtext)',
		border: '1px solid transparent',
		height: '34px', padding: '0 14px', borderRadius: '8px',
		fontWeight: '600', cursor: 'pointer', fontSize: '13px'
	},
	// 키보드 단축키 스타일
	shortcutsContainer: {
		display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '8px 10px',
		padding: '12px 0',
		background: 'transparent',
		border: 'none',
		borderRadius: '0', marginTop: '10px'
	},
	shortcutItem: { display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--spice-subtext)', fontWeight: '500' },
	shortcutKey: {
		display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
		minWidth: '26px', height: '24px', padding: '0 7px',
		background: 'rgba(255,255,255,0.06)',
		color: 'var(--spice-text)', borderRadius: '6px',
		fontSize: '10.5px', fontWeight: '700',
		fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
		border: '1px solid rgba(255,255,255,0.10)',
		boxShadow: 'none'
	},
	shortcutDesc: { color: 'var(--spice-subtext)' },
	workspace: {
		flex: 1,
		minHeight: 0,
		display: 'grid',
		gridTemplateColumns: 'minmax(220px, 260px) minmax(480px, 1fr) minmax(280px, 340px)',
		gap: 0,
		padding: 0,
		overflow: 'hidden'
	},
	sideRail: { minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, padding: '4px 0', background: '#11161b', borderRight: `1px solid ${TOSS_BORDER}` },
	centerRail: { minWidth: 0, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, background: '#0f1215' },
	rightRail: { minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 0, padding: 0, background: '#11161b', borderLeft: `1px solid ${TOSS_BORDER}` },
	inspectorScroll: { minHeight: 0, flex: '1 1 auto', overflowY: 'auto', overflowX: 'hidden', padding: '4px 0' },
	historyPanel: {
		flex: '0 1 clamp(190px, 28vh, 300px)',
		minHeight: '130px',
		display: 'flex',
		flexDirection: 'column',
		background: '#11161b',
		borderTop: `1px solid ${TOSS_BORDER}`,
		overflow: 'hidden'
	},
	historyResizeHandle: {
		height: '9px',
		flexShrink: 0,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		cursor: 'ns-resize',
		touchAction: 'none',
		outline: 'none'
	},
	historyResizeGrip: {
		width: '34px',
		height: '2px',
		borderRadius: '999px',
		background: 'rgba(255,255,255,0.22)'
	},
	historyHeader: { padding: '12px 14px 9px', flexShrink: 0 },
	historyTitleRow: { display: 'flex', alignItems: 'center', gap: '8px' },
	historyTitle: { flex: 1, minWidth: 0, fontSize: '12px', fontWeight: '800', color: 'var(--spice-text)', letterSpacing: '-0.01em' },
	historyCount: { fontSize: '10px', color: 'var(--spice-subtext)', fontVariantNumeric: 'tabular-nums' },
	historyAutosaveToggle: {
		height: '26px', padding: '0 5px 0 7px',
		display: 'inline-flex', alignItems: 'center', gap: '6px',
		border: '1px solid transparent', borderRadius: '7px',
		background: 'transparent', color: 'var(--spice-subtext)', cursor: 'pointer',
		whiteSpace: 'nowrap'
	},
	historyAutosaveLabel: { fontSize: '9.5px', fontWeight: '700', lineHeight: 1 },
	historyAutosaveTrack: {
		position: 'relative', width: '27px', height: '15px', flexShrink: 0,
		borderRadius: '999px', background: 'rgba(255,255,255,0.16)',
		boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
		transition: 'background 160ms ease, box-shadow 160ms ease'
	},
	historyAutosaveTrackActive: {
		background: TOSS_BLUE,
		boxShadow: `inset 0 0 0 1px ${TOSS_BLUE_BORDER}`
	},
	historyAutosaveThumb: {
		position: 'absolute', top: '2px', left: '2px',
		width: '11px', height: '11px', borderRadius: '999px',
		background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.35)',
		transition: 'transform 160ms ease'
	},
	historyActions: { display: 'inline-flex', alignItems: 'center', gap: '2px' },
	historyIconButton: {
		width: '28px', height: '28px', padding: 0,
		display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
		border: '1px solid transparent', borderRadius: '7px',
		background: 'transparent', color: 'var(--spice-subtext)', cursor: 'pointer'
	},
	historyMeta: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, marginTop: '5px', fontSize: '10px', color: 'var(--spice-subtext)' },
	historySource: { minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	historySaveState: { marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '5px', whiteSpace: 'nowrap' },
	historySaveDot: { width: '5px', height: '5px', borderRadius: '999px', flexShrink: 0 },
	historyList: {
		listStyle: 'none', margin: 0, padding: '0 0 8px',
		minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
		overscrollBehavior: 'contain'
	},
	historyItem: { listStyle: 'none', margin: 0, padding: 0 },
	historyButton: {
		position: 'relative', width: '100%', minHeight: '42px',
		display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto',
		alignItems: 'center', gap: '7px',
		padding: '7px 13px 7px 11px',
		border: 'none', borderRadius: 0,
		background: 'transparent', color: 'var(--spice-text)',
		textAlign: 'left', cursor: 'pointer', boxShadow: 'none'
	},
	historyButtonActive: {
		background: TOSS_BLUE_SOFT,
		boxShadow: `inset 2px 0 0 ${TOSS_BLUE}`,
		cursor: 'default'
	},
	historyTimeline: { alignSelf: 'stretch', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center' },
	historyLine: { position: 'absolute', top: '-7px', bottom: '-7px', width: '1px', background: TOSS_BORDER },
	historyDot: { position: 'relative', zIndex: 1, width: '7px', height: '7px', borderRadius: '999px', background: 'rgba(255,255,255,0.30)', boxShadow: '0 0 0 3px #11161b' },
	historyDotActive: { background: TOSS_BLUE, boxShadow: `0 0 0 3px #11161b, 0 0 0 4px ${TOSS_BLUE_BORDER}` },
	historyContent: { minWidth: 0 },
	historyLabel: { fontSize: '11px', fontWeight: '750', color: 'inherit', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	historyText: { marginTop: '2px', fontSize: '9.5px', color: 'var(--spice-subtext)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
	historyTime: { fontSize: '9.5px', color: 'var(--spice-subtext)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' },
	historyEmpty: { padding: '18px 14px', color: 'var(--spice-subtext)', fontSize: '10.5px', lineHeight: 1.5, textAlign: 'center' },
	historyLive: { position: 'absolute', width: '1px', height: '1px', padding: 0, margin: '-1px', overflow: 'hidden', clip: 'rect(0, 0, 0, 0)', whiteSpace: 'nowrap', border: 0 },
	panel: {
		background: 'transparent',
		border: 'none',
		borderBottom: `1px solid ${TOSS_BORDER}`,
		borderRadius: 0,
		padding: '16px 18px',
		boxShadow: 'none'
	},
	panelTitle: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)', marginBottom: '10px', letterSpacing: '-0.01em' },
	panelSubtitle: { fontSize: '11px', color: 'var(--spice-subtext)', lineHeight: 1.4, marginTop: '-6px', marginBottom: '10px' },
	sourceTrack: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', minWidth: 0 },
	sourceAlbumArt: { width: '52px', height: '52px', borderRadius: '10px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,0,0,0.36)' },
	sourceControls: { display: 'flex', flexDirection: 'column', gap: '6px' },
	characterPronunciationTarget: {
		display: 'flex', flexDirection: 'column', gap: '6px',
		padding: '9px 0 3px', color: 'var(--spice-subtext)'
	},
	characterPronunciationTargetCompact: {
		display: 'inline-flex', alignItems: 'center', gap: '6px'
	},
	characterPronunciationTargetLabel: {
		fontSize: '10.5px', fontWeight: '700', letterSpacing: '0.02em'
	},
	sourceProvider: {
		display: 'flex', alignItems: 'center', gap: '8px',
		minHeight: '34px', padding: '0 11px', borderRadius: '10px',
		background: 'rgba(255,255,255,0.035)', border: `1px solid ${TOSS_BORDER}`
	},
	sourceProviderName: { fontSize: '12px', fontWeight: '700', color: 'var(--spice-text)' },
	sourceButtonRow: { display: 'grid', gridTemplateColumns: '1fr', gap: '6px' },
	fullWidthButton: { width: '100%', justifyContent: 'center' },
	lrclibIdBox: {
		display: 'flex',
		flexDirection: 'column',
		gap: '6px',
		padding: '10px 0',
		borderRadius: 0,
		background: 'transparent',
		borderTop: `1px solid ${TOSS_BORDER}`,
		borderBottom: `1px solid ${TOSS_BORDER}`
	},
	lrclibIdLabel: {
		fontSize: '10.5px',
		fontWeight: '850',
		color: 'var(--spice-subtext)',
		letterSpacing: '0.06em',
		textTransform: 'uppercase'
	},
	lrclibIdRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' },
	lrclibSearchBox: {
		gridColumn: '1 / -1',
		display: 'flex',
		flexDirection: 'column',
		gap: '6px',
		padding: '10px 0',
		borderRadius: 0,
		background: 'transparent',
		borderTop: `1px solid ${TOSS_BORDER}`,
		borderBottom: `1px solid ${TOSS_BORDER}`
	},
	lrclibSearchRow: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: '8px' },
	lrclibIdInput: {
		minWidth: 0,
		background: 'rgba(255,255,255,0.035)',
		color: 'var(--spice-text)',
		border: `1px solid ${TOSS_BORDER}`,
		borderRadius: '10px',
		height: '34px', padding: '0 11px',
		fontSize: '12px',
		fontWeight: '700',
		outline: 'none',
		boxSizing: 'border-box'
	},
	bulkVocalPanelRow: { display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', gap: '8px', alignItems: 'center' },
	statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, marginBottom: '10px', borderTop: `1px solid ${TOSS_BORDER}`, borderBottom: `1px solid ${TOSS_BORDER}` },
	statCard: { background: 'transparent', border: 'none', borderRight: `1px solid ${TOSS_BORDER}`, borderRadius: 0, padding: '11px 10px' },
	statValue: { fontSize: '18px', fontWeight: '800', color: 'var(--spice-text)', fontVariantNumeric: 'tabular-nums' },
	statLabel: { fontSize: '11px', color: 'var(--spice-subtext)', marginTop: '4px', fontWeight: '700' },
	actionGrid: { display: 'flex', flexWrap: 'wrap', gap: '3px' },
	stagePanel: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 18px 10px', overflow: 'hidden', borderBottom: 'none' },
	stageBody: {
		flex: 1,
		minHeight: 0,
		display: 'flex',
		flexDirection: 'column',
		justifyContent: 'flex-start',
		overflowY: 'auto',
		overflowX: 'hidden',
		overscrollBehavior: 'contain',
		scrollbarGutter: 'stable',
		paddingRight: '4px'
	},
	stageLyricsBox: {
		flex: '0 0 auto',
		minHeight: 'clamp(120px, 18vh, 176px)',
		maxHeight: 'min(280px, 36vh)',
		padding: 'clamp(18px, 2.8vh, 26px) 18px',
		marginBottom: '8px'
	},
	transportPanel: { display: 'flex', flexDirection: 'column', gap: '8px', padding: '10px 18px' },
	transportRow: { display: 'flex', alignItems: 'center', gap: '10px' },
	offsetCompactRow: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' },
	rightActionRow: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
	railDivider: { height: '1px', background: TOSS_BORDER, margin: '10px 0' },
	sideInspectorGrid: { display: 'flex', flexDirection: 'column', gap: '12px' },
};

export function getSyncCreatorStyles({
	usePrimaryCharacterPronunciation,
	hasCurrentLineFurigana,
	hasCurrentLineCharacterPronunciation,
	hasGroupedPronunciation,
	hasSelectedParallelPart,
	isRecording,
	currentSpeakerTextColor,
	currentSpeakerMutedColor,
	furiganaFontSize,
	furiganaFontWeight,
	furiganaOpacity,
}) {
	const cursor = isRecording ? 'pointer' : 'default';
	const topPadding = hasCurrentLineFurigana ? 18 : 10;
	const glyphSize = usePrimaryCharacterPronunciation ? '15px' : '32px';
	const glyphLineHeight = usePrimaryCharacterPronunciation ? 1.05 : 1.15;

	return {
		...staticStyles,
		parallelStackLine: {
			width: '100%',
			flexShrink: 0,
			background: 'transparent',
			color: 'var(--spice-text)',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '10px',
			padding: '12px 14px 10px',
			display: 'flex',
			flexDirection: 'column',
			alignItems: 'center',
			gap: '7px',
			textAlign: 'center',
			cursor: cursor,
			boxSizing: 'border-box'
		},
		lyricsBox: {
			background: '#12171c',
			border: `1px solid ${TOSS_BORDER}`,
			borderRadius: '12px',
			padding: '32px 20px',
			display: 'flex', flexDirection: 'column', alignItems: 'center',
			cursor: cursor,
			userSelect: 'none', marginBottom: '12px',
			boxShadow: 'none'
		},
		rtlTextRun: { display: 'inline-block', maxWidth: '100%', padding: '10px 1px', fontSize: '32px', fontWeight: '600', lineHeight: 1.45, letterSpacing: 0, whiteSpace: 'pre', cursor: cursor, color: 'transparent', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' },
		wordInputSeparator: {
		display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
		alignSelf: 'stretch', flexShrink: 0, boxSizing: 'border-box',
		margin: '0 0.22em',
		padding: usePrimaryCharacterPronunciation
			? '4px 0 6px'
			: `${topPadding}px 0 ${(hasCurrentLineCharacterPronunciation && !hasGroupedPronunciation) ? 26 : 10}px`,
		fontSize: glyphSize,
		lineHeight: glyphLineHeight,
		color: 'var(--spice-subtext)', opacity: 0.55,
		fontWeight: '500', userSelect: 'none', pointerEvents: 'none'
	},
		stageEffectPreview: {
		width: '100%',
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		overflow: 'visible',
		color: currentSpeakerTextColor,
		'--lyrics-color-active': currentSpeakerTextColor,
		'--lyrics-color-inactive': currentSpeakerMutedColor
	},
		lyricsLine: { display: 'inline-flex', flexWrap: 'nowrap', gap: '0px', paddingLeft: '32px', paddingRight: '32px', justifyContent: 'center', alignItems: usePrimaryCharacterPronunciation ? 'flex-start' : 'stretch', color: currentSpeakerTextColor },
		rtlLyricsLine: { display: 'block', width: '100%', paddingLeft: '32px', paddingRight: '32px', textAlign: 'center', direction: 'rtl', unicodeBidi: 'plaintext', color: currentSpeakerTextColor },
		charSpan: { padding: usePrimaryCharacterPronunciation ? '4px 4px 6px' : `${topPadding}px 1px ${(hasCurrentLineCharacterPronunciation && !hasGroupedPronunciation) ? 26 : (hasGroupedPronunciation ? (hasSelectedParallelPart ? 28 : 27) : 10)}px`, marginInline: 0, borderRadius: 0, cursor: cursor, position: 'relative', fontSize: glyphSize, fontWeight: '600', minWidth: usePrimaryCharacterPronunciation ? '18px' : '6px', minHeight: usePrimaryCharacterPronunciation ? '68px' : undefined, boxSizing: 'border-box', textAlign: 'center', flexShrink: 0, color: currentSpeakerTextColor, letterSpacing: 0, lineHeight: glyphLineHeight },
		charJoinSeparator: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: usePrimaryCharacterPronunciation ? '12px' : '16px', minWidth: usePrimaryCharacterPronunciation ? '12px' : '16px', padding: 0, flexShrink: 0, color: 'transparent', pointerEvents: 'none' },
		charWordGroup: { display: 'inline-flex', position: 'relative', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', flexShrink: 0, borderRadius: 0, padding: '0 0 3px', boxSizing: 'border-box', color: currentSpeakerTextColor },
		charWordOriginalRow: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', height: usePrimaryCharacterPronunciation ? '30px' : 'auto', whiteSpace: 'nowrap' },
		charWordSpace: { display: 'inline-flex', width: usePrimaryCharacterPronunciation ? '10px' : '12px', minWidth: usePrimaryCharacterPronunciation ? '10px' : '12px', padding: 0, margin: 0, flexShrink: 0, color: 'transparent', background: 'transparent', pointerEvents: isRecording ? 'auto' : 'none', boxSizing: 'border-box' },
		charSpanInWord: { padding: `${topPadding}px 1px ${hasSelectedParallelPart ? 28 : 27}px`, minWidth: '6px', minHeight: undefined },
		// The reading row is pulled up (-18px) into the cell's extended bottom
	// padding (13px row + 5px bubble trailing), so it renders inside the
	// character bubble; the per-mode cell padding carries the visual offset
	// (27px normal, 28px selected box and preview), so text-to-reading
	// matches reading-to-time spacing (~11px) everywhere.
	// width: 0 keeps the reading out of the group's cross-axis sizing: the
	// group box must stay exactly as wide as the character row, otherwise a
	// reading wider than its row (e.g. "aim" over a single "I") widens the
	// group and leaves transparent slivers between adjacent bubbles. The
	// nowrap text still renders centered, overflowing evenly on both sides.
	charWordPronunciation: { display: 'flex', width: '0', alignItems: 'center', justifyContent: 'center', minHeight: '13px', marginTop: '-18px', fontSize: '10px', fontWeight: '700', color: currentSpeakerTextColor, opacity: 0.76, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charWordPronunciationPrimary: { display: 'flex', width: '0', alignItems: 'center', justifyContent: 'center', minHeight: '28px', fontSize: '24px', fontWeight: '700', color: currentSpeakerTextColor, lineHeight: 1.05, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charFuriganaText: { position: 'absolute', left: '50%', bottom: '100%', transform: 'translateX(-50%)', marginBottom: '1px', fontSize: `${Number(furiganaFontSize) || 11}px`, fontWeight: furiganaFontWeight || '500', color: 'inherit', opacity: (Number(furiganaOpacity) || 80) / 100, lineHeight: 1, letterSpacing: 0, whiteSpace: 'nowrap', pointerEvents: 'none' },
		charPronunciation: { position: 'absolute', bottom: '7px', left: '50%', transform: 'translateX(-50%)', fontSize: '10px', fontWeight: '600', color: currentSpeakerTextColor, opacity: 0.76, lineHeight: 1, whiteSpace: 'nowrap', letterSpacing: 0, pointerEvents: 'none' },
		charPlayed: { background: SYNC_CREATOR_PROGRESS_BACKGROUND, color: currentSpeakerTextColor },
		charTime: { position: 'absolute', bottom: usePrimaryCharacterPronunciation ? '-18px' : (hasCurrentLineCharacterPronunciation ? '-16px' : '-20px'), left: '50%', transform: 'translateX(-50%)', fontSize: '9px', color: 'var(--spice-subtext)', whiteSpace: 'nowrap' },
	};
}
