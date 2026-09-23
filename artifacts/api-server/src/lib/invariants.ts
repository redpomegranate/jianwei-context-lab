import { createHash } from "node:crypto";
import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const narrative = z.string().trim().min(1).max(10_000);
const optionalNarrative = z.string().trim().max(10_000);
const boundedList = z.array(shortText).max(30);
const hypothesis = z.object({
  text: shortText,
  evidence: z.string().trim().max(1_000),
  missing: z.string().trim().max(1_000),
}).strict();

export const eventInputSchema = z.object({
  title: z.string().trim().min(1).max(200),
  rawText: narrative,
  category: z.enum(["work", "relationship", "family", "other"]),
}).strict();

export const eventUpdateSchema = z.object({
  version: z.number().int().min(1),
  title: z.string().trim().min(1).max(200).optional(),
  rawText: narrative.optional(),
  facts: boundedList.optional(),
  inferences: boundedList.optional(),
  unknowns: boundedList.optional(),
  questions: z.array(shortText).max(3).optional(),
  context: optionalNarrative.optional(),
  userHypothesis: z.string().trim().max(3_000).optional(),
  hypotheses: z.array(hypothesis).max(3).optional(),
}).strict().refine((value) => Object.keys(value).some((key) => key !== "version"), {
  message: "至少提供一个要更新的字段",
});

export const predictionSchema = z.object({
  version: z.number().int().min(1),
  requestId: z.string().uuid(),
  text: shortText,
  probability: z.number().int().min(0).max(100),
  criteria: shortText,
  dueAt: z.string().datetime({ offset: true }),
}).strict();

export const outcomeSchema = z.object({
  version: z.number().int().min(1),
  requestId: z.string().uuid(),
  result: z.enum(["occurred", "not_occurred", "unknown"]),
  notes: z.string().trim().max(5_000),
  intervention: z.string().trim().max(5_000),
}).strict();

export const reflectionSchema = z.object({
  version: z.number().int().min(1),
  lesson: narrative,
  wellFounded: optionalNarrative,
  overreach: optionalNarrative,
  missing: optionalNarrative,
}).strict();

export const reflectionCorrectionSchema = reflectionSchema;

export interface SummaryCounts {
  totalEvents: number;
  drafts: number;
  pendingPredictions: number;
  duePredictions: number;
  recordedOutcomes: number;
  unknownOutcomes: number;
  confirmedReflections: number;
  completedLoops: number;
}

export function summarizeEvents(
  events: Array<{
    status: string;
    prediction: { dueAt: string; outcome: { result: string } | null } | null;
    reflection: unknown;
  }>,
  now = Date.now(),
): SummaryCounts {
  const recorded = events.filter((event) => event.prediction?.outcome);
  const confirmed = events.filter((event) => event.reflection);
  const valid = events.filter((event) => {
    const result = event.prediction?.outcome?.result;
    return (result === "occurred" || result === "not_occurred") && event.reflection;
  });
  return {
    totalEvents: events.length,
    drafts: events.filter((event) => event.status === "draft").length,
    pendingPredictions: events.filter((event) => event.prediction && !event.prediction.outcome).length,
    duePredictions: events.filter((event) => {
      const dueAt = event.prediction?.dueAt;
      return Boolean(
        event.prediction &&
        !event.prediction.outcome &&
        dueAt &&
        Date.parse(dueAt) <= now,
      );
    }).length,
    recordedOutcomes: recorded.length,
    unknownOutcomes: recorded.filter((event) => event.prediction?.outcome?.result === "unknown").length,
    confirmedReflections: confirmed.length,
    completedLoops: valid.length,
  };
}

export const analysisInputSchema = z.object({
  version: z.number().int().min(1),
  requestId: z.string().uuid(),
  stage: z.enum(["organize", "hypotheses", "prediction", "reflection"]),
  consent: z.literal(true),
  apiKey: z.string().trim().min(1).max(400).optional(),
  baseUrl: z.string().trim().url().max(300).optional(),
  model: z.string().trim().regex(/^[A-Za-z0-9._:-]{1,80}$/).optional(),
}).strict();

export const analysisOutputSchema = z.object({
  facts: boundedList,
  inferences: boundedList,
  unknowns: boundedList,
  questions: z.array(shortText).max(3),
  hypotheses: z.array(hypothesis).max(3),
  predictionSuggestion: z.string().trim().max(500),
  criteriaSuggestion: z.string().trim().max(500),
  wellFounded: z.string().trim().max(2_000),
  overreach: z.string().trim().max(2_000),
  missing: z.string().trim().max(2_000),
  lesson: z.string().trim().max(2_000),
}).strict();

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export function canonicalHash(value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

export function stageStateError(
  stage: "organize" | "hypotheses" | "prediction" | "reflection",
  state: {
    userHypothesis: string;
    hasPrediction: boolean;
    hasOutcome: boolean;
    completed: boolean;
  },
): string | null {
  if (
    (stage === "organize" ||
      stage === "hypotheses" ||
      stage === "prediction") &&
    state.hasPrediction
  ) {
    return "EVENT_SNAPSHOT_LOCKED";
  }
  if (stage === "reflection" && state.completed) {
    return "REFLECTION_ALREADY_COMPLETED";
  }
  if (
    (stage === "hypotheses" || stage === "prediction") &&
    state.userHypothesis.trim().length === 0
  ) {
    return "USER_HYPOTHESIS_REQUIRED";
  }
  if (stage === "reflection" && !state.hasOutcome) {
    return "OUTCOME_REQUIRED";
  }
  return null;
}

export type AnalysisStage = "organize" | "hypotheses" | "prediction" | "reflection";
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

const emptyAnalysis: AnalysisOutput = {
  facts: [],
  inferences: [],
  unknowns: [],
  questions: [],
  hypotheses: [],
  predictionSuggestion: "",
  criteriaSuggestion: "",
  wellFounded: "",
  overreach: "",
  missing: "",
  lesson: "",
};

export function projectAnalysisOutput(
  stage: AnalysisStage,
  untrusted: unknown,
): AnalysisOutput {
  const parsed = analysisOutputSchema.parse(untrusted);
  if (stage === "organize") {
    return {
      ...emptyAnalysis,
      facts: parsed.facts,
      inferences: parsed.inferences,
      unknowns: parsed.unknowns,
      questions: parsed.questions,
    };
  }
  if (stage === "hypotheses") {
    return { ...emptyAnalysis, hypotheses: parsed.hypotheses };
  }
  if (stage === "prediction") {
    return {
      ...emptyAnalysis,
      predictionSuggestion: parsed.predictionSuggestion,
      criteriaSuggestion: parsed.criteriaSuggestion,
    };
  }
  return {
    ...emptyAnalysis,
    wellFounded: parsed.wellFounded,
    overreach: parsed.overreach,
    missing: parsed.missing,
    lesson: parsed.lesson,
  };
}