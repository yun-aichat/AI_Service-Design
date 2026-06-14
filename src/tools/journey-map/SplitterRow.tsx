import { Input, Splitter, Textarea } from "@chakra-ui/react";
import { ImagePlus, X } from "lucide-react";
import type { CSSProperties } from "react";

import { EmotionRow, type SelectedCell } from "./EmotionRow";
import type { JourneyCell, JourneyRow, JourneyStage } from "./tool";

type SplitterRowProps = {
  row: JourneyRow;
  nextRowId?: string;
  stages: JourneyStage[];
  selectedCell: SelectedCell | null;
  setSelectedCell: (value: SelectedCell | null) => void;
  editingEmotion: SelectedCell | null;
  setEditingEmotion: (value: SelectedCell | null) => void;
  updateRow: (
    rowId: string,
    updates: Partial<Pick<JourneyRow, "title" | "type">>,
  ) => void;
  updateCell: (rowId: string, stageId: string, updates: Partial<JourneyCell>) => void;
};

function ImageCell({
  cell,
  onChange,
  onFocus,
}: {
  cell?: JourneyCell;
  onChange: (imageUrl: string) => void;
  onFocus: () => void;
}) {
  return (
    <div className="image-cell">
      {cell?.imageUrl ? (
        <img alt="旅程图图片" src={cell.imageUrl} />
      ) : (
        <div className="image-placeholder">
          <ImagePlus size={18} />
          <span>图片 URL</span>
        </div>
      )}
      <Input
        value={cell?.imageUrl || ""}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        placeholder="https://..."
      />
    </div>
  );
}

export function SplitterRow({
  row,
  nextRowId,
  stages,
  selectedCell,
  setSelectedCell,
  editingEmotion,
  setEditingEmotion,
  updateRow,
  updateCell,
}: SplitterRowProps) {
  const isSelectedRow = selectedCell?.rowId === row.id;

  return (
    <>
      <Splitter.Panel id={row.id} className="row-panel">
        <div
          className="journey-grid row-grid"
          style={{ "--stage-count": stages.length } as CSSProperties}
        >
          <div
            className={`row-title-cell row-title-editor ${
              isSelectedRow ? "has-selected-cell" : ""
            }`}
          >
            <Input
              value={row.title}
              onChange={(event) => updateRow(row.id, { title: event.target.value })}
            />
            {isSelectedRow ? (
              <span className="selection-x row-x" aria-hidden="true">
                <X size={14} />
              </span>
            ) : null}
          </div>
          {row.type === "emotion" ? (
            <EmotionRow
              editingEmotion={editingEmotion}
              row={row}
              selectedCell={selectedCell}
              setSelectedCell={setSelectedCell}
              setEditingEmotion={setEditingEmotion}
              stages={stages}
              updateCell={updateCell}
            />
          ) : (
            stages.map((stage) => (
              <div
                className={`matrix-cell ${
                  selectedCell?.rowId === row.id && selectedCell.stageId === stage.id
                    ? "is-selected"
                    : ""
                }`}
                key={stage.id}
                onClick={() => setSelectedCell({ rowId: row.id, stageId: stage.id })}
              >
                {row.type === "text" ? (
                  <Textarea
                    value={row.cells[stage.id]?.text || ""}
                    onChange={(event) =>
                      updateCell(row.id, stage.id, { text: event.target.value })
                    }
                    onFocus={() => setSelectedCell({ rowId: row.id, stageId: stage.id })}
                  />
                ) : (
                  <ImageCell
                    cell={row.cells[stage.id]}
                    onChange={(imageUrl) => updateCell(row.id, stage.id, { imageUrl })}
                    onFocus={() => setSelectedCell({ rowId: row.id, stageId: stage.id })}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </Splitter.Panel>
      {nextRowId ? (
        <Splitter.ResizeTrigger className="row-resize-trigger" id={`${row.id}:${nextRowId}`}>
          <Splitter.ResizeTriggerSeparator />
        </Splitter.ResizeTrigger>
      ) : null}
    </>
  );
}
