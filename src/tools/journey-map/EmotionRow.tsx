import { Textarea } from "@chakra-ui/react";
import { useMemo, useRef } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";

import {
  EMOTION_NOTE_MAX_HEIGHT,
  EMOTION_NOTE_MAX_UNITS,
  EMOTION_NOTE_MAX_WIDTH,
  applyJourneyMapCommand,
  getEmotionLongestLineUnits,
  trimEmotionNoteByUnits,
  type JourneyCell,
  type JourneyMapCommand,
  type JourneyRow,
  type JourneyStage,
} from "./tool";

export type SelectedCell = { rowId: string; stageId: string };

type EmotionRowProps = {
  row: JourneyRow;
  stages: JourneyStage[];
  selectedCell: SelectedCell | null;
  setSelectedCell: (value: SelectedCell | null) => void;
  editingEmotion: SelectedCell | null;
  setEditingEmotion: (value: SelectedCell | null) => void;
  updateCell: (rowId: string, stageId: string, updates: Partial<JourneyCell>) => void;
};

type DragState = {
  stageId: string;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
} | null;

function getEmotionEditorSize(note: string) {
  const trimmed = trimEmotionNoteByUnits(note, EMOTION_NOTE_MAX_UNITS);
  const lineCount = Math.max(1, trimmed.split("\n").length);
  const longestLineUnits = Math.max(4, getEmotionLongestLineUnits(trimmed));

  return {
    width: Math.min(
      EMOTION_NOTE_MAX_WIDTH,
      Math.max(56, Math.round(26 + longestLineUnits * 12)),
    ),
    height: Math.min(
      EMOTION_NOTE_MAX_HEIGHT,
      Math.max(27, 22 + (lineCount - 1) * 18),
    ),
  };
}

function createCellUpdateCommand(
  rowId: string,
  stageId: string,
  updates: Partial<JourneyCell>,
): Extract<JourneyMapCommand, { type: "journey-map.update-cell" }> {
  return {
    id: `journey-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: "journey-map.update-cell",
    payload: { rowId, stageId, updates },
    expectedRevision: 0,
    issuedAt: new Date().toISOString(),
    actor: { type: "user" },
  };
}

export function EmotionRow({
  row,
  stages,
  selectedCell,
  setSelectedCell,
  editingEmotion,
  setEditingEmotion,
  updateCell,
}: EmotionRowProps) {
  const dragStateRef = useRef<DragState>(null);

  const points = useMemo(
    () =>
      stages.map((stage, index) => {
        const score = row.cells[stage.id]?.emotionScore || 3;
        return {
          stage,
          x: stages.length === 1 ? 50 : (index / (stages.length - 1)) * 100,
          y: ((5 - score) / 4) * 72 + 14,
          score,
        };
      }),
    [row.cells, stages],
  );

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  const updateScoreFromPointer = (
    event: ReactPointerEvent<HTMLButtonElement>,
    stageId: string,
  ) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    const score = Math.max(1, Math.min(5, Math.round(5 - ratio * 4)));
    const nextRow = applyJourneyMapCommand(
      { title: "", scenario: "", persona: "", goal: "", stages: [], rows: [row] },
      createCellUpdateCommand(row.id, stageId, { emotionScore: score }),
    ).rows[0];
    updateCell(row.id, stageId, {
      emotionScore: nextRow.cells[stageId]?.emotionScore ?? score,
    });
  };

  return (
    <div className="emotion-row-span">
      <svg className="emotion-line" preserveAspectRatio="none" viewBox="0 0 100 100">
        <polyline points={polyline} />
      </svg>
      <div
        className="emotion-grid"
        style={{ "--stage-count": stages.length } as CSSProperties}
      >
        {points.map((point) => {
          const cell = row.cells[point.stage.id];
          const isEditing =
            editingEmotion?.rowId === row.id &&
            editingEmotion.stageId === point.stage.id;
          const noteSize = getEmotionEditorSize(cell?.emotionNote || "");
          const editorPositionClass =
            point.y < 42 ? "emotion-note-editor-below" : "emotion-note-editor-above";

          return (
            <button
              className={`emotion-cell ${
                selectedCell?.rowId === row.id && selectedCell.stageId === point.stage.id
                  ? "is-selected"
                  : ""
              }`}
              key={point.stage.id}
              onPointerDown={(event) => {
                dragStateRef.current = {
                  stageId: point.stage.id,
                  pointerId: event.pointerId,
                  startX: event.clientX,
                  startY: event.clientY,
                  moved: false,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
                setSelectedCell({ rowId: row.id, stageId: point.stage.id });
                updateScoreFromPointer(event, point.stage.id);
              }}
              onPointerMove={(event) => {
                const dragState = dragStateRef.current;
                if (
                  !dragState ||
                  dragState.stageId !== point.stage.id ||
                  dragState.pointerId !== event.pointerId ||
                  event.buttons !== 1
                ) {
                  return;
                }

                if (
                  Math.abs(event.clientX - dragState.startX) > 4 ||
                  Math.abs(event.clientY - dragState.startY) > 4
                ) {
                  dragState.moved = true;
                }

                updateScoreFromPointer(event, point.stage.id);
              }}
              onPointerUp={(event) => {
                const dragState = dragStateRef.current;
                if (
                  dragState &&
                  dragState.stageId === point.stage.id &&
                  dragState.pointerId === event.pointerId &&
                  !dragState.moved
                ) {
                  setEditingEmotion({ rowId: row.id, stageId: point.stage.id });
                }
                dragStateRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              onPointerCancel={(event) => {
                dragStateRef.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                  event.currentTarget.releasePointerCapture(event.pointerId);
                }
              }}
              type="button"
            >
              <span className="emotion-note" style={{ top: `${Math.max(4, point.y - 12)}%` }}>
                {cell?.emotionNote || `情绪 ${point.score}`}
              </span>
              <span className="emotion-point" style={{ top: `${point.y}%` }}>
                {point.score}
              </span>
              {isEditing ? (
                <Textarea
                  className={`emotion-note-editor ${editorPositionClass}`}
                  rows={Math.max(1, (cell?.emotionNote || "").split("\n").length)}
                  style={
                    {
                      left: "50%",
                      top: `${point.y}%`,
                      width: `${noteSize.width}px`,
                      height: `${noteSize.height}px`,
                    } as CSSProperties
                  }
                  value={cell?.emotionNote || ""}
                  onChange={(event) =>
                    updateCell(row.id, point.stage.id, {
                      emotionNote: trimEmotionNoteByUnits(
                        event.target.value,
                        EMOTION_NOTE_MAX_UNITS,
                      ),
                    })
                  }
                  onBlur={() => setEditingEmotion(null)}
                  onFocus={() => setSelectedCell({ rowId: row.id, stageId: point.stage.id })}
                  onClick={(event) => event.stopPropagation()}
                  placeholder="备注情绪"
                />
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
