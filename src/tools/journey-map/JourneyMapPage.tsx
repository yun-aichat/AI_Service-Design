import { Button, Heading, Input, Splitter, Textarea } from "@chakra-ui/react";
import { Plus, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ComponentType, CSSProperties, ReactNode } from "react";

import type { ToolExportArtifact } from "../../domain/tool-runtime";
import { JourneyAssistantPanel } from "../../features/assistant";
import {
  applyJourneyMapProposal as persistJourneyMapProposal,
  getJourneyMapContext,
  type ProjectRecord,
  recordJourneyMapExport,
  saveJourneyMap,
  type ToolDocumentRecord,
  ToolDocumentsRequestError,
} from "../../infrastructure/cloudbase/tool-documents/api";
import { MatrixScrollbars } from "./MatrixScrollbars";
import { SplitterRow } from "./SplitterRow";
import {
  applyJourneyMapCommand,
  createJourney,
  journeyMapToolDefinition,
  type JourneyCell,
  type JourneyMap,
  type JourneyMapCommand,
  normalizeJourneyProposal,
  type JourneyProposal,
  type JourneyRow,
  type RowType,
} from "./tool";

type ThemeMode = "light" | "dark";

type TopBarComponent = ComponentType<{
  title: string;
  children?: ReactNode;
  navigate: (route: "journey" | "components") => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}>;

type FieldLabelComponent = ComponentType<{
  label: string;
  children: ReactNode;
}>;

type JourneyMapPageProps = {
  navigate: (route: "journey" | "components") => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  TopBar: TopBarComponent;
  FieldLabel: FieldLabelComponent;
};

const DEMO_SERVICE_NAME = "门店预约服务";

function getProjectIdFromLocation() {
  if (typeof window === "undefined") return null;
  const projectId = new URLSearchParams(window.location.search).get("projectId");
  return typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
}

function setProjectIdOnLocation(projectId: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("projectId", projectId);
  window.history.replaceState({}, "", url.toString());
}

function createDefaultJourney(serviceName = DEMO_SERVICE_NAME) {
  const journey = createJourney(5);
  return {
    ...journey,
    title: `${serviceName.trim() || DEMO_SERVICE_NAME}用户旅程图`,
  };
}

