# Scheduled pre-generation.

The console writes its own drafts before you sit down. A launchd job runs
`npm run pregen` on Monday and Wednesday mornings: Monday sources and writes
the Stride TLDR, Wednesday the Breaking This Week post. The draft lands in the
console, a banner says it is ready, and nothing goes anywhere until a founder
approves it.

The script is safe to run twice. One draft per recipe per ISO week; a second
run the same week says so and exits.

## Try it by hand first

```bash
npm run pregen                     # picks the recipe from the weekday
npm run pregen -- --recipe=tldr    # force a recipe on any other day
```

On a Tuesday the bare command reports that nothing is scheduled and exits 0.

## Install the launchd job (macOS)

1. Copy the template into your LaunchAgents folder:

   ```bash
   cp docs/com.stride.pregen.plist ~/Library/LaunchAgents/
   ```

2. Open `~/Library/LaunchAgents/com.stride.pregen.plist` and replace
   `REPLACE_WITH_REPO_PATH` with the absolute path of this repo, for example
   `/Users/you/stride-console`.

3. Load it:

   ```bash
   launchctl load ~/Library/LaunchAgents/com.stride.pregen.plist
   ```

4. Confirm it is registered and give it a test run:

   ```bash
   launchctl list | grep com.stride.pregen
   launchctl start com.stride.pregen
   tail -20 /tmp/stride-pregen.log
   ```

To change the schedule, edit the `StartCalendarInterval` entries (launchd
weekdays: Sunday is 0). To stop it:

```bash
launchctl unload ~/Library/LaunchAgents/com.stride.pregen.plist
```

## Notes

- The job runs in a login shell so it finds `node` and, when installed, the
  `claude` CLI — pregen drafts are written by the same subscription writer the
  buttons use.
- If the Mac is asleep at 07:30, launchd runs the job when it wakes.
- Output of every run appends to `/tmp/stride-pregen.log`.
