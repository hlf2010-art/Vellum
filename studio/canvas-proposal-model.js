// Pending revisions are views of Copilot's saved answers, never accepted board nodes.
function canvasProposalEntries(state) {
  if (!state) return [];
  const slots = [state, ...Object.values(state.savedQuestions || {})];
  const dismissed = new Set(state.canvasDismissedProposals || []), seen = new Set();
  return slots.flatMap(slot => {
    const turn = slot.turn;
    if (!turn || !['A', 'B'].includes(turn.node) || !turn.plan || !turn.test) return [];
    const key = turn.base + ':' + turn.createdAt;
    if ((dismissed.has(key) && !slot.proposal) || seen.has(key)) return [];
    seen.add(key);
    const proposal = slot.proposal;
    const base = state.versions.find(v => v.id === turn.base);
    if (!base) return [];
    return [{key, slot, turn, base, node: turn.node, shared: !!proposal?.shared,
      plan: proposal?.plan ?? turn.plan, test: proposal?.test ?? turn.test,
      claim: proposal?.claim ?? turn.claim, reason: proposal?.reason ?? turn.reason,
      next: 1 + Math.max(0, ...state.versions.filter(v => v.node === turn.node).map(v => v.num)),
      stale: state.tips[turn.node] !== turn.base || state.tips.C !== turn.claimBase ||
        !!(slot.draft?.text.trim() && slot.draft.text.trim() !== turn.question)}];
  });
}
