export const MAP_TEMPLATES: Record<string, Record<string, unknown>> = {
  mcq: {
    prompt: 'What does the word restore mean in the passage?',
    passage:
      'The volunteers repaired the broken benches and planted flowers to restore the park to its former condition.',
    choices: [
      'Return to a former condition',
      'Move to a new location',
      'Remove permanently',
      'Visit regularly',
    ],
    answer: 'Return to a former condition',
    skill: 'Vocabulary in Context',
    explanation:
      'The repairs return the park to its former condition. The other choices do not describe repairing it.',
  },
  multi_select: {
    prompt: 'Which two details show that Maya prepared for the hike?',
    passage:
      'Maya checked the forecast and packed a raincoat. Her friend arrived late. The trail passed a lake.',
    choices: [
      'She checked the forecast.',
      'She packed a raincoat.',
      'Her friend arrived late.',
      'The trail passed a lake.',
    ],
    answer: ['She checked the forecast.', 'She packed a raincoat.'],
    selectCount: 2,
    skill: 'Supporting Details',
    explanation:
      'Checking weather and packing protection are preparation actions; the other details describe the friend and the setting.',
  },
  two_part: {
    prompt: 'Answer both parts.',
    passage:
      'Although her first experiment failed, Nora adjusted the design and tried again. She continued for a week until the device worked.',
    parts: [
      {
        prompt: 'What trait does Nora show?',
        choices: ['Persistence', 'Carelessness', 'Impatience', 'Indifference'],
        answer: 'Persistence',
      },
      {
        prompt: 'Which detail best supports your answer?',
        choices: [
          'She continued for a week.',
          'The first experiment failed.',
          'The device was new.',
          'She was at school.',
        ],
        answer: 'She continued for a week.',
      },
    ],
    answer: ['Persistence', 'She continued for a week.'],
    skill: 'Inference and Evidence',
    explanation:
      'Nora persists despite failure. Continuing for a week directly supports this inference.',
  },
  gap_match: {
    prompt: 'Move the words into the blanks.',
    passage:
      'We wanted to play outdoors. {{1}}, it began to rain. {{2}}, we stayed inside.',
    choices: ['However', 'Therefore', 'Likewise'],
    answer: ['However', 'Therefore'],
    skill: 'Transitions',
    explanation:
      'However introduces a contrast; Therefore introduces the resulting decision. Likewise does not fit either relationship.',
  },
  hot_text: {
    prompt: 'Choose the incorrect pronoun, then correct the error.',
    passage:
      'Maya and [I] brought several books. [We] placed [it] on the shelf.',
    tokens: ['I', 'We', 'it'],
    answer: 'it',
    correction: 'them',
    skill: 'Pronoun Agreement',
    explanation:
      'Books is plural, so the pronoun must be them. I correctly joins Maya as a subject and We refers to both people.',
  },
  text_entry: {
    prompt: 'Correct the verb: The students walks to school.',
    answer: 'walk',
    skill: 'Subject-Verb Agreement',
    explanation:
      'The plural subject students takes the base present-tense verb walk.',
  },
};
export function mapTemplate(type: string, section = 'Reading', grade = 8) {
  return JSON.stringify(
    {
      schemaVersion: 1,
      exam: 'MAP',
      title: 'MAP ' + section + ' 专项练习',
      grade,
      testCount: 1,
      flow: [
        {
          id: 'map',
          label: section,
          section,
          type: 'map',
          durationSeconds: 0,
          count: 1,
        },
      ],
      sectionsInline: {
        map: {
          questions: [
            { id: 'q1', type, difficulty: 3, ...MAP_TEMPLATES[type] },
          ],
        },
      },
    },
    null,
    2,
  );
}
