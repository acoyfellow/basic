# coil conformance report

Run against the deployed app on 2026-10-18.

pass 30 · fail 12 · n/a 28 · untested 0

| Scenario | Tags | Result | Detail |
| --- | --- | --- | --- |
| Following the stream while at the bottom | @must | pass |  |
| Reading history while the agent streams | @must | pass |  |
| A scroll-wheel up releases the pin at once | @must | pass |  |
| Scrolling up during a real reply is never pulled back | @must | pass |  |
| A way back to the newest message | @must | pass |  |
| Opening a conversation lands at the bottom | @must | pass |  |
| Older history pages in without a jump | @should | n/a | coil loads the whole conversation (up to 500 entries) in one view; there is no paged older history to load. |
| An existing conversation never flashes the empty state | @must | pass |  |
| My own message always pins | @must | pass |  |
| Enter sends, Shift+Enter breaks a line, on desktop | @must | pass |  |
| Enter during IME composition never sends | @must | pass |  |
| On a phone, Enter is a newline | @must | pass |  |
| The shortcut is written down | @must | pass |  |
| The composer is focused and ready on load | @must | pass |  |
| The composer grows with the text, up to a limit | @must | pass |  |
| Send is disabled for empty input, and says why | @must | pass |  |
| A send that cannot go out keeps the draft | @must | n/a | Covered by the client story test 'a failed send puts the text back and says why' (client/src/story.test.ts). |
| The draft survives a reload or a deploy | @must | pass |  |
| Typing hides the starter prompts | @should | n/a | coil has no starter prompts; the empty thread shows one line about the computer instead. |
| Paste an image | @should | fail | pasting an image into the composer does nothing; files are attached by drag and drop only. |
| Locked features say why they are locked | @should | n/a | coil has no plan tiers or locked features; every signed-in user has the same features on their own account. |
| Send becomes Stop | @must | pass |  |
| Esc stops the agent | @must | pass |  |
| A thinking indicator appears only when it is needed | @must | pass |  |
| Each tool call shows a live timer | @must @agent | fail | a running tool row shows a spinner but no elapsed time. |
| The whole task shows a live timer | @must @agent | pass |  |
| A stuck tool row never runs forever | @must @agent | n/a | Covered by the server: every agent command runs under a 120 s timeout (src/shell.ts RUN_LIMIT_SECONDS) and Stop ends it within 5 s (test/stop.test.ts). |
| A turn that ends with nothing visible says so | @must | fail | a turn that ends with no text shows only its footer, with no line saying the agent replied with nothing. |
| Reasoning is folded | @must @agent | n/a | coil does not render model reasoning; only the reply text and tool rows are shown. |
| Tool rows keep their open or closed state while streaming | @should | n/a | Tool rows are keyed by call id (client/src/view/feed.ts), so a row keeps its open state across renders; no runner check yet. |
| A new chat appears in the list at once | @must | pass |  |
| Each chat shows whether it is working | @must | n/a | The sidebar groups threads into Working, Running, and Paused with a coloured dot (client/src/view/side.ts); no runner check yet. |
| Each chat shows working, idle, or failed at a glance | @must @agent | fail | the sidebar shows working, running, and paused, but a thread whose last turn failed looks the same as an idle one. |
| The list is grouped by time and searchable | @must | fail | the list is grouped by state, not by time; search is in the Cmd-K palette, not in the list. |
| Pin, archive, and rename from the row | @should | fail | archive and rename are in the thread menu and palette, not on the row; there is no pin. |
| Delete asks first | @should | n/a | Delete runs through a confirm dialog before the RPC (client/src/command.ts RunOp Delete); no runner check yet. |
| Copy a message | @must | pass |  |
| Copy a code block | @must | pass |  |
| Retry, edit, and branch | @must | n/a | Edit and Retry are on every user message and Fork branches a thread; covered by the client story test 'edit puts the text back; retry sends it again'. |
| Code is highlighted without blocking the first token | @must | n/a | Chat code blocks are not syntax highlighted; only /docs uses the highlighter. |
| Reconnecting is shown, then gives up honestly | @must | fail | an offline banner appears when the browser is offline, but a dropped event stream reconnects silently and never says it gave up. |
| A stale close cannot undo a good connection | @must | n/a | Each event stream carries an epoch in the model, and a close only reconnects the current epoch (client/src/update.ts StreamClosed); no runner check yet. |
| A backgrounded tab catches up when it returns | @must | n/a | The thread view reloads on every event stream reconnect and on a 10 s refresh tick; no runner check yet. |
| A turn interrupted by a restart resumes | @must @agent | n/a | Pi Durable keeps the turn in the Durable Object; a restarted thread continues it (test/thread.test.ts). Not reproducible from a browser. |
| Errors sit in the transcript in order | @must | n/a | A failed model call is written into the transcript as the agent's message, in order (src/agent.ts entriesToMessages). |
| A long error is summarised, with detail on demand | @must | fail | a long model error is shown in full as one paragraph, with no summary and no folded detail. |
| A side panel can be hidden and shown again | @must | n/a | The threads sidebar and computer panel collapse with buttons and Cmd-B / Cmd-J (client/src/layout.ts); no runner check yet. |
| A side panel can be resized on desktop | @must | n/a | Both side columns resize by dragging their edge (client/src/layout.ts); no runner check yet. |
| Panel sizes and visibility survive a reload | @must | n/a | Widths and visibility persist in localStorage (client/src/layout.ts); no runner check yet. |
| What is inside a panel adapts to its width | @must | n/a | Panels use container queries (src/ui/style.ts); no runner check yet. |
| On a phone, side panels open over the conversation | @must | n/a | On phones the side columns are hidden and open as drawers over the chat; no runner check yet. |
| Each panel toggle has a keyboard shortcut | @should | n/a | Cmd-B toggles the threads sidebar and Cmd-J the computer panel (client/src/layout.ts). |
| A double click on the drag edge restores the default width | @should | n/a | A double click on a drag handle restores its default width (client/src/layout.ts dblclick). |
| A signed-out visitor sees one way in | @must | pass |  |
| The API refuses a caller who is not signed in | @must | pass |  |
| The first sign-in asks only what it needs, then lands somewhere useful | @must | n/a | Needs a brand-new Cloudflare identity; coil asks for 7 scopes, then sends a first sign-in to the gateway picker and then home (src/auth/cloudflare.ts). |
| A cancelled or failed sign-in says why | @must | fail | a cancelled consent returns to the sign-in page with no message saying it was cancelled. |
| Who I am is always one click away | @must | pass |  |
| Signing out is one visible control | @must | pass |  |
| After signing out, nothing private is reachable | @must | n/a | Covered by 'The API refuses a caller who is not signed in' and the sign-out route clearing the session cookie (src/auth/cloudflare.ts logout). |
| Signing out revokes what the app was granted | @should | n/a | Sign out revokes the refresh token at Cloudflare and drops the stored grant (src/auth/cloudflare.ts logout). A browser cannot observe the provider-side revocation. |
| An expired session sends me to sign in, keeping my place | @should | fail | an expired session shows the sign-in page, but coil does not return you to the thread you were on. |
| The transcript is a polite live region | @must | pass |  |
| Motion respects the system setting | @must | pass |  |
| Every icon button has a name | @must | pass |  |
| No text sits on top of other text | @must | n/a | No overlap check in this adapter yet; the myax adapter's overlap check needs coil selectors. |
| Notifications have a keyboard shortcut | @should | fail | notifications are toggled from a sidebar button only; there is no shortcut. |
| The empty state offers starters | @must | fail | an empty thread shows one line about its computer, not starter prompts. |
| Starters belong to the owner | @should | n/a | coil has no starter prompts, so there are none to own. |
| The copy names the outcome, not the feature | @should | n/a | Copy review is a human judgement; not checked by this runner. |
