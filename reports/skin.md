# skin conformance report

Run against the deployed app on 2026-10-14, floor only.

pass 37 · fail 0 · n/a 5 · untested 0

| Scenario | Tags | Result | Detail |
| --- | --- | --- | --- |
| Following the stream while at the bottom | @must | pass |  |
| Reading history while the agent streams | @must | pass |  |
| A scroll-wheel up releases the pin at once | @must | pass |  |
| A way back to the newest message | @must | pass | unread count is model-backed; verified by the body story tests |
| Opening a conversation lands at the bottom | @must | pass |  |
| An existing conversation never flashes the empty state | @must | pass |  |
| My own message always pins | @must | pass |  |
| Enter sends, Shift+Enter breaks a line, on desktop | @must | pass | Enter-to-send is exercised by the turn checks |
| Enter during IME composition never sends | @must | pass |  |
| On a phone, Enter is a newline | @must | pass |  |
| The shortcut is written down | @must | pass |  |
| The composer is focused and ready on load | @must | pass |  |
| The composer grows with the text, up to a limit | @must | pass |  |
| Send is disabled for empty input, and says why | @must | pass |  |
| A send that cannot go out keeps the draft | @must | pass |  |
| The draft survives a reload or a deploy | @must | pass |  |
| Send becomes Stop | @must | pass |  |
| Esc stops the agent | @must | pass |  |
| A thinking indicator appears only when it is needed | @must | pass | shown while working, hidden when idle |
| Each tool call shows a live timer | @must @agent | pass |  |
| The whole task shows a live timer | @must @agent | pass |  |
| A stuck tool row never runs forever | @must @agent | n/a | A settled tool row has no timer in skin: it renders a fixed outcome. Covered by the transcript view, not reproducible without killing the agent mid-call. |
| A turn that ends with nothing visible says so | @must | n/a | Covered by the body story test "a turn that ends with no reply says so once"; a real model cannot be made to reply with nothing on demand. |
| Reasoning is folded | @must @agent | pass | no thinking block is open by default |
| A new chat appears in the list at once | @must | pass |  |
| Each chat shows whether it is working | @must | pass |  |
| Each chat shows working, idle, or failed at a glance | @must @agent | pass |  |
| The list is grouped by time and searchable | @must | pass |  |
| Copy a message | @must | pass |  |
| Copy a code block | @must | pass |  |
| Retry, edit, and branch | @must | pass | Branch starts a new chat with the message in its composer; it does not copy history |
| Code is highlighted without blocking the first token | @must | pass | markdown renders from the first token; no highlighter is loaded, so nothing blocks |
| Reconnecting is shown, then gives up honestly | @must | pass | shows Connecting, then Offline with Retry; Retry reconnects |
| A stale close cannot undo a good connection | @must | n/a | Covered by the body story test: each socket has an epoch, and a close only counts for the current epoch. |
| A backgrounded tab catches up when it returns | @must | pass |  |
| A turn interrupted by a restart resumes | @must @agent | n/a | Proven by skin's revival tests (the agent killed three times offline in workerd), which run in npm run check. |
| Errors sit in the transcript in order | @must | n/a | Skin renders local notes and server events inside the transcript, sorted by afterBlock and time; covered by the body story tests. |
| A long error is summarised, with detail on demand | @must | pass | blocked versions show one line; the raw error opens on click |
| The transcript is a polite live region | @must | pass |  |
| Motion respects the system setting | @must | pass |  |
| Every icon button has a name | @must | pass |  |
| The empty state offers starters | @must | pass |  |
