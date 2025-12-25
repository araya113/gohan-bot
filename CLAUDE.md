# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm start          # Run the bot (ts-node with ESM loader)
npm run typecheck  # Type check with tsc --noEmit
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
npm run format:check  # Check formatting without writing
```

## Architecture

gohan-bot is a Discord bot (discord.js v14) that asks users about their meals at scheduled times and tracks their food history in MySQL. It also provides nutrition analysis using OpenAI.

### Core Flow

1. **Entry point** (`src/index.ts`): Initializes Discord client, MySQL connection, and sets up scheduled meal questions
2. **Scheduled meal questions** (`src/scheduled/meal-question.ts`): Uses node-cron to post meal questions at configured times (morning/noon/night). Tracks sent message IDs to detect replies
3. **Meal reply handling**: When users reply to a meal question message, the bot saves their response to `gohan_historys` table via `insertGohanHistory()`

### Commands

- `!るなさん` → Simple reply (runa.ts)
- `!history` → Shows user's last 10 meal entries from DB (history.ts)
- `!nutrition` → Analyzes last 7 days of meals using OpenAI gpt-4o-mini for nutritional advice (nutrition.ts)

### Configuration

All configuration via environment variables (see `env.example`):
- `TOKEN`: Discord bot token
- `MEAL_QUESTION_*`: Cron schedule, timezone, channel/role names, message texts
- `MYSQL_*`: Database connection
- `OPENAI_API_KEY`: For nutrition analysis

Config loading in `src/config.ts` includes fallback parsing for malformed .env files.

### Database

Single table `gohan_historys` with columns: `id`, `user_id` (Discord ID), `gohan` (meal text), `create_at` (timestamp).

## Code Style

- TypeScript with ES modules (`"type": "module"`)
- Uses `.js` extensions in imports (NodeNext module resolution)
- Prettier + ESLint for formatting
- Japanese comments and user-facing messages
