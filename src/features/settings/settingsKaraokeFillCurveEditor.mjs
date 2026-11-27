import { renderSettingsControlRow } from "./settingsSectionShell.mjs";
import {
  KARAOKE_FILL_CORRECTION_DEFAULT_POINTS, clampKaraokeFillCurveValue,
  evaluateKaraokeFillCurve, normalizeKaraokeFillCorrectionPoints,
} from "../../lyrics/karaokeFill.mjs";

const serializeKaraokeFillCurvePoints = (points) => JSON.stringify(
  points.map((point) => [
    Math.round(point.x * 1000) / 1000,
    Math.round(point.y * 1000) / 1000,
  ])
);

const viewBox = { width: 320, height: 180, padding: 22 };
const plotWidth = viewBox.width - viewBox.padding * 2;
const plotHeight = viewBox.height - viewBox.padding * 2;
const toSvgPoint = (point) => ({
  x: viewBox.padding + point.x * plotWidth,
  y: viewBox.padding + (1 - point.y) * plotHeight,
});
const buildCurvePath = (points) => Array.from({ length: 49 }, (_, index) => {
  const x = index / 48;
  const y = evaluateKaraokeFillCurve(points, x);
  const svgX = viewBox.padding + x * plotWidth;
  const svgY = viewBox.padding + (1 - y) * plotHeight;
  return `${index === 0 ? "M" : "L"} ${svgX.toFixed(2)} ${svgY.toFixed(2)}`;
}).join(" ");
const defaultPath = `M ${viewBox.padding} ${viewBox.height - viewBox.padding} L ${viewBox.width - viewBox.padding} ${viewBox.padding}`;


