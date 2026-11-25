import { openFluentReactModal } from "../modal/fluentModalHost.mjs";
import { createLrclibSearchRequests } from "../../providers/lyrics/lrclibSearchRequests.mjs";

const formatLrclibCandidateDuration = (duration) => {
  const seconds = Number(duration);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "";
  }
  const totalSeconds = Math.round(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const getLrclibCandidatePreviewLines = (candidate) => {
  const text = candidate?.previewText || candidate?.syncedLyrics || candidate?.plainLyrics || "";
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\[[^\]]+\]/g, "").replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .slice(0, 3);
};

export function createLocalLyricsSearchDialog({ react, readLyricsManager, getOptionsText, translate, notifyError }) {
  const getLrclibLocalSearchAddon = () => {
    const manager = readLyricsManager();
    const addon = manager?.getAddon?.("lrclib");
    if (addon?.searchCandidatesByQuery) {
      return addon;
    }
    const addons = manager?.getAddons?.() || [];
    return addons.find((item) => item?.id === "lrclib" && item?.searchCandidatesByQuery) || null;
  };

  const LocalLyricsLrclibSearchModal = ({ trackInfo = {}, onApplyLocalLyrics, onClose, signal }) => {
    const initialQuery = react.useMemo(() => {
      return [trackInfo?.title, trackInfo?.artist].filter(Boolean).join(" ").trim();
    }, [trackInfo?.title, trackInfo?.artist]);
    const [query, setQuery] = react.useState(initialQuery);
    const [candidateResult, setCandidateResult] = react.useState(null);
    const [statusText, setStatusText] = react.useState("");
    const [isSearching, setIsSearching] = react.useState(false);
    const [applyingKey, setApplyingKey] = react.useState(null);
    const candidates = candidateResult?.rows || [];
    const applyInProgress = react.useRef(false);
    const requests = react.useMemo(() => createLrclibSearchRequests({
      isOpen: () => !signal.aborted, setPending: setIsSearching,
    }), [signal]);
    react.useLayoutEffect(() => {
      signal.addEventListener("abort", requests.dispose, { once: true });
      return () => {
        signal.removeEventListener("abort", requests.dispose);
        requests.dispose();
      };
    }, [requests, signal]);

    const performSearch = react.useCallback(async () => {
      if (signal.aborted || applyInProgress.current) return;
      const searchValue = String(query || "").trim();
      if (!searchValue) {
        requests.cancel();
        setCandidateResult(null);
        setStatusText(getOptionsText("menu.localLyricsSearchEmpty", "검색어를 입력해 주세요."));
        return;
      }

      const addon = getLrclibLocalSearchAddon();
      if (!addon?.searchCandidatesByQuery) {
        requests.cancel();
        setCandidateResult(null);
        setStatusText(getOptionsText("menu.localLyricsLrclibUnavailable", "LRCLIB provider를 사용할 수 없습니다."));
        return;
      }

      const search = requests.begin();
      if (!search) return;
      setCandidateResult(null);
      setStatusText("");
      try {
        const result = await addon.searchCandidatesByQuery(searchValue, trackInfo, { signal: search.signal });
        if (!search.isCurrent()) return;
        const nextCandidates = Array.isArray(result?.candidates) ? result.candidates : [];
        setCandidateResult({ rows: nextCandidates, isCurrent: requests.captureCandidates() });
        setStatusText(
          nextCandidates.length
            ? getOptionsText("menu.localLyricsSearchResultCount", "{count}개 결과").replace("{count}", nextCandidates.length)
            : (result?.error || getOptionsText("menu.localLyricsSearchNoResults", "검색 결과가 없습니다."))
        );
      } catch (error) {
        if (!search.isCurrent()) return;
        console.error("[ivLyrics] LRCLIB local lyrics search failed:", error);
        setCandidateResult(null);
        setStatusText(error?.message || getOptionsText("menu.localLyricsSearchFailed", "가사 검색에 실패했습니다."));
      } finally {
        search.finish();
      }
    }, [query, trackInfo, requests, signal]);

    const applyCandidate = react.useCallback(async (candidate) => {
      const ownsCandidates = candidateResult?.isCurrent;
      if (!candidate || !ownsCandidates?.() || applyInProgress.current) {
        return;
      }

      const candidateKey = candidate.candidateKey || `${candidate.id || "candidate"}`;
      applyInProgress.current = true;
      setApplyingKey(candidateKey);
      try {
        const result = await onApplyLocalLyrics?.(candidate, { source: "lrclib-local-search", query, track: trackInfo, signal });
        if (ownsCandidates() && result !== false) onClose?.();
      } catch (error) {
        if (!ownsCandidates()) return;
        console.error("[ivLyrics] Failed to apply local LRCLIB lyrics:", error);
        notifyError(error?.message || getOptionsText("menu.localLyricsApplyFailed", "가사를 적용하지 못했습니다."));
      } finally {
        applyInProgress.current = false;
        if (!signal.aborted) setApplyingKey(null);
      }
    }, [candidateResult, onApplyLocalLyrics, onClose, query, trackInfo, signal]);

    const handleKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        void performSearch();
      }
    };

    const renderSearchHeader = () => react.createElement(
      "div",
      { className: "ivlyrics-fluent-header" },
      react.createElement(
        "div",
        { className: "ivlyrics-fluent-title-wrap" },
        react.createElement("h2", { className: "ivlyrics-fluent-title" }, getOptionsText("menu.localLyricsLrclibSearch", "LRCLIB 가사 검색")),
        react.createElement(
          "p",
          { className: "ivlyrics-fluent-subtitle" },
          getOptionsText("menu.localLyricsLrclibSearchSubtitle", "로컬 곡에는 ivLyrics 서버를 사용하지 않고 선택한 가사만 이 기기에 저장합니다.")
        )
      ),
      react.createElement(
        "button",
        {
          className: "ivlyrics-fluent-close",
          type: "button",
          onClick: onClose,
          "aria-label": translate("buttons.close") || "Close",
        },
        react.createElement("svg", {
          viewBox: "0 0 16 16",
          fill: "currentColor",
          dangerouslySetInnerHTML: {
            __html: '<path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8 2.146 2.854Z"/>',
          },
        })
      )
    );

    const renderLrclibCandidate = (candidate, index) => {
      const candidateKey = candidate.candidateKey || `${candidate.id || "candidate"}-${index}`;
      const title = candidate.trackName || candidate.name || getOptionsText("menu.unknownTitle", "Unknown title");
      const artist = candidate.artistName || getOptionsText("menu.unknownArtist", "Unknown artist");
      const album = candidate.albumName || "";
      const duration = formatLrclibCandidateDuration(candidate.duration);
      const previewLines = getLrclibCandidatePreviewLines(candidate);
      const meta = [artist, album, duration].filter(Boolean).join(" · ");
      const badges = [
        (candidate.hasSyncedLyrics || candidate.syncedLyrics) && getOptionsText("syncCreator.lrclibBadgeSynced", "Synced"),
        (candidate.hasPlainLyrics || candidate.plainLyrics) && getOptionsText("syncCreator.lrclibBadgePlain", "Plain"),
        candidate.instrumental && getOptionsText("syncCreator.lrclibBadgeInstrumental", "Instrumental"),
      ].filter(Boolean);

      return react.createElement(
        "div",
        { key: candidateKey, className: "ivl-tb-lrclib-result" },
        react.createElement(
          "div",
          { className: "ivl-tb-lrclib-main" },
          react.createElement(
            "div",
            { className: "ivl-tb-lrclib-title" },
            react.createElement("span", { className: "ivl-tb-trunc", title }, title),
            badges.map((badge) => react.createElement("span", { key: badge, className: "ivl-tb-pill" }, badge))
          ),
          react.createElement("div", { className: "ivl-tb-lrclib-meta ivl-tb-trunc", title: meta }, meta),
          previewLines.length > 0 && react.createElement(
            "div",
            { className: "ivl-tb-lrclib-preview" },
            previewLines.join(" / ")
          )
        ),
        react.createElement(
          "button",
          {
            className: "ivlyrics-fluent-btn",
            type: "button",
            onClick: () => void applyCandidate(candidate),
            disabled: !!applyingKey,
          },
          applyingKey === candidateKey
            ? getOptionsText("menu.localLyricsApplying", "적용 중")
            : getOptionsText("menu.apply", "적용")
        )
      );
    };

    const searchPlaceholder = getOptionsText("menu.localLyricsSearchPlaceholder", "곡명 또는 아티스트 검색");
    const renderLrclibSearchBar = () => react.createElement(
      "div",
      { className: "ivl-tb-lrclib-search" },
      react.createElement("input", {
        className: "ivl-tb-lrclib-input",
        type: "search",
        value: query,
        onChange: (event) => {
          if (signal.aborted || applyInProgress.current) return;
          requests.cancel();
          setCandidateResult(null);
          setStatusText("");
          setQuery(event.target.value);
        },
        onKeyDown: handleKeyDown,
        placeholder: searchPlaceholder,
        "aria-label": searchPlaceholder,
        autoComplete: "off",
        disabled: !!applyingKey,
      }),
      react.createElement(
        "button",
        {
          className: "ivlyrics-fluent-btn primary",
          type: "button",
          onClick: () => void performSearch(),
          disabled: isSearching || !!applyingKey,
        },
        isSearching
          ? getOptionsText("menu.localLyricsSearching", "검색 중")
          : getOptionsText("menu.search", "검색")
      )
    );

    return react.createElement(
      react.Fragment,
      null,
      renderSearchHeader(),
      react.createElement(
        "div",
        { className: "ivlyrics-fluent-body ivlyrics-options-modal-body ivl-tb-lrclib" },
        renderLrclibSearchBar(),
        statusText && react.createElement("p", { className: "ivl-tb-lrclib-status", role: "status" }, statusText),
        candidates.length > 0 && react.createElement(
          "div",
          { className: "ivl-tb-lrclib-results" },
          candidates.map(renderLrclibCandidate)
        )
      )
    );
  };

  return function openLocalLyricsLrclibSearchModal({ trackInfo, onApplyLocalLyrics }) {
    return openFluentReactModal({
      react,
      overlayId: "ivLyrics-local-lyrics-lrclib-overlay",
      // ivl-tb-dialog: dialogs opened from the lyrics-page toolbar share its look.
      overlayClassName: "ivl-tb-dialog-overlay",
      shellClassName: "ivlyrics-options-modal-shell ivl-tb-dialog ivl-tb-lrclib-shell",
      render: (closeModal, signal) => react.createElement(LocalLyricsLrclibSearchModal, {
        trackInfo,
        onApplyLocalLyrics,
        onClose: closeModal,
        signal,
      }),
    });
  };
}
