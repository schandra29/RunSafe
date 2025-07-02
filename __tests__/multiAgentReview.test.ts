import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "bun:test";
import { multiAgentReview } from '../src/ai/multiAgentReview.ts';
import * as agentModule from '../src/ai/agentReview.ts';

describe('multiAgentReview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns APPROVED when all agents vote positive', async () => {
    vi
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

  it('returns REJECTED when majority vote negative', async () => {
    const mock = vi.spyOn(agentModule, 'callAgentReview');
    mock
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'ok' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('REJECTED');
  });

  it('returns REJECTED when votes are split evenly', async () => {
    const mock = vi.spyOn(agentModule, 'callAgentReview');
    mock
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'ok' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'ok' })
      .mockResolvedValueOnce({ vote: 'REJECTED', note: 'bad' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('REJECTED');
  });

  it('captures notes from all agents', async () => {
    const mock = vi.spyOn(agentModule, 'callAgentReview');
    mock
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'a' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'b' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'c' })
      .mockResolvedValueOnce({ vote: 'APPROVED', note: 'd' });

    const result = await multiAgentReview('valid epic');
    expect(result.notes).toEqual(['a', 'b', 'c', 'd']);
  });

  it('deterministic mode returns consistent results', async () => {
    vi
      .spyOn(agentModule, 'callAgentReview')
      .mockResolvedValue({ vote: 'APPROVED', note: 'yes' });

    const first = await multiAgentReview('epic', { deterministic: true });
    const second = await multiAgentReview('epic', { deterministic: true });
    expect(first).toEqual(second);
  });

  it('handles malformed epic input gracefully', async () => {
    const result = await multiAgentReview('');
    expect(result.decision).toBe('REJECTED');
    expect(result.agentVotes).toEqual([]);
    expect(result.notes[0]).toMatch(/malformed/i);
  });

  it('handles all agents abstaining', async () => {
    vi
      .spyOn(agentModule, 'callAgentReview')
      .mockResolvedValue({ vote: undefined, note: '' });

    const result = await multiAgentReview('valid epic');
    expect(result.decision).toBe('REJECTED');
    expect(result.agentVotes).toEqual([undefined, undefined, undefined, undefined]);
  });
});
