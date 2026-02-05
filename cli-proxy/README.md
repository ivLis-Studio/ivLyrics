# ivLyrics CLI Proxy Server

로컬 CLI AI 도구들 (Claude Code, Codex, Gemini CLI)을 ivLyrics에서 사용할 수 있게 해주는 프록시 서버입니다.

## 지원 CLI 도구

| Tool | Command | Provider | Description |
|------|---------|----------|-------------|
| **Claude Code** | `claude` | Anthropic | Claude Pro/Max 구독자용 CLI |
| **Codex CLI** | `codex` | OpenAI | ChatGPT Pro 구독자용 CLI |
| **Gemini CLI** | `gemini` | Google | Google AI Pro/Ultra 구독자용 CLI |

## 설치

```bash
cd ~/.config/spicetify/cli-proxy
npm install
```

## 실행

```bash
npm start
```

서버가 `http://localhost:19284`에서 시작됩니다.

## 사용법

1. 프록시 서버를 실행합니다
2. Spotify에서 ivLyrics 설정으로 이동
3. AI Providers에서 원하는 CLI 도구를 활성화:
   - **Claude Code (CLI)** - Anthropic Claude Code
   - **Codex CLI (OpenAI)** - OpenAI Codex CLI
   - **Gemini CLI (Google)** - Google Gemini CLI

## API Endpoints

### GET /health
서버 상태 및 사용 가능한 도구 확인

```bash
curl http://localhost:19284/health
```

### GET /tools
사용 가능한 CLI 도구 목록

```bash
curl http://localhost:19284/tools
```

### POST /generate
텍스트 생성 요청

```bash
curl -X POST http://localhost:19284/generate \
  -H "Content-Type: application/json" \
  -d '{"tool": "claude", "prompt": "Hello, world!"}'
```

## 환경 변수

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `19284` | 서버 포트 |

## 문제 해결

### "Tool not found" 오류
해당 CLI 도구가 설치되어 있고 PATH에 있는지 확인하세요.

```bash
# Claude Code 설치 확인
claude --version

# Codex CLI 설치 확인
codex --version

# Gemini CLI 설치 확인
gemini --version
```

### 서버 연결 실패
프록시 서버가 실행 중인지 확인하세요.

```bash
curl http://localhost:19284/health
```
