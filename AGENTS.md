This is the project's AGENTS.md

# Notes
- Gemini model names drift and invalid aliases cause 404s; check https://ai.google.dev/gemini-api/docs/models before changing hardcoded model IDs.
- Routine Convex diagnostic logs are gated by `CONVEX_DEBUG_LOGS=true`; keep `console.error` useful for provider failures and avoid noisy lifecycle logs in production.
