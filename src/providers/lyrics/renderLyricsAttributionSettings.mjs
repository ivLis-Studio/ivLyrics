export function renderLyricsAttributionSettings(React, { className, title, attribution, link }) {
    const rows = [
        React.createElement('p', { style: { fontWeight: 700, marginBottom: '8px' } }, title),
        React.createElement('p', { style: { marginBottom: '8px' } }, attribution)
    ];
    if (link) {
        rows.push(React.createElement('a', {
            href: link.href,
            target: '_blank',
            rel: 'noreferrer'
        }, link.text));
    }

    return React.createElement('div', { className: `ai-addon-settings ${className}` },
        React.createElement('div', { className: 'ai-addon-setting', style: { marginTop: '16px' } },
            React.createElement('div', { className: 'ai-addon-info-box' }, ...rows)
        )
    );
}
