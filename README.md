# TikTok MCP

Post, schedule, manage, and analyze TikTok accounts from any MCP-compatible AI agent.

- Connect accounts with a secure QR login
- Post videos now or schedule them for later
- Follow users, like videos, and manage profiles
- Track post analytics, growth, and content hooks
- No API keys or subscriptions

## Quick start

Add this to your MCP configuration:

```json
{
  "mcpServers": {
    "tiktok": {
      "command": "npx",
      "args": ["-y", "@palmyr/tiktok-mcp@latest"]
    }
  }
}
```

Restart your agent, then ask:

```text
Connect my TikTok account.
```

The agent will give you a QR login link. Open it, scan the code with the TikTok app, and the account is ready to use.

## Example prompts

```text
Post launch.mp4 with the caption "We finally shipped."

Schedule demo.mp4 for tomorrow at 6 PM.

Show which of my recent videos are still gaining views.

Analyze the strongest hooks from my fitness posts.

Update my bio to "Building useful things in public."
```

When the MCP runs locally over stdio, `tiktok_post` accepts a local `video_path` and `tiktok_update_avatar` accepts a local `image_path`. Public URLs work in both local and hosted mode.

## Tools

| Tool | What it does |
|---|---|
| `tiktok_connect` | Start a QR login |
| `tiktok_connect_status` | Check whether login completed |
| `tiktok_accounts` | List connected accounts and session health |
| `tiktok_post` | Post or schedule a video |
| `tiktok_operation_status` | Poll an asynchronous action |
| `tiktok_follow` | Follow a user |
| `tiktok_like` | Like a video |
| `tiktok_delete` | Delete a video |
| `tiktok_update_profile` | Update a display name or bio |
| `tiktok_update_avatar` | Update a profile image |
| `tiktok_analytics` | Fetch post performance metrics |
| `tiktok_series` | Read saved performance history and growth |
| `tiktok_hooks` | Analyze caption hooks for an account or niche |
| `tiktok_niches` | List available hook-analysis niches |
| `tiktok_scheduled` | List scheduled posts |
| `tiktok_cancel_scheduled` | Cancel a scheduled post |

## Hosted

The same server can run as a remote Streamable HTTP MCP:

```bash
npx -y @palmyr/tiktok-mcp@latest --http --port 3000
```

The MCP endpoint is available at `http://localhost:3000/mcp`. The public hosted endpoint will be added here when its DNS and deployment are live.

Hosted actions are paid per request through x402. There are no API keys or subscriptions. Compatible agents handle the payment challenge automatically.

To make the hosted API available as an agent skill:

```bash
npx agentcash@latest add https://your-tiktok-api.example
```

You can also discover and call the HTTP endpoints directly:

```bash
npx agentcash@latest discover https://your-tiktok-api.example
```

## Configuration

| Setting | Default | Description |
|---|---|---|
| `TIKTOK_API_URL` | Hosted API | Override the TikTok action API origin |
| `PORT` | `3000` | Port used with `--http` |

Run the MCP over stdio:

```bash
npx -y @palmyr/tiktok-mcp@latest
```

## Development

```bash
git clone https://github.com/0xArtex/tiktok-mcp.git
cd tiktok-mcp
npm install
npm test
```

## License

MIT
