import { IMPORT_EXAMPLE } from './import-skill';
export function learningTemplate(type: string) {
  const pack: any = structuredClone(IMPORT_EXAMPLE),
    q = pack.questions[0];
  pack.manifest.id = 'manual-' + type;
  pack.manifest.title = '手动' + type + '练习包';
  q.id = 'manual-' + type + '-001';
  q.type = type;
  q.source = '手动录入';
  delete q.solution;
  delete q.options;
  if (type === 'choice')
    q.options = ['$(2,3)$', '$(-2,3)$', '$(2,-3)$', '$(-2,-3)$'];
  if (type === 'blank') {
    q.prompt = '函数 $y=(x-2)^2+3$ 的顶点横坐标是 ____。';
    q.answer = '2';
  }
  if (type === 'matching') {
    q.prompt = '将函数与顶点对应。';
    q.matching = {
      left: [
        { id: 'L1', text: '$y=x^2$' },
        { id: 'L2', text: '$y=(x-2)^2+3$' },
      ],
      right: [
        { id: 'R1', text: '$(2,3)$' },
        { id: 'R2', text: '$(0,0)$' },
      ],
    };
    q.answer = JSON.stringify({ L1: 'R2', L2: 'R1' });
  }
  if (type === 'subjective') {
    q.prompt = '解释如何从顶点式确定二次函数的顶点。';
    q.answer = '顶点式 y=(x-h)²+k 的顶点为 (h,k)。';
    q.rubric = [
      {
        id: 'method',
        title: '说明方法',
        max: 2,
        description: '正确指出 h 与 k 对应顶点坐标。',
        skillId: 'vertex',
      },
    ];
  }
  if (type === 'pinyin') {
    pack.manifest.subject = 'chinese';
    const n = pack.knowledge[0];
    n.subject = 'chinese';
    n.title = '沮丧';
    n.course = '语文';
    n.unit = '字词';
    n.chapter = '藤野先生字词';
    q.subject = 'chinese';
    q.prompt = 'jǔ sàng';
    q.answer = '沮丧';
    q.explanation = '';
    q.collectionId = 'example-tengye-words';
    q.collectionTitle = '藤野先生字词';
  }
  return JSON.stringify(pack, null, 2);
}
export const EXAM_TASK_TEMPLATES: Record<string, any> = {
  mcq: {
    prompt: 'Why is the library closed?',
    passage: 'The library is closed for maintenance.',
    choices: ['For repairs.', 'For a party.'],
    correct: 0,
    explanation: 'Maintenance means keeping the facility in good condition.',
  },
  complete_words: {
    prompt: 'Fill in the missing letters.',
    passage: 'A dig____ map shows the route.',
    parts: [{ visiblePrefix: 'dig', missingLength: 4, answer: 'digital' }],
    explanation: 'Digital maps are displayed electronically.',
  },
  build_sentence: {
    prompt: 'Build a grammatical sentence.',
    words: ['She', 'reads', 'every day', '.'],
    slots: 4,
    answer: 'She reads every day .',
    explanation: 'Use subject, verb and time expression in this order.',
  },
  write_email: {
    prompt: 'Write an email asking about library opening hours.',
    to: 'library@example.com',
    subject: 'Opening hours',
    answer:
      'Dear librarian, Could you tell me when the library opens on Saturday? Thank you.',
    explanation:
      'State your question clearly and use a polite greeting and closing.',
  },
  academic_discussion: {
    prompt: 'Should libraries provide more digital books?',
    professorPrompt: 'Discuss the benefits of digital books.',
    posts: [{ name: 'Alex', text: 'Digital books are easy to access.' }],
    answer:
      'Digital books improve access for students who live far from the library, though printed copies should remain available.',
    explanation: 'Give a position, a reason, and a concrete explanation.',
  },
  listen_response: {
    prompt: 'Choose the best response.',
    audioText: 'When does the library open?',
    choices: ['At nine in the morning.', 'On the second floor.'],
    correct: 0,
    explanation: 'When asks for a time.',
  },
  conversation: {
    prompt: 'When can the student use the room?',
    audioText:
      'Student: Is the study room available? Librarian: Yes, after three o’clock.',
    choices: ['After three.', 'Before nine.'],
    correct: 0,
    explanation: 'The librarian explicitly says after three.',
  },
  announcement: {
    prompt: 'What is the announcement about?',
    audioText: 'The library will close at six today for maintenance.',
    choices: ['A change in hours.', 'A new book.'],
    correct: 0,
    explanation: 'The announcement tells users when the library closes.',
  },
  lecture: {
    prompt: 'What do plants use sunlight for?',
    audioText: 'Plants use sunlight to produce sugars through photosynthesis.',
    choices: ['To produce sugars.', 'To absorb sound.'],
    correct: 0,
    explanation: 'Photosynthesis uses light energy to produce sugars.',
  },
  listen_repeat: {
    prompt: 'Listen and repeat.',
    audioText: 'The library closes at six today.',
    responseSeconds: 10,
    answer: 'The library closes at six today.',
    explanation:
      'Check whether all words are repeated clearly and in the correct order.',
  },
  interview: {
    prompt: 'Answer the question.',
    audioText: 'Where do you prefer to study, and why?',
    responseSeconds: 45,
    answer:
      'I prefer the library because it is quiet and has useful reference books.',
    explanation: 'State a preference and support it with clear reasons.',
  },
};
export function examTaskTemplate(type: string) {
  const q = EXAM_TASK_TEMPLATES[type];
  const section = [
    'write_email',
    'academic_discussion',
    'build_sentence',
  ].includes(type)
    ? 'Writing'
    : ['listen_repeat', 'interview'].includes(type)
      ? 'Speaking'
      : ['listen_response', 'conversation', 'announcement', 'lecture'].includes(
            type,
          )
        ? 'Listening'
        : 'Reading';
  return JSON.stringify(
    {
      schemaVersion: 1,
      exam: 'TOEFL',
      title: '手动托福' + section + '练习',
      flow: [
        {
          id: section.toLowerCase(),
          label: section,
          type: 'toefl-' + section.toLowerCase(),
          durationSeconds:
            section === 'Writing' ? 1380 : section === 'Speaking' ? 60 : 120,
          count: 1,
        },
      ],
      sectionsInline: {
        [section.toLowerCase()]: {
          questions: [{ id: 'manual-1', type, skill: type, ...q }],
        },
      },
    },
    null,
    2,
  );
}
