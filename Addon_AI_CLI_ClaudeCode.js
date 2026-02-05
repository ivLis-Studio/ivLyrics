/**
 * Claude Code CLI Addon for ivLyrics
 * Anthropic Claude Code CLI를 프록시 서버를 통해 사용
 *
 * @author ivLis STUDIO
 * @version 1.0.0
 *
 * 사용하려면:
 * 1. ~/.config/spicetify/cli-proxy 폴더에서 npm install && npm start
 * 2. ivLyrics 설정에서 Claude Code (CLI) 활성화
 */

(() => {
    'use strict';

    const ADDON_INFO = {
        id: 'cli-claude',
        name: 'Claude Code (CLI)',
        author: 'ivLis STUDIO',
        description: {
            ko: 'Anthropic Claude Code CLI를 프록시 서버를 통해 사용',
            en: 'Use Anthropic Claude Code CLI via proxy server',
            ja: 'Anthropic Claude Code CLIをプロキシサーバー経由で使用',
            'zh-CN': '通过代理服务器使用 Anthropic Claude Code CLI',
        },
        version: '1.0.0',
        supports: {
            translate: true,
            metadata: true,
            tmi: true
        }
    };

    const TOOL_ID = 'claude';
    const DEFAULT_PROXY_URL = 'http://localhost:19284';
    const MODEL_HINT = 'Default: claude-sonnet-4-5. Others: opus, haiku';

    const LANGUAGE_DATA = {
        'ko': { name: 'Korean', native: '한국어' },
        'en': { name: 'English', native: 'English' },
        'zh-CN': { name: 'Simplified Chinese', native: '简体中文' },
        'zh-TW': { name: 'Traditional Chinese', native: '繁體中文' },
        'ja': { name: 'Japanese', native: '日本語' },
        'hi': { name: 'Hindi', native: 'हिन्दी' },
        'es': { name: 'Spanish', native: 'Español' },
        'fr': { name: 'French', native: 'Français' },
        'ar': { name: 'Arabic', native: 'العربية' },
        'fa': { name: 'Persian', native: 'فارسی' },
        'de': { name: 'German', native: 'Deutsch' },
        'ru': { name: 'Russian', native: 'Русский' },
        'pt': { name: 'Portuguese', native: 'Português' },
        'bn': { name: 'Bengali', native: 'বাংলা' },
        'it': { name: 'Italian', native: 'Italiano' },
        'th': { name: 'Thai', native: 'ไทย' },
        'vi': { name: 'Vietnamese', native: 'Tiếng Việt' },
        'id': { name: 'Indonesian', native: 'Bahasa Indonesia' }
    };

    function getSetting(key, defaultValue = null) {
        return window.AIAddonManager?.getAddonSetting(ADDON_INFO.id, key, defaultValue) ?? defaultValue;
    }

    function setSetting(key, value) {
        if (window.AIAddonManager) {
            window.AIAddonManager.setAddonSetting(ADDON_INFO.id, key, value);
        }
    }

    function getProxyUrl() {
        return getSetting('proxy-url', DEFAULT_PROXY_URL) || DEFAULT_PROXY_URL;
    }

    function getSelectedModel() {
        return getSetting('model', '');
    }

    function getLangInfo(lang) {
        if (!lang) return LANGUAGE_DATA['en'];
        const shortLang = lang.split('-')[0].toLowerCase();
        return LANGUAGE_DATA[lang] || LANGUAGE_DATA[shortLang] || LANGUAGE_DATA['en'];
    }

    // ============================================
    // Prompt Builders
    // ============================================

    function buildTranslationPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;

        return `Translate these ${lineCount} lines of song lyrics to ${langInfo.name} (${langInfo.native}).

RULES:
- Output EXACTLY ${lineCount} lines, one translation per line
- Keep empty lines as empty
- Keep ♪ symbols and markers like [Chorus], (Yeah) as-is
- Do NOT add line numbers or prefixes
- Do NOT use JSON or code blocks
- Just output the translated lines, nothing else

INPUT:
${text}

OUTPUT (${lineCount} lines):`;
    }

    function buildPhoneticPrompt(text, lang) {
        const langInfo = getLangInfo(lang);
        const lineCount = text.split('\n').length;
        const isEnglish = lang === 'en';
        const scriptInstruction = isEnglish
            ? 'Use Latin alphabet only (romanization).'
            : `Use ${langInfo.native} script.`;

        return `Convert these ${lineCount} lines of lyrics to pronunciation for ${langInfo.name} speakers.
${scriptInstruction}

RULES:
- Output EXACTLY ${lineCount} lines, one pronunciation per line
- Keep empty lines as empty
- Keep ♪ symbols and markers like [Chorus], (Yeah) as-is
- Do NOT add line numbers or prefixes
- Do NOT use JSON or code blocks
- Just output the pronunciations, nothing else

INPUT:
${text}

OUTPUT (${lineCount} lines):`;
    }

    function buildMetadataPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);

        return `Translate the song title and artist name to ${langInfo.name} (${langInfo.native}).

**Input**:
- Title: ${title}
- Artist: ${artist}

**Output valid JSON**:
{
  "translatedTitle": "translated title",
  "translatedArtist": "translated artist",
  "romanizedTitle": "romanized in Latin alphabet",
  "romanizedArtist": "romanized in Latin alphabet"
}`;
    }

    function buildTMIPrompt(title, artist, lang) {
        const langInfo = getLangInfo(lang);

        return `You are a music knowledge expert. Generate interesting facts and trivia about the song "${title}" by "${artist}".

IMPORTANT: The output MUST be in ${langInfo.name} (${langInfo.native}).

**Output JSON Structure**:
{
  "track": {
    "description": "2-3 sentence description in ${langInfo.native}",
    "trivia": [
      "Fact 1 in ${langInfo.native}",
      "Fact 2 in ${langInfo.native}",
      "Fact 3 in ${langInfo.native}"
    ],
    "sources": {
      "verified": [],
      "related": [],
      "other": []
    },
    "reliability": {
      "confidence": "medium",
      "has_verified_sources": false,
      "verified_source_count": 0,
      "related_source_count": 0,
      "total_source_count": 0
    }
  }
}

**Rules**:
1. Write in ${langInfo.native}
2. Include 3-5 interesting facts in the trivia array
3. Do NOT use markdown code blocks`;
    }

    // ============================================
    // API Functions
    // ============================================

    async function checkProxyHealth() {
        const proxyUrl = getProxyUrl();
        try {
            const response = await fetch(`${proxyUrl}/health`, { timeout: 5000 });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return await response.json();
        } catch (e) {
            throw new Error(`Proxy server not running at ${proxyUrl}. Start with: cd cli-proxy && npm start`);
        }
    }

    async function callProxy(prompt, maxRetries = 2) {
        const proxyUrl = getProxyUrl();
        const model = getSelectedModel();
        let lastError = null;

        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                const response = await fetch(`${proxyUrl}/generate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tool: TOOL_ID,
                        model,
                        prompt,
                        timeout: 120000
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.error || `HTTP ${response.status}`);
                }

                const data = await response.json();
                if (!data.success || !data.result) {
                    throw new Error(data.error || 'Empty response from CLI');
                }

                return data.result;

            } catch (e) {
                lastError = e;
                console.warn(`[Claude Code CLI] Attempt ${attempt + 1} failed:`, e.message);

                if (e.message.includes('not running') || e.message.includes('ECONNREFUSED')) {
                    throw new Error(`[Claude Code CLI] Server not running. Start with: cd cli-proxy && npm start`);
                }

                if (attempt < maxRetries - 1) {
                    await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
                }
            }
        }

        throw lastError || new Error('[Claude Code CLI] All retries exhausted');
    }

    function parseTextLines(text, expectedLineCount) {
        let cleaned = text.replace(/```[a-z]*\s*/gi, '').replace(/```\s*/g, '').trim();
        const lines = cleaned.split('\n');

        if (lines.length === expectedLineCount) {
            return lines;
        }

        if (lines.length > expectedLineCount) {
            return lines.slice(-expectedLineCount);
        }

        while (lines.length < expectedLineCount) {
            lines.push('');
        }

        return lines;
    }

    function extractJSON(text) {
        let cleaned = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

        try {
            return JSON.parse(cleaned);
        } catch {
            const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    return JSON.parse(jsonMatch[0]);
                } catch { }
            }
        }
        return null;
    }

    // ============================================
    // Addon Implementation
    // ============================================

    const ClaudeCodeAddon = {
        ...ADDON_INFO,

        async init() {
            console.log(`[Claude Code CLI] Initialized (v${ADDON_INFO.version})`);
        },

        async testConnection() {
            const health = await checkProxyHealth();

            if (!health.tools?.[TOOL_ID]?.available) {
                throw new Error(`Claude Code CLI is not available. Make sure it's installed.`);
            }

            await callProxy('Say "OK" if you receive this.');
        },

        getSettingsUI() {
            const React = Spicetify.React;
            const { useState, useCallback } = React;

            return function ClaudeCodeSettings() {
                const [proxyUrl, setProxyUrl] = useState(getSetting('proxy-url', DEFAULT_PROXY_URL));
                const [selectedModel, setSelectedModel] = useState(getSetting('model', ''));
                const [testStatus, setTestStatus] = useState('');

                const handleProxyUrlChange = useCallback((e) => {
                    const value = e.target.value;
                    setProxyUrl(value);
                    setSetting('proxy-url', value);
                }, []);

                const handleModelChange = useCallback((e) => {
                    const value = e.target.value;
                    setSelectedModel(value);
                    setSetting('model', value);
                }, []);

                const handleTest = useCallback(async () => {
                    setTestStatus('Testing...');
                    try {
                        await ClaudeCodeAddon.testConnection();
                        setTestStatus('✓ Connection successful!');
                    } catch (e) {
                        setTestStatus(`✗ ${e.message}`);
                    }
                }, []);

                return React.createElement('div', { className: 'ai-addon-settings' },
                    React.createElement('div', {
                        className: 'ai-addon-notice',
                        style: {
                            padding: '12px',
                            marginBottom: '16px',
                            backgroundColor: 'rgba(255, 255, 255, 0.05)',
                            borderRadius: '4px',
                            fontSize: '12px'
                        }
                    },
                        React.createElement('strong', null, 'Setup Required:'),
                        React.createElement('br'),
                        React.createElement('code', { style: { fontSize: '11px' } },
                            'cd ~/.config/spicetify/cli-proxy && npm install && npm start')
                    ),

                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Proxy Server URL'),
                        React.createElement('input', {
                            type: 'text',
                            value: proxyUrl,
                            onChange: handleProxyUrlChange,
                            placeholder: DEFAULT_PROXY_URL
                        }),
                        React.createElement('small', null, 'Default: http://localhost:19284')
                    ),

                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('label', null, 'Model'),
                        React.createElement('input', {
                            type: 'text',
                            value: selectedModel,
                            onChange: handleModelChange,
                            placeholder: 'Leave empty for default'
                        }),
                        React.createElement('small', null, MODEL_HINT)
                    ),

                    React.createElement('div', { className: 'ai-addon-setting' },
                        React.createElement('button', {
                            onClick: handleTest,
                            className: 'ai-addon-btn-primary'
                        }, 'Test Connection'),
                        testStatus && React.createElement('span', {
                            className: `ai-addon-test-status ${testStatus.startsWith('✓') ? 'success' : testStatus.startsWith('✗') ? 'error' : ''}`
                        }, testStatus)
                    )
                );
            };
        },

        async translateLyrics({ text, lang, wantSmartPhonetic }) {
            if (!text?.trim()) {
                throw new Error('No text provided');
            }

            const expectedLineCount = text.split('\n').length;
            const prompt = wantSmartPhonetic
                ? buildPhoneticPrompt(text, lang)
                : buildTranslationPrompt(text, lang);

            const rawResponse = await callProxy(prompt);
            const lines = parseTextLines(rawResponse, expectedLineCount);

            if (wantSmartPhonetic) {
                return { phonetic: lines };
            } else {
                return { translation: lines };
            }
        },

        async translateMetadata({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildMetadataPrompt(title, artist, lang);
            const rawResponse = await callProxy(prompt);
            const result = extractJSON(rawResponse);

            return {
                translated: {
                    title: result?.translatedTitle || title,
                    artist: result?.translatedArtist || artist
                },
                romanized: {
                    title: result?.romanizedTitle || title,
                    artist: result?.romanizedArtist || artist
                }
            };
        },

        async generateTMI({ title, artist, lang }) {
            if (!title || !artist) {
                throw new Error('Title and artist are required');
            }

            const prompt = buildTMIPrompt(title, artist, lang);
            const rawResponse = await callProxy(prompt);
            return extractJSON(rawResponse);
        }
    };

    const registerAddon = () => {
        if (window.AIAddonManager) {
            window.AIAddonManager.register(ClaudeCodeAddon);
        } else {
            setTimeout(registerAddon, 100);
        }
    };

    registerAddon();

    console.log('[Claude Code CLI] Module loaded');
})();
