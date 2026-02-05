/**
 * ivLyrics CLI Proxy Server
 * CLI AI 도구들 (Antigravity, Claude Code, Codex CLI 등)을 HTTP API로 제공
 *
 * 사용법:
 *   npm install
 *   npm start
 *
 * 기본 포트: 19284
 */

const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const app = express();

const PORT = process.env.PORT || 19284;

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// ============================================
// CLI Tool Configurations
// ============================================

const CLI_TOOLS = {
    // Anthropic Claude Code
    claude: {
        command: 'claude',
        checkCommand: 'claude --version',
        defaultModel: 'claude-sonnet-4-5-20250514',
        buildArgs: (prompt, model, defaultModel) => {
            const useModel = model || defaultModel;
            const args = ['--print', '--dangerously-skip-permissions', prompt];
            if (useModel) args.unshift('--model', useModel);
            return args;
        },
        parseOutput: (stdout) => stdout.trim()
    },

    // OpenAI Codex CLI
    codex: {
        command: 'codex',
        checkCommand: 'codex --version',
        defaultModel: '',
        buildArgs: (prompt, model, defaultModel) => {
            const useModel = model || defaultModel;
            const args = ['exec', '--skip-git-repo-check', prompt];
            if (useModel) args.unshift('--config', `model="${useModel}"`);
            return args;
        },
        parseOutput: (stdout) => stdout.trim()
    },

    // Gemini CLI
    gemini: {
        command: 'gemini',
        checkCommand: 'gemini --version',
        defaultModel: 'gemini-3-flash-preview',
        buildArgs: (prompt, model, defaultModel) => {
            const useModel = model || defaultModel;
            const args = ['-p', prompt];  // -p 플래그로 non-interactive 모드
            if (useModel) args.unshift('--model', useModel);
            return args;
        },
        parseOutput: (stdout) => stdout.trim()
    }
};

// ============================================
// Helper Functions
// ============================================

/**
 * CLI 도구 사용 가능 여부 확인
 */
function checkToolAvailable(toolId) {
    const tool = CLI_TOOLS[toolId];
    if (!tool) return { available: false, error: 'Unknown tool' };

    try {
        execSync(tool.checkCommand, { stdio: 'pipe', timeout: 5000 });
        return { available: true };
    } catch (e) {
        return { available: false, error: `${tool.command} not found or not configured` };
    }
}

/**
 * CLI 도구 실행
 */
