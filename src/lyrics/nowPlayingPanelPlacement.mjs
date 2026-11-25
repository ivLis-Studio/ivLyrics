// Spotify's test IDs still identify the track header and artwork when
// Spicetify's class mappings lag behind a client update.
const PANEL_HEADER_VISUAL_SELECTOR = '[data-testid="minimized-track-visual-enhancement"]';
const PANEL_COVER_SELECTOR = '.main-nowPlayingView-coverArtContainer, [data-testid="track-visual-enhancement"], [data-testid="video-player-npv"]';
const PANEL_ROOT_SELECTOR = '[data-testid="NPV_Panel_OpenDiv"], .main-nowPlayingView-panel';
const PANEL_WIDGET_SELECTOR = '.main-nowPlayingView-nowPlayingWidget, .main-nowPlayingView-nowPlayingGrid';
const PANEL_SECTION_SELECTOR = '.main-nowPlayingView-section';
const LEGACY_PANEL_ANCHOR = '.iHa_q9pq4un3VNRQgwTx';
export const NOW_PLAYING_PANEL_DISCOVERY_SELECTOR = [
    PANEL_ROOT_SELECTOR, PANEL_WIDGET_SELECTOR, PANEL_SECTION_SELECTOR, LEGACY_PANEL_ANCHOR,
].join(", ");

const findPanelContextItemInfo = (panel) => {
    if (!panel) return null;
    const mapped = panel.querySelector('.main-nowPlayingView-contextItemInfo');
    if (mapped) return mapped;

    const headerVisual = panel.querySelector(PANEL_HEADER_VISUAL_SELECTOR);
    if (!headerVisual) return null;
    // 곡 정보 블록은 커버(앨범아트/영상) 영역과 같은 그리드 안의 형제 요소다.
    let node = headerVisual;
    while (node.parentElement && node.parentElement !== panel) {
        const parent = node.parentElement;
        const cover = parent.querySelector(PANEL_COVER_SELECTOR);
        if (cover && !node.contains(cover)) {
            return node;
        }
        node = parent;
    }
    return headerVisual.parentElement !== panel ? headerVisual.parentElement : null;
};

// 가사 카드 자리: 곡 정보 블록 바로 다음, 없으면 첫 관련 섹션(뮤직비디오 등) 앞.
const getPanelLyricsSlot = (panel) => {
    const contextItemInfo = findPanelContextItemInfo(panel);
    if (contextItemInfo?.parentElement) {
        return { parent: contextItemInfo.parentElement, after: contextItemInfo, before: null };
    }
    const relatedSection = panel?.querySelector(PANEL_SECTION_SELECTOR);
    if (relatedSection?.parentElement) {
        return { parent: relatedSection.parentElement, after: null, before: relatedSection };
    }
    return null;
};

const isPanelContainerPlaced = (container, slot) => {
    if (container.parentElement !== slot.parent) return false;
    return slot.after
        ? container.previousElementSibling === slot.after
        : container.nextElementSibling === slot.before;
};

export function createNowPlayingPanelPlacement({ document, debug }) {
    const findNowPlayingPanel = () => {
        const panelRoot = document.querySelector(PANEL_ROOT_SELECTOR);
        if (panelRoot) return panelRoot;

        const widget = document.querySelector(PANEL_WIDGET_SELECTOR);
        if (widget) {
            return widget.closest(PANEL_ROOT_SELECTOR)
                || widget;
        }

        const section = document.querySelector(PANEL_SECTION_SELECTOR);
        if (section) {
            return section.closest(PANEL_ROOT_SELECTOR + ', .main-nowPlayingView-nowPlayingWidget')
                || section.parentElement;
        }

        return document.querySelector(LEGACY_PANEL_ANCHOR)?.parentElement || null;
    };

    const moveContainerToSlot = (container, slot) => {
        const reference = slot.after ? slot.after.nextSibling : slot.before;
        if (reference !== container) slot.parent.insertBefore(container, reference);
        debug("[NowPlayingPanelLyrics] Placed panel lyrics under the track info");
    };

    const placePanelContainer = (panel, container, slot = getPanelLyricsSlot(panel)) => {
        if (!slot) return false;
        if (!isPanelContainerPlaced(container, slot)) moveContainerToSlot(container, slot);
        return true;
    };

    // 곡 정보가 늦게 그려지거나 Spotify가 패널을 다시 그려 카드가 어긋났을 때 바로잡는다.
    const ensurePanelContainerPlacement = (panel, container) => {
        if (!panel || !container || !panel.contains(container)) return;
        const slot = getPanelLyricsSlot(panel);
        if (slot && !isPanelContainerPlaced(container, slot)) moveContainerToSlot(container, slot);
    };

    return { findNowPlayingPanel, getPanelLyricsSlot, placePanelContainer, ensurePanelContainerPlacement };
}
