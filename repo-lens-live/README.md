# RepoLens Documentation Package

These documents define the live-preview version of Codebase Archaeologist. Read them before coding. They supersede the earlier static-analysis-only documents.

## Build order

1. Implement the shared types and repository validation.
2. Build a preview session for one verified React/Next/Vite sample repository.
3. Add status, logs, expiry, and failure handling.
4. Add route/component/source analysis.
5. Add the architecture panel beside the preview.
6. Add grounded GPT-5.6 tracing.
7. Add tests, README setup instructions, and the three-minute demo.

## Important safety boundary

Do not run arbitrary GitHub code in the main application process. Use an isolated runner with no secrets, allow-listed commands, resource limits, and automatic cleanup. If a cloud sandbox is not available, keep the live preview limited to a verified sample repository for the hackathon demo.