function createEditorCommand(
  command: Pick<JourneyMapCommand, "type" | "payload">,
): JourneyMapCommand {
  return {
    id: `journey-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    type: command.type,
    payload: command.payload,
    expectedRevision: 0,
    issuedAt: new Date().toISOString(),
    actor: { type: "user" },
  } as JourneyMapCommand;
}

function downloadTextArtifact(artifact: ToolExportArtifact) {
  if (typeof artifact.data !== "string") return;
  const blob = new Blob([artifact.data], { type: artifact.mediaType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function getServiceNameFromTitle(title: string) {
  const normalized = title.replace(/用户旅程图$/, "").trim();
  return normalized || DEMO_SERVICE_NAME;
}

export function JourneyMapPage({
  navigate,
  theme,
  setTheme,
  TopBar,
  FieldLabel,
}: JourneyMapPageProps) {
  const [serviceName, setServiceName] = useState(DEMO_SERVICE_NAME);
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [stageCount, setStageCount] = useState(5);
  const [journey, setJourney] = useState(() => createDefaultJourney());
  const [documentRevision, setDocumentRevision] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState("正在读取...");
  const [selectedCell, setSelectedCell] = useState<{
    rowId: string;
    stageId: string;
  } | null>(null);
  const [editingEmotion, setEditingEmotion] = useState<{
    rowId: string;
    stageId: string;
  } | null>(null);
  const [matrixScrollLeft, setMatrixScrollLeft] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const rowPanelSizes = useMemo(
    () => journey.rows.map(() => 100 / Math.max(journey.rows.length, 1)),
    [journey.rows.length],
  );
  const contentVersion = useMemo(
    () =>
      `${journey.stages.map((stage) => stage.id).join("|")}::${journey.rows
        .map((row) => row.id)
        .join("|")}`,
    [journey.rows, journey.stages],
  );
  const matrixViewportStyle = useMemo(
    () =>
      ({
        "--matrix-scroll-left": `${matrixScrollLeft}px`,
      }) as CSSProperties,
    [matrixScrollLeft],
  );

  const runCommand = (command: Pick<JourneyMapCommand, "type" | "payload">) => {
    setJourney((current) => applyJourneyMapCommand(current, createEditorCommand(command)));
  };

  const applyLoadedDocument = (
    document: ToolDocumentRecord<JourneyMap>,
    status: string,
  ) => {
    setDocumentId(document.id);
    setProjectId(document.projectId);
    setJourney(document.content);
    setServiceName(getServiceNameFromTitle(document.title));
    setStageCount(document.content.stages.length);
    setDocumentRevision(document.revision);
    setSaveStatus(status);
  };

  const loadJourneyContext = async (requestedProjectId?: string | null) => {
    const context = await getJourneyMapContext<JourneyMap>({
      projectId: requestedProjectId ?? undefined,
    });
    setProjects(context.projects);
    setProjectId(context.project.id);
    setProjectIdOnLocation(context.project.id);

    if (context.document) {
      applyLoadedDocument(
        context.document,
        `已恢复 ${context.project.name} revision ${context.document.revision}`,
      );
      return;
    }

    const initialJourney = createDefaultJourney();
    const created = await saveJourneyMap({
      documentId: context.suggestedDocumentId,
      projectId: context.project.id,
      title: initialJourney.title,
      schemaVersion: journeyMapToolDefinition.documentVersion,
      expectedRevision: null,
      content: initialJourney,
      source: "system",
      idempotencyKey: `bootstrap:${context.project.id}:journey-map`,
      eventMetadata: {
        bootstrap: true,
        title: initialJourney.title,
        stageCount: initialJourney.stages.length,
        rowCount: initialJourney.rows.length,
      },
    }).catch(async (error) => {
      if (
        error instanceof ToolDocumentsRequestError &&
        (
          error.code === "REVISION_CONFLICT" ||
          error.code === "DOCUMENT_ALREADY_EXISTS" ||
          error.code === "REVISION_ALREADY_EXISTS"
        )
      ) {
        const reloaded = await getJourneyMapContext<JourneyMap>({
          projectId: context.project.id,
        });
        if (reloaded.document) return { document: reloaded.document };
      }
      throw error;
    });
    applyLoadedDocument(created.document, `已创建 ${context.project.name} 默认文档`);
  };

  useEffect(() => {
    let active = true;

    void loadJourneyContext(getProjectIdFromLocation())
      .catch(async (error) => {
        if (!active) return;
        if (
          error instanceof ToolDocumentsRequestError &&
          error.code === "REVISION_CONFLICT"
        ) {
          try {
            await loadJourneyContext(getProjectIdFromLocation());
            return;
          } catch (reloadError) {
            if (!active) return;
            setSaveStatus(reloadError instanceof Error ? reloadError.message : "读取失败");
            return;
          }
        }
        if (error instanceof ToolDocumentsRequestError && error.status === 401) {
          setSaveStatus("请先登录后再读取项目");
          return;
        }
        setSaveStatus(error instanceof Error ? error.message : "读取失败");
      });

    return () => {
      active = false;
    };
  }, []);

  const eventMetadata = (format?: string) => ({
    title: journey.title,
    stageCount: journey.stages.length,
    rowCount: journey.rows.length,
    ...(format ? { exportFormat: format } : {}),
  });

  const persistCurrentJourney = async () => {
    if (!documentId || !projectId) {
      setSaveStatus("项目上下文仍在准备中");
      return;
    }
    setSaveStatus("保存中...");
    try {
      const result = await saveJourneyMap({
        documentId,
        projectId,
        title: journey.title,
        schemaVersion: journeyMapToolDefinition.documentVersion,
        expectedRevision: documentRevision,
        content: journey,
        source: "manual",
        idempotencyKey: `save:${documentId}:${documentRevision ?? "new"}:${Date.now()}`,
        eventMetadata: eventMetadata(),
      });
      setDocumentRevision(result.document.revision);
      setSaveStatus(`已保存 revision ${result.document.revision}`);
    } catch (error) {
      setSaveStatus(error instanceof Error ? error.message : "保存失败");
    }
  };

  const updateJourneyMeta = (updates: Partial<JourneyMap>) => {
    runCommand({ type: "journey-map.update-meta", payload: updates });
  };

  const syncTitle = (name: string) => {
    setServiceName(name);
    updateJourneyMeta({ title: `${name.trim() || "未命名服务"}用户旅程图` });
  };

  const generateDraft = () => {
    setJourney((current) => {
      const next = createJourney(Math.max(3, Math.min(8, stageCount)));
      return {
        ...next,
        title: `${serviceName.trim() || "未命名服务"}用户旅程图`,
        scenario: current.scenario,
        persona: current.persona,
        goal: current.goal,
      };
    });
    setSelectedCell(null);
    setEditingEmotion(null);
  };

  const updateRow = (
    rowId: string,
    updates: Partial<Pick<JourneyRow, "title" | "type">>,
  ) => {
    runCommand({ type: "journey-map.update-row", payload: { rowId, updates } });
  };

  const updateCell = (
    rowId: string,
    stageId: string,
    updates: Partial<JourneyCell>,
  ) => {
    runCommand({
      type: "journey-map.update-cell",
      payload: { rowId, stageId, updates },
    });
  };

  const applyJourneyProposal = (proposal: JourneyProposal) => {
    if (!documentId || !projectId) return;
    const nextJourney = normalizeJourneyProposal(proposal.journey, journey);
    setJourney(nextJourney);
    setServiceName(getServiceNameFromTitle(nextJourney.title));
    setSelectedCell(null);
    setEditingEmotion(null);
    void persistJourneyMapProposal({
      documentId,
      projectId,
      title: nextJourney.title,
      schemaVersion: journeyMapToolDefinition.documentVersion,
      expectedRevision: documentRevision,
      content: nextJourney,
      source: "ai_proposal",
      summary: proposal.summary.join("\n"),
      idempotencyKey: `proposal:${documentId}:${documentRevision ?? "new"}:${Date.now()}`,
      eventMetadata: {
        title: nextJourney.title,
        stageCount: nextJourney.stages.length,
        rowCount: nextJourney.rows.length,
        summaryCount: proposal.summary.length,
      },
    })
      .then((result) => {
        setDocumentRevision(result.document.revision);
        setSaveStatus(`AI 提案已保存 revision ${result.document.revision}`);
      })
      .catch((error) => {
        setSaveStatus(error instanceof Error ? error.message : "AI 提案保存失败");
      });
  };

  const exportFile = async (format: "md" | "json" | "csv" | "svg") => {
    if (!documentId || !projectId) return;
    const exporter = journeyMapToolDefinition.exports.find(
      (candidate) => candidate.format === format,
    );

    if (!exporter) return;

    const artifact = await exporter.export(
      {
        id: documentId,
        projectId,
        toolId: "journey-map",
        schemaVersion: journeyMapToolDefinition.documentVersion,
        revision: documentRevision ?? 0,
        title: journey.title,
        content: journey,
        createdAt: "",
        updatedAt: "",
      },
      { format },
    );

    downloadTextArtifact(artifact);
    void recordJourneyMapExport({
      projectId,
      documentId,
      revision: documentRevision,
      exportFormat: format,
      idempotencyKey: `export:${documentId}:${documentRevision ?? "draft"}:${format}:${Date.now()}`,
      metadata: eventMetadata(format),
    }).catch(() => {
      // Export should not be undone if analytics persistence is unavailable.
    });
  };

  return (
    <>
      <TopBar title="用户旅程图" navigate={navigate} theme={theme} setTheme={setTheme}>
        <Button className="top-button" onClick={() => exportFile("md")}>
          导出 MD
        </Button>
        <Button className="top-button" onClick={() => exportFile("json")}>
          导出 JSON
        </Button>
        <Button className="top-button" onClick={() => exportFile("csv")}>
          导出 CSV
        </Button>
        <Button className="top-button" onClick={() => exportFile("svg")}>
          导出 SVG
        </Button>
        <Button className="top-button" onClick={() => void persistCurrentJourney()}>
          保存
        </Button>
        <Button className="top-button" onClick={() => window.print()}>
          打印/PDF
        </Button>
      </TopBar>

      <main className="workspace">
        <section className="map-area" aria-label="用户旅程图编辑区">
          <div className="map-toolbar">
            <div>
              <p className="eyebrow">Editable Canvas</p>
              <Heading as="h2" className="section-heading">
                {journey.title}
              </Heading>
              <p className="eyebrow">{saveStatus}</p>
            </div>
            <div className="toolbar-cluster">
              <Button
                className="soft-action"
                onClick={() =>
                  runCommand({
                    type: "journey-map.add-row",
                    payload: { type: "text" },
                  })
                }
              >
                <Plus size={14} /> 文字行
              </Button>
              <Button
                className="soft-action"
                onClick={() =>
                  runCommand({
                    type: "journey-map.add-row",
                    payload: { type: "image" },
                  })
                }
              >
                <Plus size={14} /> 图片行
              </Button>
              <Button
                className="soft-action"
                onClick={() =>
                  runCommand({
                    type: "journey-map.add-row",
                    payload: { type: "emotion" },
                  })
                }
              >
                <Plus size={14} /> 情绪行
              </Button>
              <Button
                className="soft-action"
                onClick={() =>
                  runCommand({
                    type: "journey-map.add-stage",
                    payload: {},
                  })
                }
              >
                添加阶段
              </Button>
            </div>
          </div>

          <div className="summary-strip">
            <div>
              <span>目标用户</span>
              <strong>{journey.persona || "未填写"}</strong>
            </div>
            <div>
              <span>用户目标</span>
              <strong>{journey.goal || "未填写"}</strong>
            </div>
          </div>

          <div className="journey-matrix-wrap scrollbar-host" style={matrixViewportStyle}>
            <div
              ref={scrollRef}
              className="journey-matrix-scroll"
              onScroll={(event) => setMatrixScrollLeft(event.currentTarget.scrollLeft)}
            >
              <div
                className="journey-grid journey-header"
                style={{ "--stage-count": journey.stages.length } as CSSProperties}
              >
                <div className="row-title-cell">维度</div>
                {journey.stages.map((stage) => (
                  <div
                    className={`stage-header-cell ${
                      selectedCell?.stageId === stage.id ? "has-selected-cell" : ""
                    }`}
                    key={stage.id}
                  >
                    <Input
                      value={stage.name}
                      onChange={(event) =>
                        runCommand({
                          type: "journey-map.update-stage",
                          payload: {
                            stageId: stage.id,
                            name: event.target.value,
                          },
                        })
                      }
                    />
                    {selectedCell?.stageId === stage.id ? (
                      <span className="selection-x column-x" aria-hidden="true">
                        <X size={14} />
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>

              <Splitter.Root
                key={journey.rows.map((row) => row.id).join("-")}
                className="row-splitter"
                orientation="vertical"
                panels={journey.rows.map((row) => ({ id: row.id, minSize: 10 }))}
                defaultSize={rowPanelSizes}
                style={
                  {
                    "--stage-count": journey.stages.length,
                    "--row-count": journey.rows.length,
                  } as CSSProperties
                }
              >
                {journey.rows.map((row, rowIndex) => (
                  <SplitterRow
                    editingEmotion={editingEmotion}
                    key={row.id}
                    row={row}
                    nextRowId={journey.rows[rowIndex + 1]?.id}
                    selectedCell={selectedCell}
                    setSelectedCell={setSelectedCell}
                    setEditingEmotion={setEditingEmotion}
                    stages={journey.stages}
                    updateCell={updateCell}
                    updateRow={updateRow}
                  />
                ))}
              </Splitter.Root>
            </div>
            <MatrixScrollbars contentVersion={contentVersion} scrollRef={scrollRef} />
          </div>
        </section>

        <aside className="input-panel chat-panel" aria-label="输入信息与 AI 对话">
          <section>
            <Heading as="h2" className="panel-heading">
              场景输入
            </Heading>
            <FieldLabel label="服务/产品名称">
              <Input
                value={serviceName}
                onChange={(event) => syncTitle(event.target.value)}
              />
            </FieldLabel>
            <FieldLabel label="当前项目">
              <select
                value={projectId || ""}
                onChange={(event) => {
                  const nextProjectId = event.target.value || null;
                  setProjectId(nextProjectId);
                  setDocumentId(null);
                  setDocumentRevision(null);
                  setSaveStatus("正在切换项目...");
                  void loadJourneyContext(nextProjectId).catch((error) => {
                    setSaveStatus(error instanceof Error ? error.message : "项目切换失败");
                  });
                }}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </FieldLabel>
            <FieldLabel label="目标用户">
              <Input
                value={journey.persona}
                onChange={(event) => updateJourneyMeta({ persona: event.target.value })}
              />
            </FieldLabel>
            <FieldLabel label="用户目标">
              <Input
                value={journey.goal}
                onChange={(event) => updateJourneyMeta({ goal: event.target.value })}
              />
            </FieldLabel>
            <FieldLabel label="场景描述">
              <Textarea
                rows={7}
                value={journey.scenario}
                onChange={(event) => updateJourneyMeta({ scenario: event.target.value })}
              />
            </FieldLabel>
            <FieldLabel label="阶段数量">
              <Input
                type="number"
                min={3}
                max={8}
                value={stageCount}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setStageCount(Number.isFinite(value) ? value : 3);
                }}
              />
            </FieldLabel>
            <Button className="primary-action" onClick={generateDraft}>
              生成初稿
            </Button>
          </section>
          {documentId && projectId ? (
            <JourneyAssistantPanel
              documentId={documentId}
              journey={journey}
              onApplyProposal={applyJourneyProposal}
              projectId={projectId}
              revision={documentRevision}
              serviceName={serviceName}
            />
          ) : null}
        </aside>
      </main>
    </>
  );
}
