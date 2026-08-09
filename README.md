# TikTok MCP

Self-hosted TikTok automation for AI agents. Connect accounts, post and schedule videos, manage profiles, and track analytics through one local MCP server.

- Runs the browser and automation on your device
- Keeps TikTok sessions, media, browser profiles, and analytics local
- Works with any MCP-compatible agent or CLI
- No API keys or payments

## Quick start

You need Node.js 18.18+ and Chrome, Edge, or Brave. Add this server to your agent's MCP configuration:

```json
{
  "mcpServers": {
    "tiktok": {
      "command": "npx",
      "args": ["-y", "github:0xArtex/tiktok-mcp"]
    }
  }
}
```

Restart the agent, then ask:

```text
Connect my TikTok account as my-brand.
```

The MCP returns a shareable `connect_url`. Send it to the human who owns the account; they open it, scan the live TikTok QR, and confirm login while the agent polls the connection. This works when the agent runs on a different VPS or machine.

The login browser and persistent profile remain on the agent machine. Only the short-lived, rotating QR image is relayed through `tiktok.palmyr.ai`; cookies and account sessions never leave the local runtime. State is stored under `~/.tiktok-mcp`.

> **Location matters:** the VPS/browser exit and the human's phone should be in the same country or a nearby region, ideally the account's usual region. TikTok may refuse geographically distant QR logins. If they differ, align the VPS/browser exit first; otherwise the human can temporarily use an allowed VPN/proxy while scanning. Keep the runtime exit stable afterward and follow TikTok's Terms.

If no installed browser is detected, install Playwright's Chromium once:

```bash
npx playwright install chromium
```

On a Linux VPS without a desktop display, install Xvfb so TikTok receives a headed browser while the human uses the remote link:

```bash
sudo apt-get install -y xvfb
```

## Example prompts

```text
Post launch.mp4 with the caption "We finally shipped."

Schedule demo.mp4 for tomorrow at 6 PM.

Show which of my recent videos are still gaining views.

Analyze the strongest hooks from my fitness posts.

Update my bio to "Building useful things in public."
```

Local paths are supported by `tiktok_post` (`video_path`) and `tiktok_update_avatar` (`image_path`). Public media URLs and base64 inputs also work.

## Tools

| Tool | What it does |
|---|---|
| `tiktok_connect` | Return a shareable QR login link |
| `tiktok_connect_status` | Check whether login completed |
| `tiktok_accounts` | List local accounts and session state |
| `tiktok_post` | Post or natively schedule a video |
| `tiktok_operation_status` | Poll an asynchronous browser job |
| `tiktok_follow` | Follow a user |
| `tiktok_like` | Like a video |
| `tiktok_delete` | Delete a video |
| `tiktok_update_profile` | Update a display name or bio |
| `tiktok_update_avatar` | Update a profile image |
| `tiktok_analytics` | Collect and save post metrics locally |
| `tiktok_series` | Read saved performance history and growth |
| `tiktok_hooks` | Analyze caption hooks from local history |
| `tiktok_niches` | List suggested hook-analysis niches |
| `tiktok_scheduled` | List scheduled posts recorded locally |
| `tiktok_cancel_scheduled` | Cancel a scheduled post |

## Hosted HTTP API

Don't want to run the browser/runtime yourself? Use the hosted x402 API at `https://tiktok.palmyr.ai/v1` with AgentCash, Agentic Market, or any x402 client. It is an HTTP API, not a remote MCP server.

```bash
npx agentcash@latest add https://tiktok.palmyr.ai
npx agentcash@latest discover https://tiktok.palmyr.ai
npx agentcash@latest check https://tiktok.palmyr.ai/v1/post
```

AgentCash handles the x402 challenge and USDC payment:

```bash
npx agentcash@latest fetch https://tiktok.palmyr.ai/v1/connect \
  -m POST \
  -b '{"account_id":"my-brand"}'
```

- [Hosted API skill](https://tiktok.palmyr.ai/skill.md)
- [OpenAPI](https://tiktok.palmyr.ai/openapi.json)
- [x402 discovery](https://tiktok.palmyr.ai/.well-known/x402)
- [Agentic Market](https://agentic.market/services/tiktok-palmyr-ai)

The paid hosted automation API is optional. The local MCP uses only its free, ephemeral QR relay during account connection; all TikTok browser actions and session data remain local.

## Local configuration

| Setting | Default | Description |
|---|---|---|
| `TIKTOK_MCP_DATA_DIR` | `~/.tiktok-mcp` | Local profiles, job state, and analytics |
| `TIKTOK_BROWSER_PATH` | auto-detected | Chrome-family browser executable |
| `TIKTOK_HEADLESS` | headed on desktop | Set `true` for headless operation |
| `TIKTOK_CONNECT_RELAY_URL` | `https://tiktok.palmyr.ai` | Ephemeral QR hand-off origin |

Equivalent CLI flags are `--data-dir`, `--browser-path`, and `--headless`.

## Development

```bash
git clone https://github.com/0xArtex/tiktok-mcp.git
cd tiktok-mcp
npm install
npm test
```

## License

MIT
