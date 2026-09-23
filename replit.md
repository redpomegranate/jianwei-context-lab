# 见微 · Context Lab

中文、移动端优先的私人社会情境认知训练工具。区分事实与推断，先记录自己的解释，再审阅 AI 候选，提交可观察预测并回填结果与复盘。

## Run & Operate
- `pnpm --filter @workspace/api-server run dev`
- `pnpm --filter @workspace/context-lab run dev`
- `pnpm run typecheck`
- `pnpm --filter @workspace/api-server run test`
- `pnpm --filter @workspace/api-spec run codegen`

## Architecture and boundaries
- React/Vite frontend, shared Express API, OpenAPI-generated client and validation.
- Supabase Auth and external Supabase PostgreSQL are explicitly user-selected. Do not substitute the scaffold's Replit database or run Drizzle push against it.
- Dedicated Supabase project `jianwei-context-lab` in Singapore; public connection configuration lives in the API config. Never use the unrelated `cornertable-ledger` project.
- Migrations in `supabase/migrations` are applied via Supabase MCP during development. Runtime uses user-scoped REST/RPC, not MCP. External schema is not migrated by Replit Publish.
- AI uses the DeepSeek API through an OpenAI-compatible client (`DEEPSEEK_API_KEY`, default model `deepseek-flash`). Private material leaves the app only after explicit AI consent. Candidates never directly confirm user decisions.
- Prediction snapshots are locked. Unknown outcomes are distinct from not-occurred outcomes. No intelligence ranking.
- Four classical corpora in `data/classics` are archival downloads, not runtime retrieval. Read source manifests for licensing before reuse.

## Production readiness
Current status: **NOT_READY** for public production. See `docs/backend-constraints.md` and `docs/launch-blockers.md`.
MVP scope does not waive the production Harness gates in `.agents/skills/harness-engineering`.
No deployment has been performed. User's intended later deployment target is Vercel.