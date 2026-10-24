# Code rules

These rules apply to every change in this repo, whether a person or an AI
agent makes it. They come from SecureEyes, where each one was learned the
hard way. When a rule and a habit disagree, the rule wins.

## 1. Small files and 90% test coverage

1. Keep every code file under 400 lines. That includes test files.
2. A file that grows past 400 lines is doing more than one job. Split it by
   responsibility, then test each piece on its own.
3. Keep test coverage at 90% of lines or more, always. New code arrives with
   its tests in the same commit, so coverage never dips and gets "fixed
   later".
4. Do not delete a test unless it is obsolete, meaning the behaviour it
   checks no longer exists. A failing test gets the code or the test fixed,
   never deleted to make the run green. The commit that removes a test says
   why it is obsolete.
5. Generated files and vendored third-party code are exempt from the line
   and coverage rules. Nothing else is, including "just this once".

To list the files over the limit:

```sh
git ls-files | grep -E '\.(dart|swift|kt|java|ts|tsx|js|jsx|py|go|rs)$' \
  | xargs wc -l | awk '$2 != "total" && $1 > 400' | sort -rn
```

## 2. Pure logic, thin wiring

1. Put real logic in pure modules: plain functions and types with no I/O, no
   UI framework and no platform calls. They take their inputs as arguments,
   so a unit test can call them directly.
2. Keep the parts that need a device, the network, the UI or app startup
   thin. They gather the inputs, call the pure code and apply the answer.
3. Test the wiring too. Most bugs that reach users live there, not in the
   logic: a stale value in a pushed screen, a spinner closed twice, a page
   that outlives the record it shows.
4. Shared domain logic lives in a package without the UI framework, so a
   server, a command-line tool or another app can use it. A test that scans
   the package's imports keeps it that way.

## 3. Fix the class of bug, not the instance

1. Every bug fix is generic. Never write a fix that keys on one IP address,
   one device, one account, one customer or one environment.
2. If something really does behave differently, put the difference in data
   (a mapping file or config), keyed by what causes it. Record the provenance
   beside it: what it applies to, which version, the date, and the evidence.
3. A fix that only makes the symptom go away on your machine is a false fix.
   It ships the bug to everyone else.

## 4. Probe, do not assume

1. Keep **supported**, **unsupported** and **unknown** as three separate
   answers. "We never asked" is not "it cannot".
2. Absent beats guessed. Leave a field empty rather than invent a value.
3. A feature that is switched off is not a feature that is missing. Offer the
   switch instead of reporting it as unsupported.
4. **Say nothing rather than guess.** A confident wrong answer is worse than
   admitting uncertainty.
5. **Silence is a bug.** Log which branch was taken, so "never checked" and
   "checked and absent" look different.

## 5. Safety and privacy

1. Never log credentials, tokens, or URLs that contain them. Redact before
   logging.
2. User data stays on the device unless the user chose otherwise. Name every
   exception (an explicit share or export, sync the user turned on, the
   user's own server) and keep the list short.
3. Fail open into a safe, working state, never into broken. A billing or
   network failure takes away extras. It does not stop what already worked.
4. Nothing is written where the user did not choose. An export is a target
   the user picks, never an automatic sink.

## 6. Errors, copy and generated files

1. Every user-visible failure has a stable error code, such as `APP-NET-001`,
   listed in one catalogue. Codes are permanent. A shipped code is never
   renamed or reused, because support articles point at it.
2. Every user-facing string goes through the localization layer. No copy is
   hard-coded.
3. Generated files are never edited by hand. Edit the source, then run the
   generator.

## 7. Versions and the release gate

1. Every change bumps the version of what it ships in, in the same commit.
   Tests, docs and tooling that ship in nothing need no bump.
2. One script is the gate before any release: analyze, check formatting, run
   every test suite, and fail below 90% line coverage. A release does not
   skip it.
3. Tests that need something extra (Docker, a device, the network) run by
   default and skip with a reason when it is missing. A test that only runs
   when someone remembers to ask for it stops being true.

## 8. Writing: docs, comments and commits

1. No em dashes or en dashes. Use commas, parentheses, colons, or two short
   sentences.
2. Be technical, direct and step by step. Say what a thing is, then how to
   do it, in numbered steps that can be followed without guessing.
3. Use plain language and short sentences. Explain a term or an acronym the
   first time it appears.
4. No AI attribution anywhere. No `Co-Authored-By` line for an AI, and no
   "Generated with" footer, in commits, pull requests, changelogs or docs.

## 9. Flutter and Dart

These apply when the repo is a Flutter or Dart project.

1. Turn on these lints in `analysis_options.yaml`, on top of
   `package:flutter_lints/flutter.yaml`:

   ```yaml
   linter:
     rules:
       - always_declare_return_types
       - cancel_subscriptions
       - close_sinks
       - prefer_final_locals
       - unawaited_futures
       - unnecessary_await_in_return
       - use_super_parameters
   ```

2. Measure coverage like this. The awk line totals `coverage/lcov.info`, so
   nothing extra needs installing. Leave generated files (such as
   `app_localizations*.dart`) out of the count.

   ```sh
   flutter test --coverage
   awk -F: '/^SF:/{skip = ($2 ~ /app_localizations|\.g\.dart$|\.freezed\.dart$/)}
            !skip && /^LF:/{f += $2} !skip && /^LH:/{h += $2}
            END {printf "%.1f%% line coverage\n", 100 * h / f; exit (h / f < 0.9)}' coverage/lcov.info
   ```

3. Integration tests never call `pumpAndSettle`. Animations and video never
   settle. Pump for a bounded time instead.
4. Integration tests run against the machine's real data, so assert
   navigation, chrome and survival, not content.
5. Name platform channels `com.ashier.<app>/<name>`, and give each channel
   one Dart file that owns it.
6. Register every platform bridge in the existing `AppDelegate`, not in a new
   Swift file. A new file means hand-editing `project.pbxproj`, and that has
   corrupted a project twice.
