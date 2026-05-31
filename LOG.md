[ ] add section to save recent convert, companion, mission pres, senior missionaries, and members contact info and be able to report contacts with them, make repeating contacts
[ ] save recent convert info on where they are on the covenant path
[ ] figure out people section
[ ] figure out weekly planning
[ ] fix moving events between days and make moving them up and down less out of sync
[ ] daily review
[ ] be able to pinch 
[ ] tasks with the checkbox and get crossed out

There is a bug I want you to fix in the calendar section. Here is how the bug plays out. Lets say the day i am currently on is known as the current day. the day i was on prior to swiping to get onto that current day is known as the previous day. the day i swipe to when on the current day to go to a new day is the known as the new day. when going from previous to current to new day quickly (less than 1-2 second delay between swipes), on the swipe from current day to new day, the schedule for previous day flashes onto the screen for a fraction of a second replacing current day right when the swipe to new day is initiated. This happens when 2 or more swipes in any direction (right right, right left, left right, left left) are made in quick succession. Make it so that there is no flash by analyzing and determining why there would be a flash in the first place and then making a detailed plan to fix the bug. before any of that though, explain to me 2 things. 1. based on my explanation, in your own words describe what the bug looks like visually and how it is triggered so that i know that you understand the bug you are targeting. 2. what would be causing the flash? my guess is some kind of async situation or a race condition

Is this reinventing the wheel? The 3-pane recycling approach is the industry standard (Google Calendar, Apple Calendar all use it). react-native-pager-view is the canonical native-backed option, but it is not installed, would require significant refactor, and doesn't integrate naturally with the existing drag-to-edge-scroll feature in DragContext. react-native-reanimated v4 is installed and could eventually provide a cleaner solution (UI-thread animations eliminate bridge latency and the race window), but that is a larger migration. The targeted fix below is the correct minimal fix.

make it so i can scroll even if my finger starts on an event

haptic when dragging event between 30 min blocks

have dark mode colors match actual app