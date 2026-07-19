# Codebase Archaeologist: Project Plan

## The pitch, in one line

Point it at any unfamiliar GitHub repo, and it hands you back what a senior engineer would give you after a full day of reading the code: a map of how it's built, an explanation of how a specific feature actually works, and a warning about which files are dangerous to touch.

## Why this matters (the problem)

Every developer has felt this: you join a new team, or you want to contribute to an open source project, or you inherit a codebase from someone who left, and you're staring at hundreds of files with no idea where anything is. Onboarding a new engineer to a mid-size codebase typically takes one to two weeks before they can make a confident change. Most of that time is spent doing manual archaeology: grepping for keywords, clicking through files, asking teammates "wait, where does this actually happen?"

Codebase Archaeologist compresses that process from days into minutes, using Codex and GPT-5.6 to do the reading and reasoning a human would normally do by hand.

## What we are building (2 day scope)

Given the time we have, we are deliberately scoping this to one thing done well, rather than five things done shakily. The core loop:

1. **Paste a GitHub repo URL.**
2. **See the architecture.** A visual map of the codebase: which files exist, which ones import or depend on which others, and how connected each file is to the rest of the system.
3. **Ask about a feature.** Type something like "how does login work?" and get back a step by step trace: which file it starts in, which functions it passes through, and where it ends up. Highlighted directly on the map.
4. **See what's risky.** Files that are highly connected, frequently changed, or structurally fragile are flagged with a plain English reason why.
5. **Ask where to make a change.** Describe a task ("add rate limiting to the API") and get back a short list of specific files to touch, with reasoning tied to the actual structure of the repo, not generic advice.

We are cutting anything that doesn't serve this loop: no user accounts, no saved history, no support for every programming language (we are focusing on JavaScript, TypeScript, and Python, which covers the large majority of repos judges are likely to test us on), no git history deep-dive beyond simple commit frequency.

## The pipeline, explained simply

Think of it as four stages, each one handing its output to the next:

**Stage 1: Fetching.** When someone pastes a repo URL, we do not do a full git clone (this is slow and doesn't fit well inside Vercel's serverless functions, which have limited time and disk space per request). Instead, we pull the repo's file listing and contents directly through the GitHub API. This is faster, works well within Vercel's constraints, and avoids needing any persistent server.

**Stage 2: Reading.** We walk through the relevant source files and extract two things from each one: what it imports (its dependencies) and what functions it defines. This gives us the raw material for a dependency graph, files as nodes, import relationships as connections between them.

