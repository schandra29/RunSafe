import { jest } from '@jest/globals';
import { multiAgentReview } from '../src/ai/multiAgentReview.js';
import * as agentModule from '../src/ai/agentReview.js';

describe('multiAgentReview', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('returns APPROVED when all agents vote positive', async () => {
    jest
      .spyOn(agentModule, 'callAgentReview')
      .mockResolvedValue({ vote: 'APPROVED', note: 'great' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('APPROVED');
    expect(result.agentVotes).toEqual([
      'APPROVED',
      'APPROVED',
      'APPROVED',
      'APPROVED',
    ]);
    expect(result.notes).toEqual(['great', 'great', 'great', 'great']);
  });

  test('returns REJECTED when majority vote negative', async () => {
    const mock = jest.spyOn(agentModule, 'callAgentReview');
    mock
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'ok' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('REJECTED');
  });

  test('returns REJECTED when votes are split evenly', async () => {
    const mock = jest.spyOn(agentModule, 'callAgentReview');
    mock
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'ok' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'ok' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('REJECTED');
  });

  test('captures notes from all agents', async () => {
    const mock = jest.spyOn(agentModule, 'callAgentReview');
    mock
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'a' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'b' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'c' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'd' });

    const result = await multiAgentReview('valid epic');
    expect(result.notes).toEqual(['a', 'b', 'c', 'd']);
  });

  test('deterministic mode returns consistent results', async () => {
    jest
      .spyOn(agentModule, 'callAgentReview')
      .mockResolvedValue({ vote: 'APPROVED', note: 'yes' });

    const first = await multiAgentReview('epic', { deterministic: true });
    const second = await multiAgentReview('epic', { deterministic: true });
    expect(first).toEqual(second);
  });

  test('handles malformed epic input gracefully', async () => {
    const result = await multiAgentReview('');
    expect(result.decision).toBe('REJECTED');
    expect(result.agentVotes).toEqual([]);
    expect(result.notes[0]).toMatch(/malformed/i);
  });

  test('handles all agents abstaining', async () => {
    jest
      .spyOn(agentModule, 'callAgentReview')
      .mockResolvedValue({ vote: undefined, note: '' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('REJECTED');
    expect(result.agentVotes).toEqual([undefined, undefined, undefined, undefined]);
  });
});
