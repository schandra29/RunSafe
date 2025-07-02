import { callAgentReview } from './agentReview.js';

export interface MultiAgentResult {
  decision: 'APPROVED' | 'REJECTED';
  agentVotes: (string | undefined)[];
  notes: string[];
}

interface Options {
  deterministic?: boolean;
}

export async function multiAgentReview(
  epicContent: string,
  options: Options = {}
): Promise<MultiAgentResult> {
  if (!epicContent || epicContent.trim() === '') {
    return {
      decision: 'REJECTED',
      agentVotes: [],
      notes: ['Malformed epic input'],
    };
  }

  const agentNames = ['Claude', 'Gemini', 'GPT-4', 'Custom'];
  const names = options.deterministic ? [...agentNames].sort() : agentNames;

  const votes: (string | undefined)[] = [];
  const notes: string[] = [];

  for (const name of names) {
    const { vote, note } = await callAgentReview(name, epicContent);
    votes.push(vote);
    notes.push(note ?? '');
  }

  const yes = votes.filter((v) => v === 'APPROVED').length;
  const no = votes.filter((v) => v === 'REJECTED').length;

  const decision: 'APPROVED' | 'REJECTED' =
    yes > no ? 'APPROVED' : 'REJECTED';

  return { decision, agentVotes: votes, notes };
}
