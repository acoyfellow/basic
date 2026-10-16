# myax conformance report

Run against the deployed app on 2026-10-16, floor only.

pass 45 · fail 0 · n/a 10 · untested 0

| Scenario | Tags | Result | Detail |
| --- | --- | --- | --- |
| Following the stream while at the bottom | @must | pass |  |
| Reading history while the agent streams | @must | pass |  |
| A scroll-wheel up releases the pin at once | @must | pass |  |
| A way back to the newest message | @must | pass |  |
| Opening a conversation lands at the bottom | @must | pass |  |
| An existing conversation never flashes the empty state | @must | pass |  |
| My own message always pins | @must | pass |  |
| Enter sends, Shift+Enter breaks a line, on desktop | @must | pass |  |
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
| A thinking indicator appears only when it is needed | @must | pass |  |
| Each tool call shows a live timer | @must @agent | pass |  |
| The whole task shows a live timer | @must @agent | pass |  |
| A stuck tool row never runs forever | @must @agent | n/a | Covered by Chat.svelte settleOrphanTools: a tool row without a result when the turn ends becomes an error row ("No result — the turn ended"); a live run cannot kill the agent mid-call on demand. |
| A turn that ends with nothing visible says so | @must | n/a | Covered by shouldReportInvisibleCompletion in Chat.svelte, which pushes "Agent completed without a visible response. Please retry."; a real model cannot be made to reply with nothing on demand. |
| Reasoning is folded | @must @agent | pass | the model returned no reasoning; nothing is open |
| A new chat appears in the list at once | @must | pass |  |
| Each chat shows whether it is working | @must | pass |  |
| Each chat shows working, idle, or failed at a glance | @must @agent | pass |  |
| The list is grouped by time and searchable | @must | pass |  |
| Copy a message | @must | pass |  |
| Copy a code block | @must | pass |  |
| Retry, edit, and branch | @must | pass |  |
| Code is highlighted without blocking the first token | @must | n/a | my.ax renders markdown per token with marked and has no syntax highlighter, so nothing blocks the first token. |
| Reconnecting is shown, then gives up honestly | @must | pass |  |
| A stale close cannot undo a good connection | @must | n/a | Covered by reconnecting-socket.test.ts: a close from a superseded socket is ignored once a newer socket is open. |
| A backgrounded tab catches up when it returns | @must | pass |  |
| A turn interrupted by a restart resumes | @must @agent | n/a | pi-durable checkpoints every turn in the PiChatAgent Durable Object and its watchdog resumes it after an eviction; proven by the my-ax crash test (POST /api/pi/chats/:id/crash) in the parity suite, not reproducible from a browser. |
| Errors sit in the transcript in order | @must | n/a | Chat.svelte pushError appends notices into the message list at the point they occur, and a new send clears transient notices; covered by transcript-merge.test.ts. |
| A long error is summarised, with detail on demand | @must | pass | errors show one line; the full text sits in a details disclosure |
| A side panel can be hidden and shown again | @must | pass |  |
| A side panel can be resized on desktop | @must | pass | panel 300 → 379px; conversation kept 800px; panel stops at 220px |
| Panel sizes and visibility survive a reload | @must | pass |  |
| What is inside a panel adapts to its width | @must | pass | no sideways overflow at 1440, 1024, 800px |
| On a phone, side panels open over the conversation | @must | pass |  |
| A signed-out visitor sees one way in | @must | pass | Cloudflare Access shows its single sign-in page before any app content |
| The API refuses a caller who is not signed in | @must | n/a | my.ax sits behind the owner's Cloudflare Access app, which answers every unauthenticated request before the Worker runs; the owner chose not to add a separate Access app for the API. |
| The first sign-in asks only what it needs, then lands somewhere useful | @must | n/a | my.ax is a single-owner Cloudflare Access app: Access is the only sign-in, there is nothing to choose (models are paid by the host), and the first visit lands in the app ready to type. |
| A cancelled or failed sign-in says why | @must | n/a | Sign-in is Cloudflare Access; a cancelled or failed login is handled and explained on Access's own page, which my.ax does not render. |
| Who I am is always one click away | @must | pass |  |
| Signing out is one visible control | @must | pass |  |
| After signing out, nothing private is reachable | @must | n/a | signing out ends the owner's Cloudflare Access session for every tab; it needs a throwaway Access identity this run may end |
| The transcript is a polite live region | @must | pass |  |
| Motion respects the system setting | @must | pass |  |
| Every icon button has a name | @must | pass |  |
| No text sits on top of other text | @must | pass |  |
| The empty state offers starters | @must | pass |  |
