import type {Mode} from './identity'

// ---------- Daily questions (answers reveal only once both have answered) ----------

const DAILY_SHARED = [
  'What made you smile today, even a little?',
  'What is a small thing that instantly improves your mood?',
  'If we had a free day tomorrow with zero obligations, what would we do?',
  'What song has been stuck in your head lately?',
  'What is something you are quietly proud of this week?',
  'Which memory of us do you replay the most?',
  'What is a skill you wish you could learn overnight?',
  'What is the best thing you ate recently?',
  'If you could teleport anywhere for one hour right now, where?',
  'What is something you are looking forward to this month?',
  'What is a hill you are willing to die on?',
  'Describe your perfect lazy Sunday.',
  'What is a movie or show you could rewatch forever?',
  'What would your 10-year-old self think of you now?',
  'What is one thing that drained your energy this week?',
  'What is your current comfort food?',
  'What is the most useful advice you have ever received?',
  'If your life had a theme song right now, what would it be?',
  'What is a tiny luxury that is totally worth it?',
  'Which season fits your personality best, and why?',
  'What is a fear you have gotten over?',
  'What is something that always makes you laugh?',
  'What would you do with an extra hour every day?',
  'What is the last thing you googled?',
  'What are three words that describe this week for you?'
]

const DAILY_FRIENDS = [
  'When did you first think "okay, we are going to be friends"?',
  'What is the most chaotic thing we have done together?',
  'What is an inside joke of ours that still gets you?',
  'What is one thing you would want me to always be honest with you about?',
  'If we started a business together, what would it be?',
  'Which fictional duo are we most like?',
  'What trip should we absolutely take together?',
  'What is something you have never told me but think I would find funny?',
  'How can I be a better friend to you this month?',
  'What is a tradition we should start?',
  'What is your most-used emoji when texting me, and why?',
  'Rate our friendship as a movie genre.',
  'What is a dare you would actually do with me?',
  'What is your favorite version of me (mood, era, outfit)?',
  'What is something we disagree about that you secretly respect?',
  'If we swapped lives for a day, what would you do first?',
  'Which of my habits rubbed off on you?',
  'What is one place that reminds you of me?',
  'What are you grateful I was there for?',
  'What is the best gift you have ever received from a friend?'
]

const DAILY_COUPLE = [
  'What did I do recently that made you feel loved?',
  'When did you realize you had feelings for me?',
  'What is your favorite way I show affection?',
  'What is one small thing I could do tomorrow to make your day?',
  'Which date of ours would you relive exactly the same?',
  'What is something you want us to try together this year?',
  'What do you find most attractive about me that I might not know?',
  'How do you prefer to be comforted when you are stressed?',
  'What is your favorite physical feature of mine?',
  'What does a perfect anniversary look like to you?',
  'What is a dream you have for "us" in five years?',
  'What is something new you learned about me recently?',
  'What is your love language today: words, time, touch, gifts or acts?',
  'What is a song that makes you think of us?',
  'When do you feel closest to me?',
  'What is a habit of mine you secretly find adorable?',
  'What is one thing you want to hear from me more often?',
  'What is a place you want to kiss me at least once?',
  'What is something you appreciate about how we handle disagreements?',
  'How should we celebrate our next small win?',
  'What is a memory of us that feels like a movie scene?',
  'What do you miss most when we are apart?',
  'What is one way I have helped you grow?',
  'If we wrote a book about us, what would the title be?'
]

export const dailyQuestions = (mode: Mode) => [...DAILY_SHARED, ...(mode === 'couple' ? DAILY_COUPLE : DAILY_FRIENDS)]

// ---------- Would you rather ----------

export const WOULD_YOU_RATHER: [string, string][] = [
  ['Travel to the past', 'Travel to the future'],
  ['Beach holiday', 'Mountain cabin'],
  ['Always be 10 minutes late', 'Always be 20 minutes early'],
  ['Pizza forever', 'Tacos forever'],
  ['Read minds', 'Be invisible'],
  ['Live in a big city', 'Live in the countryside'],
  ['Have a rewind button', 'Have a pause button'],
  ['Only text', 'Only call'],
  ['Sunrise', 'Sunset'],
  ['Cats', 'Dogs'],
  ['Never use social media again', 'Never watch TV again'],
  ['Fly', 'Breathe underwater'],
  ['Be famous', 'Be rich and unknown'],
  ['Road trip', 'Flight + resort'],
  ['Know how you die', 'Know when you die'],
  ['Cook every meal', 'Wash every dish'],
  ['Talk to animals', 'Speak every language'],
  ['Summer forever', 'Winter forever'],
  ['A surprise party', 'A quiet dinner'],
  ['Live without music', 'Live without movies'],
  ['Morning person', 'Night owl'],
  ['Explore space', 'Explore the deep ocean'],
  ['Unlimited flights', 'Unlimited food delivery'],
  ['Relive your best day', 'Skip your worst day'],
  ['Always have to sing', 'Always have to dance'],
  ['Be a wizard', 'Be a superhero'],
  ['Have a personal chef', 'Have a personal driver'],
  ['Be stuck in a lift with your boss', 'Be stuck in a lift with your ex'],
  ['Netflix and chill', 'Go out dancing'],
  ['Plan every detail', 'Go with the flow']
]

