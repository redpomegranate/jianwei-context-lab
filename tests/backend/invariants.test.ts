import assert from "node:assert/strict";
import test from "node:test";
import {
  analysisInputSchema,
  canonicalHash,
  eventUpdateSchema,
  predictionSchema,
  projectAnalysisOutput,
  stageStateError,
  summarizeEvents,
} from "../../artifacts/api-server/src/lib/invariants";

test("prediction bounds are enforced while past shape remains replayable", () => {
  const base = {
    version: 1,
    requestId: "f7ebfd37-1702-4e31-a71f-fccb4f28d704",
    text: "对方会在周五前回复",
    criteria: "收到明确文字回复",
  };
  assert.equal(
    predictionSchema.safeParse({
      ...base,
      probability: 101,
      dueAt: new Date(Date.now() + 60_000).toISOString(),
    }).success,
    false,
  );
  assert.equal(
    predictionSchema.safeParse({
      ...base,
      probability: 50,
      dueAt: new Date(Date.now() - 60_000).toISOString(),
    }).success,
    true,
  );
});

test("request schemas reject unknown fields and false consent", () => {
  assert.equal(
    analysisInputSchema.safeParse({
      version: 1,
      requestId: "f7ebfd37-1702-4e31-a71f-fccb4f28d704",
      stage: "organize",
      consent: false,
    }).success,
    false,
  );
  assert.equal(
    eventUpdateSchema.safeParse({ version: 1, unexpected: "x" }).success,
    false,
  );
});

test("AI stage ordering is deterministic", () => {
  assert.equal(
    stageStateError("hypotheses", {
      userHypothesis: "",
      hasPrediction: false,
      hasOutcome: false,
      completed: false,
    }),
    "USER_HYPOTHESIS_REQUIRED",
  );
  assert.equal(
    stageStateError("reflection", {
      userHypothesis: "暂不知道",
      hasPrediction: true,
      hasOutcome: false,
      completed: false,
    }),
    "OUTCOME_REQUIRED",
  );
  assert.equal(
    stageStateError("prediction", {
      userHypothesis: "暂不知道",
      hasPrediction: false,
      hasOutcome: false,
      completed: false,
    }),
    null,
  );
  assert.equal(
    stageStateError("organize", {
      userHypothesis: "暂不知道",
      hasPrediction: true,
      hasOutcome: false,
      completed: false,
    }),
    "EVENT_SNAPSHOT_LOCKED",
  );
  assert.equal(
    stageStateError("reflection", {
      userHypothesis: "暂不知道",
      hasPrediction: true,
      hasOutcome: true,
      completed: true,
    }),
    "REFLECTION_ALREADY_COMPLETED",
  );
});

test("stage projection removes every out-of-stage candidate field", () => {
  const full = {
    facts: ["事实"],
    inferences: ["推断"],
    unknowns: ["未知"],
    questions: ["问题"],
    hypotheses: [{ text: "假设", evidence: "证据", missing: "缺失" }],
    predictionSuggestion: "预测",
    criteriaSuggestion: "标准",
    wellFounded: "合理",
    overreach: "越界",
    missing: "遗漏",
    lesson: "经验",
  };
  const organized = projectAnalysisOutput("organize", full);
  assert.deepEqual(organized.hypotheses, []);
  assert.equal(organized.predictionSuggestion, "");
  assert.equal(organized.lesson, "");
  const hypotheses = projectAnalysisOutput("hypotheses", full);
  assert.deepEqual(hypotheses.facts, []);
  assert.equal(hypotheses.predictionSuggestion, "");
  assert.equal(hypotheses.lesson, "");
});

test("questions can be saved with a draft and a fourth question is rejected", () => {
  assert.equal(
    eventUpdateSchema.safeParse({
      version: 2,
      questions: ["谁负责周五的交付"],
    }).success,
    true,
  );
  assert.equal(
    eventUpdateSchema.safeParse({
      version: 2,
      questions: ["一", "二", "三", "四"],
    }).success,
    false,
  );
});

test("valid loops require a decidable outcome and a confirmed reflection", () => {
  const now = Date.parse("2026-09-23T00:00:00Z");
  const summary = summarizeEvents([
    {
      status: "predicted",
      prediction: { dueAt: "2026-09-01T00:00:00Z", outcome: { result: "unknown" } },
      reflection: { lesson: "未知不是未发生" },
    },
    {
      status: "completed",
      prediction: { dueAt: "2026-09-01T00:00:00Z", outcome: { result: "occurred" } },
      reflection: { lesson: "先确认负责人" },
    },
    {
      status: "predicted",
      prediction: { dueAt: "2026-09-01T00:00:00Z", outcome: null },
      reflection: null,
    },
  ], now);
  assert.equal(summary.recordedOutcomes, 2);
  assert.equal(summary.unknownOutcomes, 1);
  assert.equal(summary.confirmedReflections, 2);
  assert.equal(summary.completedLoops, 1);
  assert.equal(summary.duePredictions, 1);
});

test("canonical hash is key-order independent and parameter-sensitive", () => {
  assert.equal(canonicalHash({ b: 2, a: 1 }), canonicalHash({ a: 1, b: 2 }));
  assert.notEqual(canonicalHash({ a: 1 }), canonicalHash({ a: 2 }));
});