function runCLI(toolId, prompt, model = '', timeout = 120000) {
    return new Promise((resolve, reject) => {
        const tool = CLI_TOOLS[toolId];
        if (!tool) {
            return reject(new Error(`Unknown tool: ${toolId}`));
        }

        const args = tool.buildArgs(prompt, model, tool.defaultModel);
        const actualModel = model || tool.defaultModel || 'default';

        // 전체 명령어 로그 (프롬프트는 축약)
        const promptPreview = prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt;
        const argsForLog = args.map(a => a === prompt ? `"${promptPreview}"` : a);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${toolId}] REQUEST`);
        console.log(`  Model: ${actualModel}`);
        console.log(`  Command: ${tool.command} ${argsForLog.join(' ')}`);
        console.log(`${'='.repeat(60)}`);

        const proc = spawn(tool.command, args, {
            stdio: ['ignore', 'pipe', 'pipe'],  // stdin을 ignore로 설정
            env: { ...process.env, NO_COLOR: '1' }  // 색상 코드 비활성화
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (data) => {
            stdout += data.toString();
        });

        proc.stderr.on('data', (data) => {
            stderr += data.toString();
        });

        proc.on('close', (code) => {
            if (code === 0) {
                const result = tool.parseOutput(stdout);
                console.log(`[${toolId}] SUCCESS - Response length: ${result.length} chars`);
                resolve(result);
            } else {
                console.log(`[${toolId}] FAILED - Exit code: ${code}`);
                reject(new Error(stderr || `Process exited with code ${code}`));
            }
        });

        proc.on('error', (err) => {
            reject(new Error(`Failed to start ${tool.command}: ${err.message}`));
        });

        // Timeout
        setTimeout(() => {
            proc.kill();
            reject(new Error(`Timeout after ${timeout}ms`));
        }, timeout);
    });
}

// ============================================
// API Endpoints
// ============================================

/**
 * 헬스 체크 & 사용 가능한 도구 목록
 */
app.get('/health', (req, res) => {
    const tools = {};
    for (const toolId of Object.keys(CLI_TOOLS)) {
        tools[toolId] = checkToolAvailable(toolId);
    }

    res.json({
        status: 'ok',
        version: '1.0.0',
        tools
    });
});

/**
 * 사용 가능한 도구 목록
 */
app.get('/tools', (req, res) => {
    const tools = [];
    for (const toolId of Object.keys(CLI_TOOLS)) {
        const status = checkToolAvailable(toolId);
        tools.push({
            id: toolId,
            name: CLI_TOOLS[toolId].command,
            available: status.available,
            error: status.error
        });
    }
    res.json({ tools });
});

/**
 * 특정 도구로 프롬프트 실행
 */
app.post('/generate', async (req, res) => {
    const { tool, model, prompt, timeout } = req.body;

    if (!tool || !prompt) {
        return res.status(400).json({ error: 'Missing tool or prompt' });
    }

    // 도구 사용 가능 여부 확인
    const toolStatus = checkToolAvailable(tool);
    if (!toolStatus.available) {
        return res.status(400).json({ error: toolStatus.error });
    }

    try {
        console.log(`[API] Generate request - tool: ${tool}, model: ${model || 'default'}, prompt length: ${prompt.length}`);
        const result = await runCLI(tool, prompt, model || '', timeout || 120000);
        res.json({
            success: true,
            result,
            tool,
            model: model || 'default'
        });
    } catch (e) {
        console.error(`[API] Error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

/**
 * OpenAI API 호환 엔드포인트 (선택적)
 */
app.post('/v1/chat/completions', async (req, res) => {
    const { model, messages } = req.body;

    // model을 tool로 매핑 (예: "antigravity", "claude", "codex")
    const tool = model?.split('/')[0] || 'claude';

    // 마지막 user 메시지 추출
    const lastUserMessage = messages?.filter(m => m.role === 'user').pop();
    const prompt = lastUserMessage?.content || '';

    if (!prompt) {
        return res.status(400).json({ error: 'No prompt provided' });
    }

    try {
        const result = await runCLI(tool, prompt);

        // OpenAI API 형식으로 응답
        res.json({
            id: `cli-${Date.now()}`,
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: tool,
            choices: [{
                index: 0,
                message: {
                    role: 'assistant',
                    content: result
                },
                finish_reason: 'stop'
            }],
            usage: {
                prompt_tokens: 0,
                completion_tokens: 0,
                total_tokens: 0
            }
        });
    } catch (e) {
        res.status(500).json({ error: { message: e.message } });
    }
});

// ============================================
// Start Server
// ============================================

app.listen(PORT, () => {
    console.log(`\n🚀 ivLyrics CLI Proxy Server`);
    console.log(`   Running on http://localhost:${PORT}`);
    console.log(`\n📋 Available endpoints:`);
    console.log(`   GET  /health   - Check server status and available tools`);
    console.log(`   GET  /tools    - List available CLI tools`);
    console.log(`   POST /generate - Generate text with a CLI tool`);
    console.log(`   POST /v1/chat/completions - OpenAI-compatible endpoint`);
    console.log(`\n🔧 Checking available tools...`);

    for (const toolId of Object.keys(CLI_TOOLS)) {
        const status = checkToolAvailable(toolId);
        const icon = status.available ? '✓' : '✗';
        console.log(`   ${icon} ${toolId}: ${status.available ? 'available' : status.error}`);
    }

    console.log(`\n`);
});
