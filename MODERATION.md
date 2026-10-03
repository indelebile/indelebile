# Moderation

Entries cannot be deleted. This document is about what can be done instead,
who may do it, and how anyone can check that nothing else was done.

It is written to be adopted by a vote, amended by a vote, and read by
someone who does not trust whoever is running the site today.

## 1. What a collapse is

A collapse hides an entry's text **in this viewer**. It does not touch the
chain, the index, or anyone's ownership of their ethscription.

A collapsed entry still appears in the archive, still carries its author,
its sequence number and its block, still says that it was collapsed, by
whom, when and on what grounds, and still links to its raw calldata so
that anyone can read the thing that was collapsed.

**There is no mechanism in this project that removes an entry.** Nobody
has one — not the DAO, not the multisig, not whoever deployed the
contract, not the author. Anyone who promises otherwise is describing a
system other than this one.

## 2. Grounds

An entry may be collapsed only on one of these grounds. The list is
exhaustive: an entry that fits none of them stays as written, however
disagreeable.

| | Ground |
|---|---|
| **G-1** | Sexual content involving a minor, or material depicting the sexual abuse of any person |
| **G-2** | Personal data of a private individual — home address, phone number, government identifier, or anything of comparable effect |
| **G-3** | Credentials: private keys, seed phrases, passwords, API tokens, whether the author's own or anyone else's |
| **G-4** | A direct call for violence against a named person or an identifiable group |
| **G-5** | Content whose publication is an offence in the jurisdiction where the viewer is served, as stated in a specific legal demand received |

Note what is **not** on this list: testimony about violence, war, torture,
or sexual abuse told by or about its victims; accusations against public
figures; material that embarrasses a state or a company; obscenity;
political positions anyone finds repugnant. **This archive exists for the
first of those.** A rule that cannot tell an account of an atrocity from
the atrocity would collapse the testimony and leave the rest.

## 3. Who may collapse, and how

**By vote.** Any token holder may propose a collapse, naming the entry and
the ground. The usual governance process decides. This is the normal path
and has no time limit.

**By emergency action.** G-1, G-2 and G-3 can cause harm in hours, and a
vote takes days. For those three grounds only, any **two of the named
stewards** may collapse an entry immediately, provided that:

1. The action is **published at the time it is taken**, naming the entry,
   the ground, and the two stewards.
2. It is put to the next scheduled vote for ratification.
3. **If it is not ratified, it is reversed** and may not be retaken on the
   same ground.
4. Until ratified, the viewer shows it as an unratified emergency
   collapse.

G-4 and G-5 have no emergency path. Both require judgment that a vote is
better placed to make, and neither is urgent in the way the first three
are.

Stewards hold no other power. They cannot write on anyone's behalf, cannot
change the contract, cannot move funds, and cannot uncollapse an entry a
vote has collapsed.

## 4. The record

Every collapse is a line in `hidden.json`:

```json
{ "id": "0x…", "by": "steward-a, steward-b", "decided": "2026-10-04",
  "reason": "G-1", "decision": "https://…", "ratified": false }
```

That file is in the repository, so **every change to it is a commit**: who
changed it, when, and what the file said before. The history of moderation
is therefore as permanent and as public as the entries it covers.

An entry whose id appears without a record still collapses — a list that
fails to parse must not reveal everything it was meant to collapse — but
the viewer says plainly that no decision is attached. That state is a
defect, not a procedure.

## 5. Flagging is not collapsing

`scripts/flag.mjs` scans the archive and prints a queue for human review.
It writes nothing, hides nothing, and has no effect on the site. A term
list is a way of deciding **what to look at**, never what to show.

Automatic filtering is not used, and should not be adopted later, for two
reasons:

- **It fails on the content that matters.** Anyone who pays to inscribe
  something harmful is deliberate; a link, an encoded blob or a changed
  spelling defeats any word list. The list only catches the careless.
- **It fails in the wrong direction.** A list that catches words like
  *violence*, *rape*, or *child* will catch the testimony of victims
  first, which is what this archive is for.

## 6. What this does not solve

The content remains on Ethereum. A collapse changes one viewer. Other
viewers may show the entry; any person can rebuild the whole archive from
the chain with the open indexer, and that is deliberate — it is the same
property that keeps the archive alive if this project disappears.

**So nobody should be told that a collapse makes something go away.** It
makes this site stop repeating it, with a record of who decided that and
why.