// ---------- Truth or dare ----------

export const TRUTHS: Record<Mode, string[]> = {
  friends: [
    'What is the most embarrassing thing in your camera roll?',
    'Who was your first crush?',
    'What is a lie you told me that I never found out about?',
    'What is the weirdest thing you do when alone?',
    'Have you ever pretended to like a gift I gave you?',
    'What is your most irrational fear?',
    'What is the last thing you cried about?',
    'What is your guilty pleasure song?',
    'What is the most trouble you have ever been in?',
    'What is one thing you would change about our friendship?',
    'Who do you text the most besides me?',
    'What is the pettiest thing you have ever done?',
    'What is something you have never told anyone?',
    'What was your first impression of me?',
    'What is the worst date you have been on?'
  ],
  couple: [
    'What was your first impression of me – honestly?',
    'What is something you have always wanted to tell me but did not?',
    'When was the moment you knew you liked me?',
    'What is your favorite memory of our first month?',
    'What is the most romantic thing you have ever imagined us doing?',
    'Have you ever been jealous and not told me?',
    'What outfit of mine do you like most?',
    'What is something about me that surprised you?',
    'What is your favorite way to be kissed?',
    'What is a fantasy date you have never suggested?',
    'Which of my friends do you like the most?',
    'What is a habit of mine that annoys you – just a bit?',
    'What is one thing you wish we did more often?',
    'What song would you dedicate to me right now?',
    'What is the cheesiest thing you have thought about me?'
  ]
}

export const DARES: Record<Mode, string[]> = {
  friends: [
    'Send me the 5th photo in your gallery.',
    'Change your profile emoji to one I pick for 24 hours.',
    'Send a voice note singing the chorus of your favorite song.',
    'Text your last contact "I know what you did" (then explain!).',
    'Do your best impression of me in a voice note.',
    'Send a selfie with the weirdest face you can make.',
    'Describe me using only three emojis.',
    'Send me a screenshot of your screen time.',
    'Write a 4-line poem about our friendship.',
    'Tell me a joke – if I do not laugh, another dare.',
    'Draw me in the doodle pad in 30 seconds.',
    'Speak in an accent for the next 3 messages.'
  ],
  couple: [
    'Send me a voice note saying three things you love about me.',
    'Send a selfie doing your best "smoldering" look.',
    'Describe our perfect date in exactly 10 words.',
    'Write me a two-line love poem right now.',
    'Draw a heart in the doodle pad and sign it.',
    'Send me a song that describes your feelings today.',
    'Recreate our first photo together (as best you can).',
    'Plan our next date – full itinerary – in one message.',
    'Send a voice note whispering goodnight.',
    'Set my photo as your lock screen for a day.',
    'Tell me your favorite thing about my laugh.',
    'Give me a compliment you have never given before.'
  ]
}

// ---------- This or that quick-fire ----------

export const THIS_OR_THAT: [string, string][] = [
  ['Coffee', 'Tea'],
  ['Texting', 'Calling'],
  ['Sweet', 'Salty'],
  ['Books', 'Movies'],
  ['Stay in', 'Go out'],
  ['Rain', 'Sunshine'],
  ['Spontaneous', 'Planned'],
  ['Window seat', 'Aisle seat'],
  ['Hugs', 'High-fives'],
  ['Breakfast', 'Dinner'],
  ['Mountains', 'Sea'],
  ['Early bird', 'Night owl']
]

// ---------- Ideas ----------

export const DATE_IDEAS = [
  'Cook a dish from a country neither of you has visited',
  'Sunrise walk with coffee',
  'Build a blanket fort and watch a childhood movie',
  'Synchronized movie night over video call',
  'Write letters to open in one year',
  'Thrift-store challenge: buy each other an outfit under a budget',
  'Stargazing with a sky-map app',
  'Take a pottery or dance class',
  'Picnic in a park you have never visited',
  'Recreate your first date',
  'Board game café afternoon',
  'Make a playlist for each other',
  'Visit a museum and pick each other\'s favorite piece',
  'Try a new cuisine together',
  'Do a puzzle while on a call',
  'Photo walk: 10 photos with a theme',
  'Bake something and rate it like judges',
  'Plan a dream trip down to the hour',
  'Karaoke night (even at home)',
  'Volunteer together for a morning'
]

