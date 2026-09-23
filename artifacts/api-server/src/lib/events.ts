import type { AuthContext } from "./supabase";
import { selectAll } from "./supabase";
import { ApiError } from "./errors";

interface Row {
  [key: string]: unknown;
}

function oneBy<T extends Row>(
  rows: T[],
  key: string,
  value: unknown,
): T | undefined {
  return rows.find((row) => row[key] === value);
}

export async function loadEvents(auth: AuthContext, id?: string) {
  const eventFilter = id ? `&id=eq.${encodeURIComponent(id)}` : "";
  const [events, predictions, outcomes, reflections, corrections] = (await Promise.all([
    selectAll(
      auth,
      "events",
      `select=*&order=created_at.desc${eventFilter}`,
    ),
    selectAll(auth, "predictions", "select=*"),
    selectAll(auth, "outcomes", "select=*"),
    selectAll(auth, "reflections", "select=*"),
    loadCorrections(auth),
  ])) as [Row[], Row[], Row[], Row[], Row[]];

  return events.map((event) => {
    const prediction = oneBy(predictions, "event_id", event.id);
    const outcome = prediction
      ? oneBy(outcomes, "prediction_id", prediction.id)
      : undefined;
    const reflection = oneBy(reflections, "event_id", event.id);
    return {
      id: event.id,
      title: event.title,
      rawText: event.raw_text,
      category: event.category,
      status: event.status,
      version: event.version,
      createdAt: event.created_at,
      updatedAt: event.updated_at,
      facts: event.facts,
      inferences: event.inferences,
      unknowns: event.unknowns,
      questions: event.questions,
      context: event.context,
      userHypothesis: event.user_hypothesis,
      hypotheses: event.hypotheses,
      prediction: prediction
        ? {
            id: prediction.id,
            text: prediction.text,
            probability: prediction.probability,
            criteria: prediction.criteria,
            dueAt: prediction.due_at,
            createdAt: prediction.created_at,
            outcome: outcome
              ? {
                  result: outcome.result,
                  notes: outcome.notes,
                  intervention: outcome.intervention,
                  createdAt: outcome.created_at,
                }
              : null,
          }
        : null,
      reflection: reflection
        ? {
            lesson: reflection.lesson,
            wellFounded: reflection.well_founded,
            overreach: reflection.overreach,
            missing: reflection.missing,
            createdAt: reflection.created_at,
          }
        : null,
      reflectionCorrections: corrections
        .filter((correction) => correction.event_id === event.id)
        .map((correction) => ({
          lesson: correction.lesson,
          wellFounded: correction.well_founded,
          overreach: correction.overreach,
          missing: correction.missing,
          source: correction.source,
          createdAt: correction.created_at,
        })),
    };
  });
}

async function loadCorrections(auth: AuthContext): Promise<Row[]> {
  try {
    return (await selectAll(
      auth,
      "reflection_corrections",
      "select=*&order=created_at.asc",
    )) as Row[];
  } catch (error) {
    if (error instanceof ApiError && error.code === "MISSING_RELATION") return [];
    throw error;
  }
}

export async function loadRuns(auth: AuthContext) {
  const rows = (await selectAll(
    auth,
    "agent_runs",
    "select=id,event_id,stage,status,created_at,finished_at,error_code,model,prompt_version&order=created_at.desc",
  )) as Row[];
  return rows.map((row) => ({
    id: row.id,
    eventId: row.event_id,
    stage: row.stage,
    status: row.status,
    createdAt: row.created_at,
    finishedAt: row.finished_at,
    errorCode: row.error_code,
    model: row.model,
    promptVersion: row.prompt_version,
  }));
}