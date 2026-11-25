import { clampSyncOffset } from "./syncOffsetValues.mjs";

export function createTrackSyncOffsetTools({ react, host, readUtils, createEvent, reportError }) {
  const { useState, useRef, useEffect } = react;

  const pendingTrackSyncOffsetWrites = new Map();
  let trackSyncOffsetWriteLoop = null;

  const startTrackSyncOffsetWriteLoop = () => {
    if (trackSyncOffsetWriteLoop) return;

    trackSyncOffsetWriteLoop = (async () => {
      while (pendingTrackSyncOffsetWrites.size > 0) {
        const [trackUri, offset] =
          pendingTrackSyncOffsetWrites.entries().next().value;
        pendingTrackSyncOffsetWrites.delete(trackUri);
        try {
          const persisted = await readUtils().setTrackSyncOffset(trackUri, offset, {
            dispatch: false,
          });
          if (persisted && !pendingTrackSyncOffsetWrites.has(trackUri)) {
            host.dispatchEvent(createEvent("ivLyrics:offset-changed", {
              detail: { trackUri, offset },
            }));
          }
        } catch (error) {
          reportError("[ivLyrics] Failed to persist track sync offset:", error);
        }
      }
    })()
      .catch((error) => {
        reportError("[ivLyrics] Track sync offset write loop failed:", error);
      })
      .finally(() => {
        trackSyncOffsetWriteLoop = null;
        if (pendingTrackSyncOffsetWrites.size > 0) {
          startTrackSyncOffsetWriteLoop();
        }
      });
  };

  const queueTrackSyncOffsetWrite = (trackUri, offset) => {
    pendingTrackSyncOffsetWrites.set(trackUri, offset);
    startTrackSyncOffsetWriteLoop();
  };

  // Current-track and global offsets as the toolbar shows and edits them. The
  // track value goes through the quick sync pill's write queue and event, so
  // both stay in step; the global value through Utils, as before.
  const useToolbarSyncOffsets = (trackUri) => {
    const [trackOffset, setTrackOffset] = useState(0);
    const [loadedTrackUri, setLoadedTrackUri] = useState(null);
    const [globalOffset, setGlobalOffset] = useState(() => clampSyncOffset(readUtils().getGlobalSyncOffset?.() || 0));
    const trackOffsetRef = useRef(0);
    const loadSeqRef = useRef(0);

    useEffect(() => {
      trackOffsetRef.current = 0;
      setTrackOffset(0);
      setLoadedTrackUri(null);
      const loadSeq = ++loadSeqRef.current;
      if (!trackUri) return undefined;

      let active = true;
      const apply = (offset) => {
        if (!active || loadSeqRef.current !== loadSeq) return;
        trackOffsetRef.current = offset;
        setTrackOffset(offset);
        setLoadedTrackUri(trackUri);
      };
      Promise.resolve(readUtils().getTrackSyncOffset(trackUri))
        .then((savedOffset) => apply(clampSyncOffset(savedOffset)))
        .catch((error) => {
          reportError("[ivLyrics] Failed to load track sync offset:", error);
          apply(0);
        });
      return () => {
        active = false;
      };
    }, [trackUri]);

    useEffect(() => {
      const handleTrackOffsetChange = (event) => {
        if (!trackUri || event.detail?.trackUri !== trackUri) return;
        const nextOffset = clampSyncOffset(event.detail?.offset);
        loadSeqRef.current += 1;
        trackOffsetRef.current = nextOffset;
        setTrackOffset(nextOffset);
        setLoadedTrackUri(trackUri);
      };
      const handleGlobalOffsetChange = (event) => {
        setGlobalOffset(clampSyncOffset(event.detail?.offset));
      };
      host.addEventListener("ivLyrics:offset-changed", handleTrackOffsetChange);
      host.addEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
      return () => {
        host.removeEventListener("ivLyrics:offset-changed", handleTrackOffsetChange);
        host.removeEventListener("ivLyrics:global-offset-changed", handleGlobalOffsetChange);
      };
    }, [trackUri]);

    const isTrackOffsetLoaded = Boolean(trackUri && loadedTrackUri === trackUri);
    const changeTrackOffset = (nextOffset) => {
      if (!isTrackOffsetLoaded) return;
      const safeOffset = clampSyncOffset(nextOffset);
      loadSeqRef.current += 1;
      trackOffsetRef.current = safeOffset;
      setTrackOffset(safeOffset);
      host.dispatchEvent(createEvent("ivLyrics:offset-changed", {
        detail: { trackUri, offset: safeOffset },
      }));
      queueTrackSyncOffsetWrite(trackUri, safeOffset);
    };
    const changeGlobalOffset = (nextOffset) => {
      const safeOffset = clampSyncOffset(nextOffset);
      setGlobalOffset(safeOffset);
      readUtils().setGlobalSyncOffset?.(safeOffset);
    };

    return {
      trackOffset,
      isTrackOffsetLoaded,
      globalOffset,
      trackOffsetRef,
      changeTrackOffset,
      changeGlobalOffset,
    };
  };

  return {
    queueTrackSyncOffsetWrite,
    useToolbarSyncOffsets,
  };
}
