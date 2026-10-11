// The one place for names and tunable numbers. Change them here, nowhere else.

export const GAME_NAME = 'Zero Hour';
export const BUSINESS_NAME = 'Lochside Energy';   // fictional, like everything in the scenario

export const DATA_PATHS = {
  challenge: '/1-foundation/data/challenge.json',
  questions: '/1-foundation/data/questions.json',
  moreQuestions: '/data/more-questions.json',   // our own extra quiz topics, for the team battle
};

// Behaviour checkpoint rules (see BRIEF.html: at most 2 minutes per checkpoint).
export const CHECKPOINT_SECONDS = 120;
export const QUESTIONS_PER_CHECKPOINT = 4;   // 4 x 30 seconds fits the 2-minute limit
export const POINTS_PER_SECURE_ANSWER = 2;
