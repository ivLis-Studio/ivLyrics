export const NOTIFICATION_ICON_SHAPES = {
    update: [
        ["path", { d: "M20 6v5h-5" }],
        ["path", { d: "M4 18v-5h5" }],
        ["path", { d: "M6.1 9a7 7 0 0 1 11.7-2.6L20 11" }],
        ["path", { d: "M4 13l2.2 4.6A7 7 0 0 0 17.9 15" }],
    ],
    close: [
        ["path", { d: "m18 6-12 12" }],
        ["path", { d: "m6 6 12 12" }],
    ],
    external: [
        ["path", { d: "M15 3h6v6" }],
        ["path", { d: "m10 14 11-11" }],
        ["path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }],
    ],
};

export function createNotificationIcon(react, name, size, shapes) {
    return react.createElement(
        "svg",
        {
            width: size,
            height: size,
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: 2,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            "aria-hidden": "true",
            focusable: "false",
        },
        shapes.map(([element, props], index) =>
            react.createElement(element, { ...props, key: `${name}-${index}` })
        )
    );
}

export function getNotificationTheme(readSetting) {
    try {
        return readSetting("ivLyrics:settings-ui-theme") === "light" ? "light" : "dark";
    } catch {
        return "dark";
    }
}
