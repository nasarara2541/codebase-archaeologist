# RepoLens — PRD

## Target user

Developers onboarding to an unfamiliar frontend codebase, reviewing an open-source project, or taking over a web application.

## Core user flow

1. The user pastes a public GitHub repository URL.
2. The system validates that the repository is supported.
3. The system fetches the source into an isolated temporary workspace.
4. The system installs dependencies and starts the project with a controlled command.
5. The user sees the application in a live preview panel.
6. The system displays detected routes, pages, components, and technologies.
7. The user selects a route or asks a feature question.
8. The system returns the responsible files and functions and highlights them in the architecture view.

## Functional requirements

- Validate GitHub URLs and supported frameworks.
- Never run repository commands directly on the host environment.
- Enforce time, memory, file-size, and process limits.
- Terminate preview processes after a timeout.
- Detect common commands from `package.json`.
- Show useful progress and errors for install, build, and runtime failures.
- Extract routes, imports, components, and likely API calls.
- Ground every AI answer in files that exist in the repository.
- Make the live preview and code explanation understandable in a three-minute demo.

## Definition of done

Using the documented sample repository, a new user can go from GitHub URL to live preview and code trace without manually configuring the project.

## Out of scope

- Running arbitrary backend services
- Production deployment
- Private repositories
- Automatic code changes or pull requests
- Full support for every frontend framework
