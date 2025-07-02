# RunSafe

## 1. Project Overview

**Node-based scripts are deprecated. Long live Bun 🥐**

RunSafe is a CLI tool for safely applying AI-generated **epics** (markdown files describing file edits). It provides a structured, human-in-the-loop workflow so you can review and control every change before it touches your codebase. Think of it as a guardrail around AI-assisted development.

Why RunSafe?

- ✅ **Safety first** – atomic mode and cooldown checks keep runaway edits from damaging your repo.
- ✅ **Transparency** – runtime logs and doctor commands show exactly what happened.
- ✅ **Flexibility** – mix AI help with manual steps and keep ownership of your code.

RunSafe fits into any workflow where AI suggests code changes but a developer wants the final say.

## 2. Installation

```bash
# Clone the repo and install dependencies
git clone <REPO-URL>
cd RunSafe
curl -fsSL https://bun.sh/install | bash
bun install
```

Node 18+ is recommended. The `runsafe` binary is installed locally but we will use the `uado` prefix in the examples below.

## 3. Quickstart

Create a very small epic file named `epic-001.md`:

```markdown
# Epic 001

## Summary
Add a greeting to `hello.txt`.

## File Edits
hello.txt
insert-after
Hello, world!
with
Welcome to RunSafe!
```

Now run:

```bash
# Apply the edits in dry-run mode first
uado apply epic-001.md --dry-run

# If it looks good, apply for real
uado apply epic-001.md

# Validate the same epic
uado validate epic-001.md
```

## 4. CLI Commands and Flags

- `uado apply <file>` – apply all file edits from an epic.
- `uado validate <file>` – check an epic for structural issues. `--council` asks an AI review agent for a second opinion.
- `uado doctor` – print a health summary of recent runs.

Common flags:

| Flag | Purpose |
|------|---------|
| `--summary` | Only output the final summary. |
| `--silent`  | Suppress logs except for errors. |
| `--json`    | Emit machine‑readable JSON. |
| `--dry-run` | Preview edits without writing files. |

Use `--json` or `--summary` if you need quiet output for scripts.

## 5. Typical Workflow

1. **Validate first.** `uado validate my-epic.md` checks JSON structure and optional council feedback.
2. **Dry run.** `uado apply my-epic.md --dry-run` shows the diff so you can review it.
3. **Apply.** Run `uado apply my-epic.md` to modify files.
4. **Diagnose.** If something fails, `uado doctor` reads `.uado/runtime.json` and displays cooldown status or errors.

Use `--summary` when you only care about the high-level result. Use `--json` when another tool needs to parse the output.

Logs appear in real time. Errors or cooldown messages will show in red with helpful tips.

## 6. Error Handling & Exit Codes

RunSafe exits with code `1` whenever an apply or validate command fails. Structured error codes help you react programmatically:

| Code | Meaning |
|------|---------|
| `E001` | Invalid epic file or schema. |
| `E002` | File read failure. |
| `E003` | File write failure. |
| `E004` | Unsupported edit type. |
| `E005` | Cooldown active. |
| `E006` | Validation rejected by council. |

Example output:

```bash
❌ [E002] Epic file not found
💡 Tip: Check the file path and ensure the epic file exists.
```

## 7. Runtime Logging & Health Diagnostics

Every run appends a structured entry to `.uado/runtime.json`. Each entry records:

- timestamp
- command name
- cooldown reason (if any)
- error messages

`uado doctor` reads this log and prints a table of recent runs so you can monitor cooldowns or repeated failures. The log is stored locally inside `.uado` and never sent anywhere.

## 8. Beginner Tips

- **Epic** – a markdown file describing edits. It contains a summary and a "File Edits" section.
- **Cooldown** – a short waiting period triggered after repeated failures or high memory usage.
- **Atomic mode** – `uado apply --atomic` will roll back all changes if any write fails.
- ⚠️ Always start with `--dry-run` when trying a new epic.
- 💡 Use `--json` to integrate RunSafe with other automation.

## 9. Contribution Guide

We love contributions! To run tests:

```bash
bun test
```

Project layout:

- `src/` – command and utility source files
- `bin/` – the CLI entry point
- `__tests__/` – Jest test suite

Feel free to submit new epics or features via pull request.

## 10. Credits & Vision

RunSafe was built through an AI + human collaboration with the goal of **democratizing safe software creation**. Fork it, remix it, and adapt the ideas for your own team. Together we can make AI‑assisted development safe and transparent for everyone.

