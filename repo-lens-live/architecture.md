# RepoLens — Architecture

## Technology choices

- Next.js and TypeScript for the control-plane web application
- React Flow for architecture visualization
- GitHub REST API for public repository files
- A sandbox runner for temporary isolated preview sessions
- Tree-sitter or lightweight parsers for JavaScript/TypeScript analysis
- GPT-5.6 for grounded code explanations

## System flow

```text
GitHub URL
   |
   v
Repository validator
   |
   v
Isolated temporary workspace
   |
   +--> package detection --> install --> start --> preview URL
   |
   v
Source scanner and route/component extractor
   |
   v
Dependency graph and code index
   |
   +--> Live preview panel
   +--> Architecture panel
   +--> GPT-5.6 trace endpoint
```

## Components

### Control application

Handles the user interface, session state, repository validation, analysis requests, and preview status.

### Preview runner

Runs only allow-listed frontend commands inside an isolated temporary environment. It returns a preview URL and logs without exposing host credentials or unrestricted networking.

### Repository analyzer

Reads source files, identifies routes and components, extracts relative imports, and builds the code index used for tracing.

### Trace service

Receives a user question plus relevant repository context and asks GPT-5.6 for strict structured output containing real file and function citations.

## Practical hackathon implementation

For the demo, support one verified sample repository and one-click preview startup. If a fully isolated cloud runner is unavailable, use a local sandbox process with strict allow-lists and document the limitation rather than claiming arbitrary repository execution is safe.

## Security requirements

- Never execute untrusted code in the main web process.
- Do not pass secrets or environment variables into the preview.
- Allow only known package-manager and start commands.
- Apply timeouts and kill all child processes when a session ends.
- Limit repository size and dependency installation time.
