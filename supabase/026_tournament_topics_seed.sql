-- Seeds core_topic + a scoped topics[] bank for the tournaments that exist
-- today (matched by name — safe no-op if a name doesn't exist in your
-- table yet). Add more `update ... where name = '...'` blocks below any
-- time you create a new emergency league or flagship tournament.

update eztren.tournaments
set core_topic = 'AI regulation',
    topics = array[
      'This house would require companies to test AI systems for bias before release.',
      'This house would grant legal personhood to advanced AI systems.',
      'This house would require every government to license large AI models before deployment.',
      'This house would ban fully autonomous weapons systems from military use.',
      'This house would hold an AI company as legally liable as its human employees for harm caused.',
      'This house would require AI-generated content to be labeled by law.',
      'This house would pause frontier AI development until international safety standards exist.',
      'This house would treat AI training on copyrighted work as theft, not fair use.',
      'This house would require open-sourcing of any AI model above a safety-relevant capability threshold.',
      'This house would give workers a legal right to know when AI is used in hiring decisions.',
      'This house would make AI companies fund retraining for jobs their products displace.',
      'This house would ban AI companion apps marketed to minors.'
    ]
where name = 'Emergency League: AI Regulation';

update eztren.tournaments
set core_topic = 'the America-Iran conflict',
    topics = array[
      'This house believes external military intervention makes regional conflict worse, not better.',
      'This house would lift sanctions in exchange for verified nuclear disarmament.',
      'This house believes economic sanctions primarily harm civilians rather than governments.',
      'This house would support an international body over unilateral national action in this conflict.',
      'This house believes regime change imposed from outside a country rarely produces lasting stability.',
      'This house would prioritize diplomatic backchannels over public ultimatums in a nuclear standoff.',
      'This house believes a nation''s right to self-defense justifies preemptive military action.',
      'This house would hold that media coverage of this conflict shapes public opinion more than the facts on the ground.'
    ]
where name = 'Emergency League: America\u2013Iran';

-- Flagship tournaments: no single "emergency" subject, so core_topic stays
-- null (no AI relevance-gate on the topic negotiation) but they still get
-- a topics[] bank so the placeholder/auto-assign rotation feels tailored
-- to a competitive/promotion context rather than the fully generic bank.
update eztren.tournaments
set topics = array[
  'This house would require every promotion match to be judged by a panel, not a single AI.',
  'This house believes the higher-ranked player should have to defend the more difficult side.',
  'This house would give challengers, not incumbents, the choice of debate format.',
  'This house believes a rating system rewards consistency over brilliance.',
  'This house would seed tournaments by recent form rather than all-time rank.'
]
where type = 'promotion' and core_topic is null;

update eztren.tournaments
set topics = array[
  'This house believes the single highest-ranked player title creates worse incentives than a rotating championship.',
  'This house would let the reigning number one choose their next challenger.',
  'This house believes defending a title is a harder task than winning it.',
  'This house would strip ranking points for a walkover win.',
  'This house believes a league table rewards volume over quality of wins.'
]
where type = 'flagship' and core_topic is null;
