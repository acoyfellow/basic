# reference conformance report

Run against the deployed app on 2026-10-30.

pass 1 · fail 69 · n/a 0 · untested 0

| Scenario | Tags | Result | Detail |
| --- | --- | --- | --- |
| Following the stream while at the bottom | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Reading history while the agent streams | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A scroll-wheel up releases the pin at once | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Scrolling up during a real reply is never pulled back | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A way back to the newest message | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Opening a conversation lands at the bottom | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Older history pages in without a jump | @should | fail | page.fill: Timeout 30000ms exceeded. |
| An existing conversation never flashes the empty state | @must | fail | page.fill: Timeout 30000ms exceeded. |
| My own message always pins | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Enter sends, Shift+Enter breaks a line, on desktop | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Enter during IME composition never sends | @must | fail | page.fill: Timeout 30000ms exceeded. |
| On a phone, Enter is a newline | @must | fail | page.fill: Timeout 30000ms exceeded. |
| The shortcut is written down | @must | fail | page.fill: Timeout 30000ms exceeded. |
| The composer is focused and ready on load | @must | fail | page.fill: Timeout 30000ms exceeded. |
| The composer grows with the text, up to a limit | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Send is disabled for empty input, and says why | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A send that cannot go out keeps the draft | @must | fail | page.fill: Timeout 30000ms exceeded. |
| The draft survives a reload or a deploy | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Typing hides the starter prompts | @should | fail | page.fill: Timeout 30000ms exceeded. |
| Paste an image | @should | fail | page.fill: Timeout 30000ms exceeded. |
| Locked features say why they are locked | @should | fail | page.fill: Timeout 30000ms exceeded. |
| Send becomes Stop | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Esc stops the agent | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A thinking indicator appears only when it is needed | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Each tool call shows a live timer | @must @agent | fail | page.fill: Timeout 30000ms exceeded. |
| The whole task shows a live timer | @must @agent | fail | page.fill: Timeout 30000ms exceeded. |
| A stuck tool row never runs forever | @must @agent | fail | page.fill: Timeout 30000ms exceeded. |
| A turn that ends with nothing visible says so | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Reasoning is folded | @must @agent | fail | page.fill: Timeout 30000ms exceeded. |
| Tool rows keep their open or closed state while streaming | @should | fail | page.fill: Timeout 30000ms exceeded. |
| A new chat appears in the list at once | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Each chat shows whether it is working | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Each chat shows working, idle, or failed at a glance | @must @agent | fail | page.fill: Timeout 30000ms exceeded. |
| The list is grouped by time and searchable | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Pin, archive, and rename from the row | @should | fail | page.fill: Timeout 30000ms exceeded. |
| Delete asks first | @should | fail | page.fill: Timeout 30000ms exceeded. |
| Copy a message | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Copy a code block | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Retry, edit, and branch | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Code is highlighted without blocking the first token | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Reconnecting is shown, then gives up honestly | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A stale close cannot undo a good connection | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A backgrounded tab catches up when it returns | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A turn interrupted by a restart resumes | @must @agent | fail | page.fill: Timeout 30000ms exceeded. |
| Errors sit in the transcript in order | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A long error is summarised, with detail on demand | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A side panel can be hidden and shown again | @must | fail | page.fill: Timeout 30000ms exceeded. |
| A side panel can be resized on desktop | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Panel sizes and visibility survive a reload | @must | fail | page.fill: Timeout 30000ms exceeded. |
| What is inside a panel adapts to its width | @must | fail | page.fill: Timeout 30000ms exceeded. |
| On a phone, side panels open over the conversation | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Each panel toggle has a keyboard shortcut | @should | fail | page.fill: Timeout 30000ms exceeded. |
| A double click on the drag edge restores the default width | @should | fail | page.fill: Timeout 30000ms exceeded. |
| A signed-out visitor sees one way in | @must | fail | page.waitForSelector: Timeout 10000ms exceeded. |
| The API refuses a caller who is not signed in | @must | pass |  |
| The first sign-in asks only what it needs, then lands somewhere useful | @must | fail | page.click: Timeout 30000ms exceeded. |
| A cancelled or failed sign-in says why | @must | fail | page.click: Timeout 30000ms exceeded. |
| Who I am is always one click away | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Signing out is one visible control | @must | fail | page.fill: Timeout 30000ms exceeded. |
| After signing out, nothing private is reachable | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Signing out revokes what the app was granted | @should | fail | page.fill: Timeout 30000ms exceeded. |
| An expired session sends me to sign in, keeping my place | @should | fail | page.fill: Timeout 30000ms exceeded. |
| The transcript is a polite live region | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Motion respects the system setting | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Every icon button has a name | @must | fail | page.fill: Timeout 30000ms exceeded. |
| No text sits on top of other text | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Notifications have a keyboard shortcut | @should | fail | page.fill: Timeout 30000ms exceeded. |
| The empty state offers starters | @must | fail | page.fill: Timeout 30000ms exceeded. |
| Starters belong to the owner | @should | fail | page.fill: Timeout 30000ms exceeded. |
| The copy names the outcome, not the feature | @should | fail | page.fill: Timeout 30000ms exceeded. |
