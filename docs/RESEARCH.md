# Category research: apps for couples & best friends

Ten leading apps in the "two-person" social category, what each does best, and what OnePair borrowed (or deliberately avoided).

| # | App | Audience | Signature features | Business model |
|---|-----|----------|--------------------|----------------|
| 1 | **Between** | Couples | Private 1:1 chat, "D+N" days-together counter, anniversary reminders, shared calendar & photo memories | Freemium |
| 2 | **Paired** | Couples | Daily question where your partner's answer is revealed only after you answer, quizzes, expert-led courses, streaks | Subscription |
| 3 | **Agapé** | Couples | One question a day, light and ad-free | Freemium |
| 4 | **Lovewick** | Couples | Date ideas, conversation starters, games & quizzes | Subscription |
| 5 | **Cupla** | Couples | Shared calendar, automated date-night scheduling, reminders, chat | Freemium |
| 6 | **Widgetable / Couple widgets** | Couples & friends | Home-screen widgets: photos, distance apart, mood, battery, doodles, virtual pet | Freemium |
| 7 | **Bond Touch** (and similar "touch" apps) | Long-distance couples | One-tap haptic "thinking of you" signals | Hardware + app |
| 8 | **Locket** | Close friends | Photos from up to 20 close friends land on your home screen; reactions aren't counted publicly; monthly recap | Free |
| 9 | **BeReal** | Friends | One unfiltered photo per day at a random moment, posting first to see others | Free |
| 10 | **Snapchat** (+ Zenly/Life360 heritage) | Friends | Streaks, Snap Map location, ephemeral media, battery & "last active" | Ads |

Sources: [Habi – 7 best couple apps 2026](https://habi.app/insights/best-couple-apps/), [Cupla – relationship apps guide](https://cupla.app/blog/the-ultimate-guide-to-relationship-management-apps-in-2026/), [Cupla – apps for long-distance couples](https://cupla.app/blog/11-must-have-apps-for-long-distance-couples/), [connectedcouples.app – best couples apps 2026](https://connectedcouples.app/blog/best-couples-apps-2026), [TechCrunch on Locket](https://techcrunch.com/2025/08/06/photo-sharing-app-locket-is-banking-on-a-new-celebrity-focused-feature-to-fuel-its-growth), [SlashGear – apps to stay connected with friends](https://www.slashgear.com/1526286/iphone-apps-stay-connected-with-friends). Most "best of" lists are written by vendors, so the feature descriptions are cross-checked against the apps themselves rather than taken from the rankings.

## What OnePair adopted

| Feature in OnePair | Inspired by | Our twist |
|---|---|---|
| Days-together counter + auto milestones (100, 500, 1000…) and yearly anniversaries | Between | Works for friends too ("friendiversary") |
| Daily question with reveal-after-you-answer | Paired, Agapé | Same question on both phones without a server (deterministic pick per day) |
| Photo of the day, partner's photo blurred until you share yours | Locket, BeReal | No random alarm. You pick the moment, so there's no pressure. |
| Home dashboard: mood, status, battery, local time, distance | Widgetable, Zenly | Shared live over the P2P channel, not stored on a server |
| "Thinking of you" touches with vibration patterns | Bond Touch | Free, no hardware |
| Countdowns, birthdays, memories timeline, "On this day" | Between, Cupla | Memories resurface as gentle nudges |
| Date / hangout ideas, Would You Rather, This or That, Truth or Dare | Lovewick | Mode-aware decks (friends vs couple) |
| Shared doodle canvas | Widgetable, Between | CRDT strokes: both can draw at once, even offline |
| Shared lists (bucket, watch, places, wishlist) | Cupla, Honeydue | |
| Open-when letters, love jar, time capsules | Classic couple-gift idea | Sealed until a date, or until a moment |
| Live location + one-off location messages | Snap Map, Life360 | Only ever visible to your pair, and only while you choose |
| Voice & video calls, voice notes, media, links | Between, Snapchat | Direct P2P, STUN/TURN configurable |

## What OnePair deliberately avoided

- **Loss-framed streaks** (Snapchat). Research links them to compulsive checking and anxiety. OnePair has no streak counter. It recognises effort ("your move", "on this day") and never punishes a missed day.
- **Public metrics and likes** (BeReal, Instagram). Nothing is counted, and there's no audience beyond your pair.
- **Server-side storage and accounts**. Every app above keeps your relationship data in its cloud. OnePair has no server at all.
- **Random-time alarms** (BeReal). They create interruptions and pressure. OnePair's nudges respect quiet hours and your own rhythm.

## Nudge design (psychology)

The nudge engine (`src/lib/nudges.ts`) is built on **Self-Determination Theory**: people sustain behaviours that support *autonomy*, *competence* and *relatedness*.

- **Autonomy.** Three intensity levels (off, gentle, balanced), user-set quiet hours, and "Not now" snoozes a card for three days.
- **Competence.** Every nudge suggests one concrete action that takes under 30 seconds (answer, tap, snap).
- **Relatedness.** Nudges are framed around the other person ("Sam answered today's question"), never around app metrics.
- **Reciprocity and curiosity** drive the strongest nudges (their answer is waiting, their photo is blurred). These are pro-social and need no guilt.
- **Adaptive timing.** The engine learns your median gap between active days and your usual active hour. "Say hi" nudges only fire when a silence is unusual *for you*, and never while you're already connected.
- **Hard caps.** At most one system notification per day on "gentle" and two on "balanced". Each nudge has its own cool-down.
- **Empathy prompts** appear when your pair shares a low mood. These are high-value moments for support.
