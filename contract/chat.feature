Feature: The expected UX contract for an agent chat, October 2026
  Tags: @must is the floor. @should is common in mature apps. @agent applies when turns run tools for minutes.

  Rule: Scroll follows the reader, never the stream

    @must
    Scenario: Following the stream while at the bottom
      Given I am within 80 px of the bottom of the transcript
      When new tokens arrive
      Then the transcript stays pinned to the newest line
      And the pin uses an instant jump, not a smooth animation

    @must
    Scenario: Reading history while the agent streams
      Given I scrolled up more than 80 px from the bottom
      When new tokens, tool rows, or messages arrive
      Then my scroll position does not move by a single pixel
      And content added above my viewport does not push what I am reading

    @must
    Scenario: A scroll-wheel up releases the pin at once
      Given the transcript is pinned and streaming
      When I scroll up with the wheel or trackpad
      Then following stops on that event, before the next token arrives

    @must
    Scenario: Scrolling up during a real reply is never pulled back
      Given the agent is streaming a real reply through the app's own rendering
      And the transcript is pinned to the bottom
      When I scroll up with the wheel, trackpad, or scrollbar while tokens keep arriving
      Then every later render leaves my scroll position where I put it
      When I scroll back to within 80 px of the bottom
      Then following resumes with the next token

    @must
    Scenario: A way back to the newest message
      Given I am not at the bottom
      Then a "Scroll to latest" button is visible above the composer
      And it shows a count of unread messages that arrived while I was away
      When I press it
      Then the transcript scrolls to the bottom and following resumes
      And the unread count resets to zero

    @must
    Scenario: Opening a conversation lands at the bottom
      When I open an existing conversation
      Then the newest message is visible when the loading state disappears
      And I never see the transcript scroll down from the top

    @should
    Scenario: Older history pages in without a jump
      Given I scroll within 200 px of the top
      When an older page of history loads
      Then my scroll position is kept relative to the message I was reading

    @must
    Scenario: An existing conversation never flashes the empty state
      When I open the address of a conversation that has messages
      Then a loading state shows until the messages arrive
      And the empty state with starters never appears, not even for one frame

    @must
    Scenario: My own message always pins
      When I send a message
      Then the transcript scrolls to the bottom, even if I had scrolled up

  Rule: The composer keeps what I type

    @must
    Scenario: Enter sends, Shift+Enter breaks a line, on desktop
      Given a desktop keyboard
      When I press Enter
      Then the message sends
      When I press Shift+Enter
      Then a newline is inserted

    @must
    Scenario: Enter during IME composition never sends
      Given I am composing with an input method
      When I press Enter to confirm a candidate
      Then nothing is sent

    @must
    Scenario: On a phone, Enter is a newline
      Given a touch keyboard
      When I press Return
      Then a newline is inserted and only the Send button sends

    @must
    Scenario: The shortcut is written down
      Then the composer shows "Enter to send, Shift + Enter for new line" or equivalent

    @must
    Scenario: The composer is focused and ready on load
      When a new chat opens
      Then the text box has focus, with no click needed

    @must
    Scenario: The composer grows with the text, up to a limit
      When I type more lines than fit
      Then the composer grows up to about 160 px, then scrolls inside itself

    @must
    Scenario: Send is disabled for empty input, and says why
      Given the composer is empty
      Then the Send button is disabled with the label "Message requires text"

    @must
    Scenario: A send that cannot go out keeps the draft
      Given the connection is down
      When I press Send
      Then the message is not sent
      And my text stays in the composer
      And I am told "Message not sent: reconnecting. Your draft is still in the composer"

    @must
    Scenario: The draft survives a reload or a deploy
      Given I typed a draft and attached files
      When the page reloads for a new deploy
      Then the draft and the attachments come back in the same conversation
      And a draft older than one hour is dropped

    @should
    Scenario: Typing hides the starter prompts
      Given the empty state shows suggested prompts
      When I type the first character
      Then the suggestions get out of the way

    @should
    Scenario: Paste an image
      When I paste an image into the composer
      Then it becomes an attachment chip before I send

    @should
    Scenario: Locked features say why they are locked
      Then a disabled control has a label such as "Attaching files is a subscriber-only feature"

  Rule: A running turn is visible, timed, and stoppable

    @must
    Scenario: Send becomes Stop
      When a turn starts
      Then the Send button becomes a Stop button labelled "Cancel message"
      And the composer stays usable so I can draft the next message

    @must
    Scenario: Esc stops the agent
      Given a turn is running and no modal is open
      When I press Esc
      Then the turn is cancelled

    @must
    Scenario: A thinking indicator appears only when it is needed
      When a turn starts and no token has arrived yet
      Then a thinking indicator appears after a short delay, not on a fast reply
      And it is announced politely to screen readers

    @must @agent
    Scenario: Each tool call shows a live timer
      Given a tool call is running
      Then its row shows the elapsed time, updated every second
      And the timer stops at the final value when the call ends

    @must @agent
    Scenario: The whole task shows a live timer
      Given a turn has been running for longer than a minute
      Then the page shows how long the whole task has run, such as "task 4m 12s"
      And the browser tab title shows that it is working

    @must @agent
    Scenario: A stuck tool row never runs forever
      Given a turn ended without a result for a tool
      Then the tool row shows an error, not a timer that climbs forever

    @must
    Scenario: A turn that ends with nothing visible says so
      When the agent finishes without visible output
      Then I am told "Agent completed without a visible response. Please retry."

    @must @agent
    Scenario: Reasoning is folded
      When the reply includes reasoning
      Then it sits in a closed "Thinking" disclosure above the answer

    @should
    Scenario: Tool rows keep their open or closed state while streaming
      Given I opened a tool row
      When the stream re-renders the message
      Then that row stays open

  Rule: The conversation list tells me what needs me

    @must
    Scenario: A new chat appears in the list at once
      When I send the first message of a new chat
      Then the chat is listed under "Today" before the reply arrives
      And the URL changes to the chat's own address

    @must
    Scenario: Each chat shows whether it is working
      Given a chat is running a turn
      Then its list row shows a "Response in progress" status
      And the indicator clears when the turn ends

    @must @agent
    Scenario: Each chat shows working, idle, or failed at a glance
      Then each row has a dot: animated for working, green for idle, red for failed

    @must
    Scenario: The list is grouped by time and searchable
      Then chats are grouped as Today, Yesterday, Last 7 days, Older
      And a search box filters threads by title

    @should
    Scenario: Pin, archive, and rename from the row
      Then each row has Pin and Archive actions on hover
      And double-clicking the title renames it in place

    @should
    Scenario: Delete asks first
      When I delete a conversation
      Then I am asked to confirm, naming the conversation

  Rule: Messages have actions where I need them

    @must
    Scenario: Copy a message
      Then each message has a Copy button that copies its markdown

    @must
    Scenario: Copy a code block
      Then each code block has a "copy" button that changes to "copied" for about one second

    @must
    Scenario: Retry, edit, and branch
      Then my messages have Retry, Edit, and Branch off actions
      And a disabled action says what it needs, such as "You need to sign in to edit messages"

    @must
    Scenario: Code is highlighted without blocking the first token
      When a reply with code streams in
      Then markdown renders from the first token
      And syntax highlighting loads lazily and upgrades the block

  Rule: Connection state is truthful

    @must
    Scenario: Reconnecting is shown, then gives up honestly
      When the socket drops
      Then the page says "Reconnecting"
      When reconnects keep failing
      Then the page says it is offline and shows Retry, instead of spinning forever

    @must
    Scenario: A stale close cannot undo a good connection
      Given a new socket already opened
      When the old socket's close event arrives late
      Then the state stays connected

    @must
    Scenario: A backgrounded tab catches up when it returns
      Given the tab was hidden while a turn finished
      When I return to the tab
      Then the page reconnects and shows the finished turn

    @must @agent
    Scenario: A turn interrupted by a restart resumes
      Given the server restarted mid tool call
      Then the turn resumes from its last checkpoint, and the transcript says so

  Rule: Notices are placed in time, not pinned on top

    @must
    Scenario: Errors sit in the transcript in order
      When a system notice or error appears
      Then it sits after the messages it relates to, not above newer messages
      And starting a new turn clears transient notices

    @must
    Scenario: A long error is summarised, with detail on demand
      Then an error shows one readable line
      And the full text is available in a disclosure or a details view

  Rule: Side panels fit the reader's screen

    @must
    Scenario: A side panel can be hidden and shown again
      Given the page has a left or a right panel next to the conversation
      And each panel has a visible toggle button with an accessible name
      When I press the toggle
      Then the panel hides and the conversation takes its width
      And pressing the toggle again brings the panel back at the width it had

    @must
    Scenario: A side panel can be resized on desktop
      Given a side panel is open on a desktop-width screen
      When I drag the edge between the panel and the conversation
      Then the panel width follows the pointer
      And it stops at a minimum and a maximum width
      And the conversation never gets narrower than a readable minimum

    @must
    Scenario: Panel sizes and visibility survive a reload
      Given I resized or hid a side panel
      When I reload the page
      Then each panel has the same width and the same visibility

    @must
    Scenario: What is inside a panel adapts to its width
      When a side panel or the conversation is resized to any allowed width
      Then nothing inside it overflows sideways or is cut off
      And controls that no longer fit move into a menu or wrap

    @must
    Scenario: On a phone, side panels open over the conversation
      Given the screen is phone width
      Then no side panel takes width from the conversation
      And each panel opens from a button and covers the conversation until closed
      And there is no drag edge

    @should
    Scenario: Each panel toggle has a keyboard shortcut
      Then each side panel can be shown and hidden with a documented shortcut, such as Cmd+B for the left and Cmd+J for the right

    @should
    Scenario: A double click on the drag edge restores the default width
      When I double click the edge of a side panel
      Then the panel returns to its default width

  Rule: Signing in and out is plain and complete

    @must
    Scenario: A signed-out visitor sees one way in
      Given I am not signed in
      When I open any page of the app
      Then I see what the app does and one clear sign-in button
      And no conversation, file, or setting of anyone is shown

    @must
    Scenario: The API refuses a caller who is not signed in
      Given I am not signed in
      When a script calls the app's API
      Then it gets 401 with a short reason and where to sign in
      And not a sign-in page with status 200

    @must
    Scenario: The first sign-in asks only what it needs, then lands somewhere useful
      When I sign in for the first time
      Then I am asked for anything the app cannot work without, such as which account pays for models
      And then I land in the app, ready to type

    @must
    Scenario: A cancelled or failed sign-in says why
      When I cancel on the identity provider's screen or it fails
      Then I come back to the sign-in page with one plain line about what went wrong
      And a way to try again

    @must
    Scenario: Who I am is always one click away
      Given I am signed in
      Then the page shows which identity is signed in, or opens it from one visible control

    @must
    Scenario: Signing out is one visible control
      Given I am signed in
      Then a "Sign out" control is visible in the app, without opening settings
      When I use it
      Then my session ends on the server, not only in this tab
      And I land on the signed-out page

    @must
    Scenario: After signing out, nothing private is reachable
      Given I signed out
      When I press Back or reload a page I had open
      Then I see the signed-out page
      And the API answers 401

    @should
    Scenario: Signing out revokes what the app was granted
      When I sign out
      Then the app gives back the tokens it held for me, so they cannot be used again

    @should
    Scenario: An expired session sends me to sign in, keeping my place
      Given my session expired while the page was open
      When I act on the page
      Then I am told to sign in again instead of seeing a broken page
      And after signing in I return to where I was

  Rule: The page works for everyone

    @must
    Scenario: The transcript is a polite live region
      Then the transcript is a log or aria-live="polite" region with a heading

    @must
    Scenario: Motion respects the system setting
      Given reduced motion is on
      Then streaming, spinners, and smooth scrolls do not animate

    @must
    Scenario: Every icon button has a name
      Then every icon-only button has an accessible label

    @must
    Scenario: No text sits on top of other text
      Given the chat on a desktop and on a phone, idle and while a turn runs
      Then no visible text, placeholder, or label overlaps any other text

    @should
    Scenario: Notifications have a keyboard shortcut
      Then the notification region is reachable with a documented shortcut such as Alt+T

  Rule: The first screen invites a first message

    @must
    Scenario: The empty state offers starters
      When there are no messages
      Then the page asks a plain question such as "How can I help you?"
      And offers three to five one-click starters

    @should
    Scenario: Starters belong to the owner
      Then the owner can edit the starter list in Settings

    @should
    Scenario: The copy names the outcome, not the feature
      Then the empty-state copy says what the reader gets, in one short line