**Stage 3: Understanding.** This is where Codex and GPT-5.6 do the real work, and where we differentiate from a plain dependency graph tool (there are several of those already; a static graph alone will not impress judges). We use the model in two ways:
   - **Tracing**: given a plain English description of a feature, the model reads the relevant files (guided by the dependency graph, so it doesn't need to read the whole repo) and explains, step by step, how that feature flows through the code, citing real file and function names at every step.
   - **Risk judgment**: for the files that are structurally central (many other files depend on them) or change often, the model reads the code and explains, in plain language, why that file is risky to touch.

**Stage 4: Presenting.** Everything comes back to a single visual interface: an interactive map of the codebase where risk is shown by color, feature traces are shown as a highlighted path, and change suggestions point directly at specific files with real explanations underneath.

## Why this is a strong Codex/GPT-5.6 story

Judges are scoring us on how thoroughly and skillfully we use Codex, not just on whether the app works. Our strongest moments to demonstrate this:

- The parsing and graph-building logic is exactly the kind of unglamorous, detail-heavy work Codex is well suited to generate quickly and correctly, freeing our time for the reasoning layer.
- The feature tracing and risk explanation steps are not just "summarize this file," they require the model to reason across multiple files using the graph structure we hand it, which is a genuinely harder and more interesting use of GPT-5.6 than most repo-summary tools attempt.
- Our demo video will explicitly show a before and after: a developer staring at an unfamiliar repo, versus getting a clear answer in under a minute.

## Two day build plan

**Day 1: Foundation and core pipeline**
- Morning: repo scaffold live on GitHub, deployed to Vercel with a working "hello world" so the pipeline (push to deploy) is proven early.
- Midday through evening: repo fetching and dependency graph building working end to end against two or three real test repos. Basic graph visualization rendering on screen, even unstyled.
- End of day 1 goal: paste a URL, see a real dependency graph on screen.

**Day 2: Intelligence layer, polish, and submission**
- Morning: feature tracing and risk scoring wired up and working against the test repos.
- Midday: change suggestion feature working, visual polish on the interface (this matters for the "design" judging criterion), color coded risk overlay.
- Afternoon: full run through on a fresh, real world repo the model hasn't seen tested before, to make sure the demo will actually work live.
- Evening: record the demo video, write the project description, prepare the README, gather the Codex feedback session ID, submit.

We are building buffer time into the afternoon of day 2 deliberately. Hackathon projects almost always break during the "make it pretty" phase, and having room to fix that without rushing the submission is more valuable than squeezing in one more feature.

## Deployment approach

The entire app is a single Next.js project deployed to Vercel. This keeps things simple for a two day build: one repository, automatic deployment on every push, and serverless functions handling the API routes (fetching repos, building graphs, calling GPT-5.6). No separate backend server to manage, no infrastructure to configure. The tradeoff we are consciously accepting is a cap on how large a repo we can analyze in one request, since serverless functions have execution time limits, so we are capping analysis at a reasonable number of files and being upfront about that limit in the product itself, rather than pretending it doesn't exist.

## Business model

A hackathon prototype should still make a credible case for a real product. Here is how Codebase Archaeologist could actually work as a business.

### Who it's for

The primary audience is software teams, not individual hobbyists. Specifically:
- **Engineering teams onboarding new hires**, who currently spend a week or more getting a new engineer productive.
- **Open source maintainers**, who want to lower the barrier for new contributors to understand the codebase before submitting a pull request.
- **Engineering managers and tech leads doing due diligence**, for example evaluating a codebase during an acquisition, or before agreeing to take over ownership of a legacy system.
- **Freelancers and contractors**, who are dropped into unfamiliar codebases regularly and need to get productive fast.

### How it makes money

**Freemium with usage based upgrades.** Public repository analysis stays free, since this builds goodwill with the open source community and drives organic growth. Private repository analysis, larger repos, and deeper features (saved maps, team sharing, integration with pull requests) sit behind a paid tier.

- **Free tier**: public repos only, capped repo size, no saved history.
- **Team tier** (monthly per seat): private repos, larger repo size limits, saved and shareable maps, integration with the team's GitHub organization.
- **Enterprise tier**: on-premise or private cloud deployment for companies that cannot send proprietary code to a third party API, custom repo size limits, single sign on, and dedicated support.

### Why teams would actually pay

The clearest return on investment is onboarding time. If a new engineer normally takes two weeks to become productive, and this tool credibly cuts that down even by a few days, the cost of a team subscription is trivial compared to the cost of a week of a salaried engineer's time sitting mostly idle while they read code. This is an easy number for a manager to justify internally, which matters a lot for actual sales.

A second angle is risk reduction: the risk scoring feature could evolve into something engineering leadership genuinely cares about, an ongoing signal about which parts of the codebase are fragile, useful for planning refactors or flagging areas that need more test coverage, independent of the onboarding use case.

### Path to a real product

If this were to continue past the hackathon, the natural next steps would be a GitHub App integration (so it can run automatically on repos a team already owns, rather than requiring a manual paste each time), support for more languages, and a persistent workspace so teams can build up institutional knowledge about their own codebase over time rather than re-analyzing from scratch on every visit.

## What we are explicitly not trying to be

We are not trying to replace code review tools, static analysis linters, or full IDE plugins. We are solving one specific moment: the first hour someone spends trying to understand a codebase they did not write. Staying focused on that moment, rather than trying to be a general purpose code intelligence platform, is what will make the demo feel sharp instead of scattered.