// ---------- Moods ----------

export const MOODS = [
  {emoji: '🥰', label: 'Loved'},
  {emoji: '😄', label: 'Happy'},
  {emoji: '😌', label: 'Calm'},
  {emoji: '🤩', label: 'Excited'},
  {emoji: '😴', label: 'Tired'},
  {emoji: '😐', label: 'Meh'},
  {emoji: '😔', label: 'Down'},
  {emoji: '😣', label: 'Stressed'},
  {emoji: '😤', label: 'Annoyed'},
  {emoji: '🤒', label: 'Unwell'},
  {emoji: '🥺', label: 'Missing you'},
  {emoji: '🔥', label: 'Motivated'}
]

export const LOW_MOODS = new Set(['Down', 'Stressed', 'Annoyed', 'Unwell', 'Tired', 'Missing you'])

export const STATUSES = ['Free to talk', 'Busy', 'At work', 'Studying', 'Driving', 'Sleeping', 'Gaming', 'Working out']

// ---------- Touches ("thinking of you" taps) ----------

export const TOUCHES: Record<string, {emoji: string; label: string; vib: number[]}> = {
  heart: {emoji: '❤️', label: 'Sent a heart', vib: [60, 80, 60]},
  hug: {emoji: '🤗', label: 'Sent a hug', vib: [300]},
  kiss: {emoji: '😘', label: 'Sent a kiss', vib: [40, 60, 40, 60, 40]},
  poke: {emoji: '👉', label: 'Poked you', vib: [20, 40, 20]},
  highfive: {emoji: '🙌', label: 'High five!', vib: [80]},
  miss: {emoji: '🥺', label: 'Misses you', vib: [200, 100, 200]},
  hi: {emoji: '👋', label: 'Says hi', vib: [30]}
}

export const touchesFor = (mode: Mode) => (mode === 'couple' ? ['heart', 'kiss', 'hug', 'miss', 'poke'] : ['hi', 'highfive', 'hug', 'poke', 'heart'])

export const OPEN_WHEN = [
  'Open when you miss me',
  'Open when you can\'t sleep',
  'Open when you had a bad day',
  'Open when you need a laugh',
  'Open when you are proud of yourself',
  'Open when you feel stressed',
  'Open on your birthday'
]

export const STICKERS = ['❤️', '🥰', '😂', '🥺', '🔥', '✨', '🎉', '🤗', '😘', '👀', '💯', '🌹', '🍕', '☕', '🫶', '😴']

// ---------- Wallpapers ----------

export const GRADIENTS: Record<string, string> = {
  dusk: 'radial-gradient(120% 80% at 10% 0%, #ff7aa2 0%, transparent 55%), radial-gradient(100% 80% at 100% 20%, #7c5cff 0%, transparent 60%), radial-gradient(120% 90% at 50% 100%, #1fb5c9 0%, transparent 60%), #1a1124',
  peach: 'linear-gradient(160deg, #ffd1b3 0%, #ff9a9e 45%, #fad0c4 100%)',
  ocean: 'linear-gradient(170deg, #0f2027 0%, #203a43 50%, #2c5364 100%)',
  mint: 'linear-gradient(150deg, #d4fc79 0%, #96e6a1 100%)',
  lavender: 'linear-gradient(160deg, #e0c3fc 0%, #8ec5fc 100%)',
  midnight: 'radial-gradient(80% 60% at 70% 10%, #3b2a7a 0%, transparent 60%), radial-gradient(70% 50% at 20% 90%, #7a2a5b 0%, transparent 60%), #0b0b14',
  sunset: 'linear-gradient(180deg, #ff512f 0%, #f09819 50%, #ffd194 100%)',
  forest: 'linear-gradient(160deg, #134e5e 0%, #71b280 100%)',
  candy: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
  aurora: 'radial-gradient(90% 60% at 20% 20%, #00f5a0 0%, transparent 55%), radial-gradient(90% 60% at 80% 30%, #00d9f5 0%, transparent 55%), radial-gradient(80% 60% at 50% 90%, #8a2be2 0%, transparent 60%), #071a2b',
  paper: 'linear-gradient(180deg, #fbf6ee 0%, #f3eadb 100%)',
  noir: '#000'
}

export const dailyImageUrl = (seed: string, w = 1080, h = 1920) => `https://picsum.photos/seed/onepair-${seed}/${w}/${h}`
