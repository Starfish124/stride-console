// The records the email sequencer keeps.
//
// Two things shape every type here.
//
// A person is a Client. There is no contact table and no "sequenced" stage,
// because a second copy of a person is a second thing to keep in step with the
// first. An enrolment holds a clientId and nothing else about them; the email
// address is re-read off the client at send time, so an address corrected in
// the pipeline is the address that gets used.
//
// History is copied, never referenced. A SendRecord holds the exact subject,
// the exact body and the lawful basis as they were at the moment of sending.
// Editing a sequence next month must not rewrite what went out last month, and
// "why did you email this person in March" has to be answerable from the
// ledger alone even after the enrolment is gone.
//
// No enums and no namespaces: Node strips the types off these files natively
// and both of those need a compiler.

import type { ClientStage } from "../types.ts";

/**
 * Why this person may lawfully be emailed. Recorded once, at enrolment, by a
 * named founder, and copied onto every send.
 *
 * A checkbox would be worthless here. Legitimate interest is a balancing test,
 * so what an auditor asks for is the reasoning and the provenance, which is
 * why both are free text a human has to write.
 */
export interface LawfulBasis {
  kind: "legitimate-interest" | "consent";
  /** Why this person specifically, in a founder's own words. */
  reason: string;
  /** Where the address came from: an event, the website form, a referral. */
  source: string;
  /** Consent only: when and how it was given. */
  consentAt?: string;
  recordedBy: string;
  recordedAt: string;
}

export type EnrolmentState = "active" | "paused" | "done" | "stopped";

export interface Enrolment {
  id: string;
  /** The only link to a person. */
  clientId: string;
  sequenceId: string;
  /**
   * Lowercased at enrolment. Re-read from the client before each send.
   *
   * Empty when the sequence has no email steps. A LinkedIn-only sequence is a
   * real sequence, and demanding an address to run one would mean inventing a
   * placeholder — which the suppression matcher would then have to be taught
   * to ignore.
   */
  email: string;
  /**
   * The normalised LinkedIn profile at enrolment, "linkedin.com/in/x".
   *
   * Optional so every enrolment written before LinkedIn touches existed still
   * reads. Set only when the sequence has LinkedIn steps, and re-read off the
   * client before each touch is queued, exactly as the address is.
   */
  profileUrl?: string;
  /** The next step to send, 0-based. */
  stepIndex: number;
  /** When steps[stepIndex] is due, ISO. */
  dueAt: string;
  state: EnrolmentState;
  stoppedReason?: string;
  /** A stage move past this one means they answered. That stops the sequence. */
  stageAtEnrolment: ClientStage;
  basis: LawfulBasis;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

/**
 * sending — claimed, and the outcome is genuinely unknown. Not zero.
 * stuck   — claimed twice with no answer. A human looks at it.
 * skipped — deliberately not sent, and `problem` says why.
 */
export type SendState = "sending" | "sent" | "failed" | "skipped" | "stuck";

export interface SendRecord {
  /** `${enrolmentId}:${stepId}`. The idempotency key, and the primary key. */
  key: string;
  id: string;
  enrolmentId: string;
  clientId: string;
  sequenceId: string;
  stepId: string;
  to: string;
  subject: string;
  body: string;
  state: SendState;
  dryRun: boolean;
  provider: "resend" | "dry";
  providerId?: string;
  /** The suppression reason, the cap that was hit, the lint verdict. */
  problem?: string;
  /** Copied, not referenced. */
  basis: LawfulBasis;
  claimedAt: string;
  finishedAt?: string;
  attempts: number;
}

export interface Suppression {
  /**
   * On the email channel: a lowercased address, or "@domain.nl" for a whole
   * domain. On the LinkedIn channel: a normalised profile, "linkedin.com/in/x".
   *
   * The two cannot collide — one form always has an "@" and the other never
   * does — so they share a list rather than splitting the one promise this
   * console makes unconditionally across two files.
   */
  address: string;
  /**
   * Which channel the entry was recorded on. Optional so every record written
   * before LinkedIn touches existed still reads, and those are all email.
   *
   * Note what this does NOT mean: it is not "the channel this person may still
   * be reached on". Someone who opts out by email is not then fair game on
   * LinkedIn, and the touch guard checks both lists for the same person.
   */
  channel?: "email" | "linkedin";
  reason: "unsubscribed" | "bounced" | "complained" | "blocked" | "invalid";
  at: string;
  by: string;
  note?: string;
}

export interface HardStop {
  stopped: boolean;
  at: string;
  by: string;
  reason?: string;
}

export interface ResearchViolation {
  severity: "error" | "warn";
  rule: string;
  detail: string;
}

export interface AccountResearch {
  id: string;
  clientId: string;
  url: string;
  summary: string;
  /** Three ways in, in the founder's language. */
  angles: string[];
  evidence: Array<{ claim: string; url: string }>;
  questions: string[];
  /** Which engine produced this, so a downgraded answer is labelled. */
  writerMode: string;
  /** A dropped citation is filed here, never discarded quietly. */
  violations: ResearchViolation[];
  createdAt: string;
}

export interface RunnerState {
  lastTickAt?: string;
  lastTickDay?: string;
}
