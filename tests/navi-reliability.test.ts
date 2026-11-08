import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseNaviModelResponse,
  naviQuoteMatches,
  NaviResponseFormatError,
} from '../lib/navi-model-response';
import { naviConversation } from '../lib/navi-server';
import { installAIEnvironment } from '../lib/ai-environment';
import { naviContextSchema, verifyNaviAnswer } from '../lib/navi-context';
import {
  searchNaviWebSources,
  naviWebContext,
  safeNaviWebURL,
} from '../lib/navi-web-sources';

const answer = {
  reply: 'Add the same quantity to both sides.',
  citations: [],
  supplementary: true,
};
test('Navi reads final content without leaking reasoning or inventing a truncated answer', () => {
  assert.deepEqual(
    parseNaviModelResponse({
      result: {
        response:
          '<think>private {"reply":"wrong"}</think>\n```json\n' +
          JSON.stringify(answer) +
          '\n```',
      },
    }),
    answer,
  );
  assert.deepEqual(
    parseNaviModelResponse({
      choices: [
        {
          message: {
            reasoning_content: 'never display',
            content: [{ type: 'text', text: JSON.stringify(answer) }],
          },
        },
      ],
    }),
    answer,
  );
  assert.deepEqual(
    parseNaviModelResponse({
      response: 'Here is the result:\n' + JSON.stringify(answer),
    }),
    answer,
  );
  assert.throws(
    () =>
      parseNaviModelResponse({ response: '<think>{"reply":"internal draft"}' }),
    NaviResponseFormatError,
  );
  assert.throws(
    () =>
      parseNaviModelResponse({
        choices: [
          {
            finish_reason: 'length',
            message: { content: JSON.stringify(answer) },
          },
        ],
      }),
    NaviResponseFormatError,
  );
  assert.throws(
    () =>
      parseNaviModelResponse({
        response: JSON.stringify(answer) + '\n' + JSON.stringify(answer),
      }),
    NaviResponseFormatError,
  );
});
const source = naviContextSchema.parse({
  context_type: 'question',
  source_id: 'q1',
  source_version: 'v1',
  title: 'Equations',
  relevant_content: JSON.stringify({
    prompt: 'Both sides contain "x".\nKeep the equality.',
  }),
  selected_text: '',
  related_question_ids: ['q1'],
  knowledge_refs: [],
  source_location: {},
  provenance: 'question',
});
test('citation checks recognize escaped source text and whitespace without accepting invented words or versions', () => {
  assert.ok(
    naviQuoteMatches(
      source.relevant_content,
      'Both sides contain "x". Keep the equality.',
    ),
  );
  assert.ok(
    verifyNaviAnswer(
      {
        ...answer,
        citations: [
          {
            source_id: 'q1',
            source_version: 'v1',
            quote: 'Both sides contain "x".\nKeep the equality.',
          },
        ],
      },
      [source],
    ),
  );
  assert.throws(() =>
    verifyNaviAnswer(
      {
        ...answer,
        citations: [
          {
            source_id: 'q1',
            source_version: 'v1',
            quote: 'Both sides contain y.',
          },
        ],
      },
      [source],
    ),
  );
  assert.throws(() =>
    verifyNaviAnswer(
      {
        ...answer,
        citations: [
          {
            source_id: 'q1',
            source_version: 'v2',
            quote: 'Keep the equality.',
          },
        ],
      },
      [source],
    ),
  );
});
test('Navi retries format/citation failures once, preserves strict schemas, and never retries authentication errors', async () => {
  const original = globalThis.fetch;
  let calls: any[] = [];
  installAIEnvironment((name) =>
    name === 'CF_ACCOUNT_ID'
      ? 'a'.repeat(32)
      : name === 'CF_AI_TOKENS'
        ? '["test-only"]'
        : '',
  );
  const request = {
    message: 'Explain equality',
    contexts: [source],
    history: [],
    locale: 'en',
    tutor: { mode: 'auto', helpLevel: 1 },
  };
  try {
    globalThis.fetch = async (_url, init) => {
      calls.push(JSON.parse(String(init?.body)));
      return Response.json({
        result: {
          response:
            calls.length === 1 ? '<think>truncated' : JSON.stringify(answer),
        },
      });
    };
    assert.deepEqual(await naviConversation(request), answer);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].response_format.type, 'json_schema');
    calls = [];
    globalThis.fetch = async () => {
      calls.push(1);
      return Response.json({
        response: JSON.stringify({
          ...answer,
          citations: [
            {
              source_id: 'q1',
              source_version: 'v1',
              quote: 'not in this source',
            },
          ],
        }),
      });
    };
    await assert.rejects(
      naviConversation(request),
      (e: any) => e.code === 'citation',
    );
    assert.equal(calls.length, 2);
    calls = [];
    globalThis.fetch = async () => {
      calls.push(1);
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    };
    await assert.rejects(naviConversation(request));
    assert.equal(calls.length, 1);
  } finally {
    globalThis.fetch = original;
    installAIEnvironment(() => '');
  }
});
test('understanding checks have no score authority and reviewing an answer cannot issue setting actions', async () => {
  assert.throws(() =>
    verifyNaviAnswer(
      { ...answer, understanding_check: { question: 'Why?', mastery: 1 } },
      [],
    ),
  );
  const original = globalThis.fetch;
  installAIEnvironment((name) =>
    name === 'CF_ACCOUNT_ID'
      ? 'a'.repeat(32)
      : name === 'CF_AI_TOKENS'
        ? '["test-only"]'
        : '',
  );
  globalThis.fetch = async () =>
    Response.json({
      response: JSON.stringify({
        ...answer,
        understanding_check: {
          question: 'What happens if we add 2 to only one side?',
        },
        configuration_actions: [{ type: 'setDailyTime', minutes: 120 }],
      }),
    });
  try {
    const result = await naviConversation({
      message: 'Because equality must be preserved.',
      contexts: [source],
      history: [],
      locale: 'en',
      tutor: {
        mode: 'auto',
        helpLevel: 1,
        check: {
          phase: 'review',
          question: 'Why add to both sides?',
          answer: 'To preserve equality.',
        },
      },
    });
    assert.ok(result.understanding_check);
    assert.equal(result.configuration_actions, undefined);
  } finally {
    globalThis.fetch = original;
    installAIEnvironment(() => '');
  }
});
test('online references transmit only an explicit query and create versioned, non-executable citations', async () => {
  const original = globalThis.fetch;
  let url = '',
    options: any;
  globalThis.fetch = async (input, init) => {
    url = String(input);
    options = init;
    return Response.json({
      query: {
        pages: [
          {
            pageid: 123,
            title: 'Equality',
            revisions: [{ revid: 456 }],
            extract: 'An equality is a relation between expressions.',
          },
        ],
      },
    });
  };
  try {
    const results = await searchNaviWebSources('equality', 'en');
    assert.equal(new URL(url).searchParams.get('gsrsearch'), 'equality');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.headers, undefined);
    const context = naviWebContext(results[0]);
    assert.equal(context.source_version, 'revision-456');
    assert.equal(context.provenance, 'web-reference');
    assert.ok(
      verifyNaviAnswer(
        {
          ...answer,
          citations: [
            {
              source_id: context.source_id,
              source_version: context.source_version,
              quote: 'An equality is a relation between expressions.',
            },
          ],
        },
        [context],
      ),
    );
    assert.equal(safeNaviWebURL('javascript:alert(1)'), null);
    assert.equal(
      safeNaviWebURL('https://en.wikipedia.org.evil.example/'),
      null,
    );
    assert.equal(
      safeNaviWebURL('https://user:password@en.wikipedia.org/'),
      null,
    );
  } finally {
    globalThis.fetch = original;
  }
});