export function createSettingsKaraokeFillCurveEditor({ react, host, isSettingChanged, getSettingsText }) {
  const { useRef, useState, useEffect, useMemo } = react;

  return function ConfigKaraokeFillCurveEditor({
    name,
    settingKey,
    defaultValue,
    info,
    disabled = false,
    onChange = () => { },
  }) {
    const graphRef = useRef(null);
    const [points, setPoints] = useState(() => normalizeKaraokeFillCorrectionPoints(defaultValue));
    const pendingPointsRef = useRef(points);
    const dragCleanupRef = useRef(null);

    useEffect(() => {
      dragCleanupRef.current?.();
      const nextPoints = normalizeKaraokeFillCorrectionPoints(defaultValue);
      pendingPointsRef.current = nextPoints;
      setPoints(nextPoints);
      return () => dragCleanupRef.current?.();
    }, [defaultValue, disabled]);

    const curvePath = useMemo(() => buildCurvePath(points), [points]);

    const commitPoints = (nextPoints) => {
      const normalizedPoints = normalizeKaraokeFillCorrectionPoints(nextPoints);
      pendingPointsRef.current = normalizedPoints;
      setPoints(normalizedPoints);
      onChange(settingKey || "karaoke-fill-correction-curve", serializeKaraokeFillCurvePoints(normalizedPoints));
    };

    const updatePointFromPointer = (pointIndex, event) => {
      if (disabled || pointIndex <= 0 || pointIndex >= points.length - 1 || !graphRef.current) {
        return;
      }

      const rect = graphRef.current.getBoundingClientRect();
      const basePoints = pendingPointsRef.current || points;
      const rawY = 1 - ((event.clientY - rect.top - viewBox.padding * (rect.height / viewBox.height)) /
        Math.max(1, plotHeight * (rect.height / viewBox.height)));
      const minY = basePoints[pointIndex - 1].y;
      const maxY = basePoints[pointIndex + 1].y;
      const point = basePoints[pointIndex];
      const y = Math.max(minY, Math.min(maxY, clampKaraokeFillCurveValue(rawY, point.y)));
      if (y === point.y) return;
      // The existing points are normalized and the new value stays between its neighbors.
      const nextPoints = basePoints.slice();
      nextPoints[pointIndex] = { x: point.x, y };
      pendingPointsRef.current = nextPoints;
      setPoints(nextPoints);
    };

    const startDrag = (pointIndex, event) => {
      if (disabled || event.button !== 0 || pointIndex <= 0 || pointIndex >= points.length - 1) {
        return;
      }

      dragCleanupRef.current?.();
      const originalPoints = pendingPointsRef.current;
      const pointerId = event.pointerId;
      event.preventDefault();
      updatePointFromPointer(pointIndex, event);

      const handlePointerMove = (moveEvent) => {
        if (moveEvent.pointerId === pointerId) updatePointFromPointer(pointIndex, moveEvent);
      };
      const cleanup = () => {
        host.removeEventListener("pointermove", handlePointerMove);
        host.removeEventListener("pointerup", handlePointerUp);
        host.removeEventListener("pointercancel", handleCancel);
        host.removeEventListener("blur", handleCancel);
        dragCleanupRef.current = null;
      };
      const handlePointerUp = (upEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        cleanup();
        commitPoints(pendingPointsRef.current);
      };
      const handleCancel = (cancelEvent) => {
        if (cancelEvent.type === "pointercancel" && cancelEvent.pointerId !== pointerId) return;
        cleanup();
        pendingPointsRef.current = originalPoints;
        setPoints(originalPoints);
      };

      dragCleanupRef.current = cleanup;
      host.addEventListener("pointermove", handlePointerMove);
      host.addEventListener("pointerup", handlePointerUp);
      host.addEventListener("pointercancel", handleCancel);
      host.addEventListener("blur", handleCancel);
    };

    const resetCurve = () => {
      commitPoints(KARAOKE_FILL_CORRECTION_DEFAULT_POINTS);
    };

    return renderSettingsControlRow(react, {
      rowProps: {
        className: `setting-row karaoke-fill-curve-row${isSettingChanged(settingKey) ? " is-changed" : ""}`,
        "data-setting-key": settingKey,
        style: disabled ? { opacity: 0.5, pointerEvents: "none" } : {},
      },
      name,
      description: [info && react.createElement("div", { className: "setting-description" }, info)],
      controlClassName: "setting-row-right karaoke-fill-curve-control",
    },
      react.createElement(
        "svg",
        {
          ref: graphRef,
          className: "karaoke-fill-curve-graph",
          viewBox: `0 0 ${viewBox.width} ${viewBox.height}`,
          role: "img",
          "aria-label": name,
        },
        [0, 0.25, 0.5, 0.75, 1].map((tick) => react.createElement("line", {
          key: `grid-x-${tick}`,
          className: "karaoke-fill-curve-grid-line",
          x1: viewBox.padding + tick * plotWidth,
          y1: viewBox.padding,
          x2: viewBox.padding + tick * plotWidth,
          y2: viewBox.height - viewBox.padding,
        })),
        [0, 0.25, 0.5, 0.75, 1].map((tick) => react.createElement("line", {
          key: `grid-y-${tick}`,
          className: "karaoke-fill-curve-grid-line",
          x1: viewBox.padding,
          y1: viewBox.padding + tick * plotHeight,
          x2: viewBox.width - viewBox.padding,
          y2: viewBox.padding + tick * plotHeight,
        })),
        react.createElement("path", {
          className: "karaoke-fill-curve-default-path",
          d: defaultPath,
        }),
        react.createElement("path", {
          className: "karaoke-fill-curve-path",
          d: curvePath,
        }),
        points.map((point, index) => {
          const svgPoint = toSvgPoint(point);
          return react.createElement("g", {
            key: `point-${index}`,
            className: `karaoke-fill-curve-point${index === 0 || index === points.length - 1 ? " is-fixed" : ""}`,
            onPointerDown: (event) => startDrag(index, event),
          },
            react.createElement("circle", {
              cx: svgPoint.x,
              cy: svgPoint.y,
              r: index === 0 || index === points.length - 1 ? 5 : 7,
            }),
            react.createElement("text", {
              x: svgPoint.x,
              y: Math.max(13, svgPoint.y - 10),
            }, `${Math.round(point.y * 100)}%`)
          );
        })
      ),
      react.createElement(
        "button",
        {
          className: "btn karaoke-fill-curve-reset",
          type: "button",
          disabled,
          onClick: resetCurve,
        },
        getSettingsText("settings.syncCreatorSettings.fillCurve.reset", "Reset")
      )
    );
  };
}
