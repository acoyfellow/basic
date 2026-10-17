# coil conformance report

Run against the deployed app on 2026-10-17.

pass 15 · fail 9 · n/a 0 · untested 46

| Scenario | Tags | Result | Detail |
| --- | --- | --- | --- |
| Following the stream while at the bottom | @must | pass |  |
| Reading history while the agent streams | @must | pass |  |
| A scroll-wheel up releases the pin at once | @must | fail | the next token pulled the reader back (0px from bottom) |
| Scrolling up during a real reply is never pulled back | @must | fail | scrolled up 6 times during the stream; 6 of 6 samples were pulled back to the bottom (0, 0, 0, 0, 0, 0 px) |
| A way back to the newest message | @must | fail | no Scroll to latest button while scrolled up |
| Opening a conversation lands at the bottom | @must | pass |  |
| Older history pages in without a jump | @should | untested | no check in the adapter yet |
| An existing conversation never flashes the empty state | @must | pass |  |
| My own message always pins | @must | pass |  |
| Enter sends, Shift+Enter breaks a line, on desktop | @must | pass |  |
| Enter during IME composition never sends | @must | fail | Enter during composition sent the message |
| On a phone, Enter is a newline | @must | untested | no check in the adapter yet |
| The shortcut is written down | @must | untested | no check in the adapter yet |
| The composer is focused and ready on load | @must | fail | focus is on nothing, not the composer |
| The composer grows with the text, up to a limit | @must | pass |  |
| Send is disabled for empty input, and says why | @must | pass |  |
| A send that cannot go out keeps the draft | @must | untested | no check in the adapter yet |
| The draft survives a reload or a deploy | @must | fail | after reload the composer holds "" |
| Typing hides the starter prompts | @should | untested | no check in the adapter yet |
| Paste an image | @should | untested | no check in the adapter yet |
| Locked features say why they are locked | @should | untested | no check in the adapter yet |
| Send becomes Stop | @must | pass |  |
| Esc stops the agent | @must | fail | Esc did not stop the turn within 15 s |
| A thinking indicator appears only when it is needed | @must | pass |  |
| Each tool call shows a live timer | @must @agent | untested | no check in the adapter yet |
| The whole task shows a live timer | @must @agent | fail | no running timer while the turn runs |
| A stuck tool row never runs forever | @must @agent | untested | no check in the adapter yet |
| A turn that ends with nothing visible says so | @must | untested | no check in the adapter yet |
| Reasoning is folded | @must @agent | untested | no check in the adapter yet |
| Tool rows keep their open or closed state while streaming | @should | untested | no check in the adapter yet |
| A new chat appears in the list at once | @must | pass |  |
| Each chat shows whether it is working | @must | untested | no check in the adapter yet |
| Each chat shows working, idle, or failed at a glance | @must @agent | untested | no check in the adapter yet |
| The list is grouped by time and searchable | @must | untested | no check in the adapter yet |
| Pin, archive, and rename from the row | @should | untested | no check in the adapter yet |
| Delete asks first | @should | untested | no check in the adapter yet |
| Copy a message | @must | untested | no check in the adapter yet |
| Copy a code block | @must | untested | no check in the adapter yet |
| Retry, edit, and branch | @must | untested | no check in the adapter yet |
| Code is highlighted without blocking the first token | @must | untested | no check in the adapter yet |
| Reconnecting is shown, then gives up honestly | @must | untested | no check in the adapter yet |
| A stale close cannot undo a good connection | @must | untested | no check in the adapter yet |
| A backgrounded tab catches up when it returns | @must | untested | no check in the adapter yet |
| A turn interrupted by a restart resumes | @must @agent | untested | no check in the adapter yet |
| Errors sit in the transcript in order | @must | untested | no check in the adapter yet |
| A long error is summarised, with detail on demand | @must | untested | no check in the adapter yet |
| A side panel can be hidden and shown again | @must | untested | no check in the adapter yet |
| A side panel can be resized on desktop | @must | untested | no check in the adapter yet |
| Panel sizes and visibility survive a reload | @must | untested | no check in the adapter yet |
| What is inside a panel adapts to its width | @must | untested | no check in the adapter yet |
| On a phone, side panels open over the conversation | @must | untested | no check in the adapter yet |
| Each panel toggle has a keyboard shortcut | @should | untested | no check in the adapter yet |
| A double click on the drag edge restores the default width | @should | untested | no check in the adapter yet |
| A signed-out visitor sees one way in | @must | pass |  |
| The API refuses a caller who is not signed in | @must | pass |  |
| The first sign-in asks only what it needs, then lands somewhere useful | @must | untested | no check in the adapter yet |
| A cancelled or failed sign-in says why | @must | untested | no check in the adapter yet |
| Who I am is always one click away | @must | untested | no check in the adapter yet |
| Signing out is one visible control | @must | fail | no visible Sign out control |
| After signing out, nothing private is reachable | @must | untested | no check in the adapter yet |
| Signing out revokes what the app was granted | @should | untested | no check in the adapter yet |
| An expired session sends me to sign in, keeping my place | @should | untested | no check in the adapter yet |
| The transcript is a polite live region | @must | pass |  |
| Motion respects the system setting | @must | untested | no check in the adapter yet |
| Every icon button has a name | @must | pass |  |
| No text sits on top of other text | @must | untested | no check in the adapter yet |
| Notifications have a keyboard shortcut | @should | untested | no check in the adapter yet |
| The empty state offers starters | @must | untested | no check in the adapter yet |
| Starters belong to the owner | @should | untested | no check in the adapter yet |
| The copy names the outcome, not the feature | @should | untested | no check in the adapter yet |
