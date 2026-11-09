// A write replayed from a device outbox carries the account its store belongs
// to (SPEC V78). If the session is now someone else's (another user signed in
// on this browser while an old tab still held a queue), the write must not
// land: the action answers "failed", which every outbox keeps for its own
// account, and writes nothing. Pure, so the action tests' auth mock keeps it.

export function queuedForAnother(
  owner: { kind: "demo" } | { kind: "owner"; user: { id: string } },
  asUser: unknown,
): boolean {
  return owner.kind === "owner" && typeof asUser === "string" && asUser !== owner.user.id;
}
