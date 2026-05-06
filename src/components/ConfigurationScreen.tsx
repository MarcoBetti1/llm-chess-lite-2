import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  Controls,
  Edge,
  Node,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import { Copy, Plus, Save, Trash2 } from "lucide-react";
import { DEFAULT_MODEL, defaultPromptGraph } from "../defaultGraph";
import type { LogicKind, PromptEdge, PromptGraph, PromptNode, PromptNodeType } from "../types";

type Props = {
  systems: PromptGraph[];
  selectedSystem: PromptGraph;
  selectedSystemId: string;
  locked: boolean;
  onSelectSystem: (id: string) => void;
  onSaveSystem: (system: PromptGraph) => void;
  onDeleteSystem: (id: string) => void;
};

type NodeClipboard = {
  nodes: PromptNode[];
  edges: PromptEdge[];
};

const variables = [
  "{fen}",
  "{sideToMove}",
  "{legalMovesText}",
  "{sanHistory}",
  "{uciHistory}",
  "{moveNumber}",
  "{lastMove}",
  "{candidateMove}",
  "{node.node_name.output.field}"
];

const nodeTypes: PromptNodeType[] = ["llm", "logic", "parser", "legal"];
const logicKinds: LogicKind[] = ["moveNumberEquals", "useCandidateMove", "firstLegalMove", "setMove", "always"];

const defaultNodeNames: Record<PromptNodeType, string> = {
  llm: "new_llm_prompt",
  logic: "new_logic_gate",
  parser: "new_move_parser",
  legal: "new_legal_check"
};

function cloneGraph(graph: PromptGraph): PromptGraph {
  return JSON.parse(JSON.stringify(graph)) as PromptGraph;
}

function safeId(value: string): string {
  const next = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return next || "node";
}

function uniqueName(base: string, existing: string[]): string {
  const normalized = safeId(base);
  if (!existing.includes(normalized)) return normalized;
  let index = 2;
  while (existing.includes(`${normalized}_${index}`)) index += 1;
  return `${normalized}_${index}`;
}

function edgeId(source: string, target: string): string {
  return `${source}-${target}-${Date.now()}`;
}

export function ConfigurationScreen(props: Props) {
  return (
    <ReactFlowProvider>
      <ConfigurationInner {...props} />
    </ReactFlowProvider>
  );
}

function ConfigurationInner({
  systems,
  selectedSystem,
  selectedSystemId,
  locked,
  onSelectSystem,
  onSaveSystem,
  onDeleteSystem
}: Props) {
  const [draft, setDraft] = useState<PromptGraph>(() => cloneGraph(selectedSystem));
  const [dirty, setDirty] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [clipboard, setClipboard] = useState<NodeClipboard | null>(null);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<Node>([]);
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const selectionKeyRef = useRef("");

  useEffect(() => {
    setDraft(normalizeGraph(cloneGraph(selectedSystem)));
    setDirty(false);
    setSelectedNodeId(null);
    setSelectedEdgeId(null);
    setSelectedNodeIds([]);
    selectionKeyRef.current = "";
  }, [selectedSystem]);

  const nodes = useMemo<Node[]>(() => {
    return draft.nodes.map((node) => ({
      id: node.id,
      position: node.position,
      data: {
        label: (
          <div className="flow-node-content">
            <strong>{node.id}</strong>
            <span>{node.type}</span>
          </div>
        )
      },
      className: `flow-node flow-node-${node.type}${node.id === draft.entryNodeId ? " flow-node-entry" : ""}`
    }));
  }, [draft.nodes, draft.entryNodeId]);

  const edges = useMemo<Edge[]>(() => {
    return draft.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      label: edge.label || edge.condition || "always",
      labelShowBg: true,
      labelStyle: { fill: "var(--ink)", fontSize: 12, fontWeight: 800 },
      labelBgStyle: { fill: "var(--surface)", stroke: "var(--line)", strokeWidth: 1 },
      labelBgPadding: [6, 3],
      animated: Boolean(edge.condition && edge.condition !== "always"),
      className: "flow-edge"
    }));
  }, [draft.edges]);

  useEffect(() => {
    setFlowNodes(nodes);
  }, [nodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(edges);
  }, [edges, setFlowEdges]);

  const selectedNode = selectedNodeId ? draft.nodes.find((node) => node.id === selectedNodeId) || null : null;
  const selectedEdge = selectedEdgeId ? draft.edges.find((edge) => edge.id === selectedEdgeId) || null : null;

  const updateDraft = (updater: (current: PromptGraph) => PromptGraph) => {
    if (locked) return;
    setDraft((current) => normalizeGraph(updater(cloneGraph(current))));
    setDirty(true);
  };

  const saveDraft = () => {
    if (locked) return;
    onSaveSystem(normalizeGraph(draft));
    setDirty(false);
  };

  const saveAsCopy = () => {
    if (locked) return;
    const copy = cloneGraph(draft);
    copy.id = uniqueName(`${draft.id}_copy`, systems.map((system) => system.id));
    copy.label = uniqueName(`${draft.label || draft.id}_copy`, systems.map((system) => system.label || system.id));
    onSaveSystem(copy);
    setDirty(false);
  };

  const createSystem = () => {
    if (locked) return;
    const next = cloneGraph(defaultPromptGraph);
    const name = uniqueName("new_chess_system", systems.map((system) => system.id));
    next.id = name;
    next.label = name;
    onSaveSystem(normalizeGraph(next));
  };

  const addNodeOfType = (type: PromptNodeType) => {
    const id = uniqueName(defaultNodeNames[type], draft.nodes.map((node) => node.id));
    const node: PromptNode = {
      id,
      label: id,
      type,
      position: { x: 160 + draft.nodes.length * 40, y: 120 + draft.nodes.length * 28 },
      ...(type === "llm"
        ? {
            model: DEFAULT_MODEL,
            temperature: 0.2,
            maxTokens: 96,
            systemPrompt: "Choose one legal chess move. Output UCI only.",
            promptTemplate: "FEN: {fen}\nLegal UCI moves: {legalMovesText}\nReturn one move."
          }
        : {}),
      ...(type === "logic" ? { logic: { kind: "always" as LogicKind } } : {})
    };
    updateDraft((current) => ({
      ...current,
      entryNodeId: current.entryNodeId || node.id,
      nodes: [...current.nodes, node]
    }));
    setSelectedNodeId(id);
    setSelectedEdgeId(null);
    setSelectedNodeIds([id]);
  };

  const deleteSelected = () => {
    if (locked) return;
    if (selectedEdge) {
      removeEdge(selectedEdge.id);
      return;
    }
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNode ? [selectedNode.id] : [];
    if (!ids.length) return;
    updateDraft((current) => {
      const idSet = new Set(ids);
      const remaining = current.nodes.filter((node) => !idSet.has(node.id));
      return {
        ...current,
        nodes: remaining,
        edges: current.edges.filter((edge) => !idSet.has(edge.source) && !idSet.has(edge.target)),
        entryNodeId: idSet.has(current.entryNodeId) ? remaining[0]?.id || "" : current.entryNodeId
      };
    });
    setSelectedNodeId(null);
    setSelectedNodeIds([]);
  };

  const updateNode = (id: string, patch: Partial<PromptNode>) => {
    updateDraft((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === id ? { ...node, ...patch } : node))
    }));
  };

  const renameNode = (oldId: string, nextValue: string) => {
    const nextId = uniqueName(
      nextValue,
      draft.nodes.filter((node) => node.id !== oldId).map((node) => node.id)
    );
    updateDraft((current) => ({
      ...current,
      entryNodeId: current.entryNodeId === oldId ? nextId : current.entryNodeId,
      nodes: current.nodes.map((node) =>
        node.id === oldId
          ? {
              ...node,
              id: nextId,
              label: nextId
            }
          : {
              ...node,
              sourceNodeId: node.sourceNodeId === oldId ? nextId : node.sourceNodeId
            }
      ),
      edges: current.edges.map((edge) => ({
        ...edge,
        source: edge.source === oldId ? nextId : edge.source,
        target: edge.target === oldId ? nextId : edge.target
      }))
    }));
    setSelectedNodeId(nextId);
    setSelectedNodeIds((ids) => ids.map((id) => (id === oldId ? nextId : id)));
  };

  const updateEdge = (id: string, patch: Partial<PromptEdge>) => {
    updateDraft((current) => ({
      ...current,
      edges: current.edges.map((edge) => (edge.id === id ? { ...edge, ...patch } : edge))
    }));
  };

  const applySelection = (nodeIds: string[], edgeIds: string[] = []) => {
    const key = `${nodeIds.join(",")}|${edgeIds.join(",")}`;
    if (selectionKeyRef.current === key) return;
    selectionKeyRef.current = key;
    setSelectedNodeIds(nodeIds);
    if (nodeIds.length === 1) {
      setSelectedNodeId(nodeIds[0]);
      setSelectedEdgeId(null);
    } else if (edgeIds.length === 1 && nodeIds.length === 0) {
      setSelectedEdgeId(edgeIds[0]);
      setSelectedNodeId(null);
    } else {
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const addEdgeFromPanel = (edge: Omit<PromptEdge, "id">) => {
    if (!edge.source || !edge.target || edge.source === edge.target) return;
    const next: PromptEdge = { ...edge, id: edgeId(edge.source, edge.target) };
    updateDraft((current) => ({ ...current, edges: [...current.edges, next] }));
    setSelectedEdgeId(next.id);
    setSelectedNodeId(null);
  };

  const removeEdge = (id: string) => {
    updateDraft((current) => ({ ...current, edges: current.edges.filter((edge) => edge.id !== id) }));
    setSelectedEdgeId(null);
  };

  const copySelection = () => {
    const ids = selectedNodeIds.length ? selectedNodeIds : selectedNodeId ? [selectedNodeId] : [];
    if (!ids.length) return;
    const idSet = new Set(ids);
    setClipboard({
      nodes: draft.nodes.filter((node) => idSet.has(node.id)).map((node) => cloneNode(node)),
      edges: draft.edges.filter((edge) => idSet.has(edge.source) && idSet.has(edge.target)).map((edge) => ({ ...edge }))
    });
  };

  const pasteSelection = () => {
    if (!clipboard || locked) return;
    const existing = draft.nodes.map((node) => node.id);
    const idMap = new Map<string, string>();
    const pastedNodes = clipboard.nodes.map((node, index) => {
      const nextId = uniqueName(`${node.id}_copy`, [...existing, ...Array.from(idMap.values())]);
      idMap.set(node.id, nextId);
      return {
        ...cloneNode(node),
        id: nextId,
        label: nextId,
        position: { x: node.position.x + 48 + index * 10, y: node.position.y + 48 + index * 10 }
      };
    });
    const pastedEdges = clipboard.edges
      .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
      .map((edge) => ({
        ...edge,
        id: edgeId(idMap.get(edge.source) || edge.source, idMap.get(edge.target) || edge.target),
        source: idMap.get(edge.source) || edge.source,
        target: idMap.get(edge.target) || edge.target
      }));
    updateDraft((current) => ({
      ...current,
      nodes: [...current.nodes, ...pastedNodes],
      edges: [...current.edges, ...pastedEdges]
    }));
    setSelectedNodeIds(pastedNodes.map((node) => node.id));
    setSelectedNodeId(pastedNodes[0]?.id || null);
    setSelectedEdgeId(null);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      const isCopy = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "c";
      const isPaste = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v";
      if (isCopy) {
        event.preventDefault();
        copySelection();
      }
      if (isPaste) {
        event.preventDefault();
        pasteSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clipboard, draft, locked, selectedNodeId, selectedNodeIds]);

  const disabled = locked;

  return (
    <main className="config-layout">
      <aside className="panel systems-panel">
        <div className="panel-header">
          <div>
            <h2>Systems</h2>
            <span>{systems.length} saved</span>
          </div>
        </div>
        <div className="system-list">
          {systems.map((system) => (
            <button
              key={system.id}
              className={system.id === selectedSystemId ? "active" : ""}
              onClick={() => onSelectSystem(system.id)}
              disabled={dirty || locked}
            >
              <strong>{system.label || system.id}</strong>
              <span>{system.nodes.length} nodes</span>
            </button>
          ))}
        </div>
        <div className="stacked-actions">
          <button onClick={createSystem} disabled={disabled}>
            <Plus size={15} />
            New
          </button>
          <button onClick={saveAsCopy} disabled={disabled}>
            <Copy size={15} />
            Duplicate
          </button>
          <button onClick={() => onDeleteSystem(selectedSystemId)} disabled={disabled || systems.length <= 1}>
            <Trash2 size={15} />
            Delete
          </button>
        </div>
      </aside>

      <section className="panel graph-panel">
        <div className="panel-header">
          <div>
            <h2>{draft.label || draft.id}</h2>
            <span>{dirty ? "Unsaved changes" : "Saved"}</span>
          </div>
          <div className="button-row">
            {nodeTypes.map((type) => (
              <button key={type} onClick={() => addNodeOfType(type)} disabled={disabled}>
                <Plus size={14} />
                {type}
              </button>
            ))}
            <button onClick={copySelection} disabled={!selectedNodeIds.length && !selectedNode}>
              <Copy size={14} />
              Copy
            </button>
            <button onClick={pasteSelection} disabled={disabled || !clipboard}>
              Paste
            </button>
            <button onClick={deleteSelected} disabled={disabled || (!selectedNode && !selectedEdge && !selectedNodeIds.length)}>
              <Trash2 size={14} />
              Delete
            </button>
            <button className="primary-button" onClick={saveDraft} disabled={disabled || !dirty}>
              <Save size={14} />
              Save
            </button>
          </div>
        </div>
        <div className="graph-meta-row">
          <label>
            System name
            <input
              disabled={disabled}
              value={draft.label || draft.id}
              onChange={(event) =>
                updateDraft((current) => {
                  const name = safeId(event.target.value);
                  return { ...current, id: name, label: name };
                })
              }
            />
          </label>
          <label>
            Start node
            <select
              disabled={disabled}
              value={draft.entryNodeId}
              onChange={(event) => {
                const id = event.target.value;
                updateDraft((current) => ({ ...current, entryNodeId: id }));
                setSelectedNodeId(id);
                setSelectedEdgeId(null);
                setSelectedNodeIds([id]);
                setFlowNodes((current) => current.map((node) => ({ ...node, selected: node.id === id })));
              }}
            >
              {draft.nodes.map((node) => (
                <option value={node.id} key={node.id}>
                  {node.id}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="flow-wrap">
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodesConnectable={false}
            deleteKeyCode={null}
            selectionOnDrag
            panOnDrag={[2]}
            selectionKeyCode={null}
            onNodeClick={(_event, node) => {
              applySelection([node.id]);
            }}
            onEdgeClick={(_event, edge) => {
              applySelection([], [edge.id]);
            }}
            onSelectionChange={({ nodes: selectionNodes, edges: selectionEdges }) => {
              const nodeIds = selectionNodes.map((node) => node.id);
              const edgeIds = selectionEdges.map((edge) => edge.id);
              if (!nodeIds.length && !selectionEdges.length) return;
              applySelection(nodeIds, edgeIds);
            }}
            onPaneClick={() => {
              selectionKeyRef.current = "";
              setSelectedNodeId(null);
              setSelectedEdgeId(null);
              setSelectedNodeIds([]);
            }}
            onNodeDragStop={(_event, node) => updateNode(node.id, { position: node.position })}
            fitView
          >
            <Controls />
            <Background />
          </ReactFlow>
        </div>
      </section>

      <aside className="panel inspector-panel">
        <Inspector
          node={selectedNode}
          edge={selectedEdge}
          disabled={disabled}
          graph={draft}
          selectedNodeIds={selectedNodeIds}
          onRenameNode={renameNode}
          onUpdateNode={updateNode}
          onUpdateEdge={updateEdge}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
            setSelectedEdgeId(null);
            setSelectedNodeIds([id]);
          }}
          onSelectEdge={(id) => {
            setSelectedEdgeId(id);
            setSelectedNodeId(null);
            setSelectedNodeIds([]);
          }}
          onAddEdge={addEdgeFromPanel}
          onRemoveEdge={removeEdge}
        />
      </aside>
    </main>
  );
}

function Inspector({
  node,
  edge,
  disabled,
  graph,
  selectedNodeIds,
  onRenameNode,
  onUpdateNode,
  onUpdateEdge,
  onSelectNode,
  onSelectEdge,
  onAddEdge,
  onRemoveEdge
}: {
  node: PromptNode | null;
  edge: PromptEdge | null;
  disabled: boolean;
  graph: PromptGraph;
  selectedNodeIds: string[];
  onRenameNode: (oldId: string, nextValue: string) => void;
  onUpdateNode: (id: string, patch: Partial<PromptNode>) => void;
  onUpdateEdge: (id: string, patch: Partial<PromptEdge>) => void;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
  onAddEdge: (edge: Omit<PromptEdge, "id">) => void;
  onRemoveEdge: (id: string) => void;
}) {
  if (edge) {
    return (
      <div className="inspector-stack">
        <h2>Edge</h2>
        <label>
          From
          <select disabled={disabled} value={edge.source} onChange={(event) => onUpdateEdge(edge.id, { source: event.target.value })}>
            {graph.nodes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          To
          <select disabled={disabled} value={edge.target} onChange={(event) => onUpdateEdge(edge.id, { target: event.target.value })}>
            {graph.nodes.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.id}
              </option>
            ))}
          </select>
        </label>
        <label>
          Label
          <input disabled={disabled} value={edge.label || ""} onChange={(event) => onUpdateEdge(edge.id, { label: event.target.value })} />
        </label>
        <label>
          Condition
          <input
            disabled={disabled}
            value={edge.condition || ""}
            placeholder="output.isLegal == true"
            onChange={(event) => onUpdateEdge(edge.id, { condition: event.target.value })}
          />
        </label>
        <button onClick={() => onRemoveEdge(edge.id)} disabled={disabled}>
          <Trash2 size={14} />
          Remove edge
        </button>
      </div>
    );
  }

  if (!node) {
    return (
      <div className="inspector-stack">
        <h2>Selection</h2>
        <div className="empty-state">
          Select a node or edge. Use box selection, then Ctrl+C and Ctrl+V to duplicate nodes. Edges are copied when both connected nodes are selected.
        </div>
        <AllEdges graph={graph} onSelectEdge={onSelectEdge} />
        <VariableList />
      </div>
    );
  }

  const incoming = graph.edges.filter((candidate) => candidate.target === node.id);
  const outgoing = graph.edges.filter((candidate) => candidate.source === node.id);

  return (
    <div className="inspector-stack">
      <h2>{node.id}</h2>
      {selectedNodeIds.length > 1 && <div className="selection-pill">{selectedNodeIds.length} nodes selected</div>}
      <label>
        Name
        <input disabled={disabled} value={node.id} onChange={(event) => onRenameNode(node.id, event.target.value)} />
      </label>
      <label>
        Type
        <select disabled={disabled} value={node.type} onChange={(event) => onUpdateNode(node.id, normalizeTypePatch(event.target.value as PromptNodeType))}>
          {nodeTypes.map((type) => (
            <option value={type} key={type}>
              {type}
            </option>
          ))}
        </select>
      </label>

      <NodeIO node={node} incoming={incoming} outgoing={outgoing} onSelectEdge={onSelectEdge} />

      {node.type === "llm" && (
        <>
          <label>
            Model
            <input disabled={disabled} value={node.model || ""} onChange={(event) => onUpdateNode(node.id, { model: event.target.value })} />
          </label>
          <div className="two-col">
            <label>
              Temperature
              <input
                disabled={disabled}
                type="number"
                step="0.1"
                value={node.temperature ?? 0}
                onChange={(event) => onUpdateNode(node.id, { temperature: Number(event.target.value) })}
              />
            </label>
            <label>
              Max tokens
              <input
                disabled={disabled}
                type="number"
                value={node.maxTokens ?? 96}
                onChange={(event) => onUpdateNode(node.id, { maxTokens: Number(event.target.value) })}
              />
            </label>
          </div>
          <label>
            System prompt
            <textarea disabled={disabled} value={node.systemPrompt || ""} onChange={(event) => onUpdateNode(node.id, { systemPrompt: event.target.value })} />
          </label>
          <label>
            User template
            <textarea disabled={disabled} value={node.promptTemplate || ""} onChange={(event) => onUpdateNode(node.id, { promptTemplate: event.target.value })} />
          </label>
          <VariableList />
        </>
      )}

      {node.type === "logic" && (
        <>
          <label>
            Logic
            <select
              disabled={disabled}
              value={node.logic?.kind || "always"}
              onChange={(event) =>
                onUpdateNode(node.id, {
                  logic: { ...(node.logic || { kind: "always" }), kind: event.target.value as LogicKind }
                })
              }
            >
              {logicKinds.map((kind) => (
                <option value={kind} key={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>
          {node.logic?.kind === "moveNumberEquals" && (
            <label>
              Move number
              <input
                disabled={disabled}
                value={node.logic?.compareValue || ""}
                onChange={(event) =>
                  onUpdateNode(node.id, {
                    logic: { ...(node.logic || { kind: "moveNumberEquals" }), compareValue: event.target.value }
                  })
                }
              />
            </label>
          )}
          {node.logic?.kind === "setMove" && (
            <label>
              Move value
              <input
                disabled={disabled}
                value={node.logic?.moveValue || ""}
                placeholder="e2e4"
                onChange={(event) =>
                  onUpdateNode(node.id, {
                    logic: { ...(node.logic || { kind: "setMove" }), moveValue: event.target.value }
                  })
                }
              />
            </label>
          )}
        </>
      )}

      {node.type === "parser" && (
        <label>
          Source node
          <select disabled={disabled} value={node.sourceNodeId || ""} onChange={(event) => onUpdateNode(node.id, { sourceNodeId: event.target.value || undefined })}>
            <option value="">Last LLM output</option>
            {graph.nodes
              .filter((candidate) => candidate.type === "llm")
              .map((candidate) => (
                <option value={candidate.id} key={candidate.id}>
                  {candidate.id}
                </option>
              ))}
          </select>
        </label>
      )}

      {node.type === "legal" && <div className="empty-state">Checks the candidate move against chess.js legal moves for the current FEN.</div>}

      <EdgeEditor
        node={node}
        graph={graph}
        incoming={incoming}
        outgoing={outgoing}
        disabled={disabled}
        onAddEdge={onAddEdge}
        onRemoveEdge={onRemoveEdge}
        onSelectNode={onSelectNode}
        onSelectEdge={onSelectEdge}
      />
    </div>
  );
}

function NodeIO({
  node,
  incoming,
  outgoing,
  onSelectEdge
}: {
  node: PromptNode;
  incoming: PromptEdge[];
  outgoing: PromptEdge[];
  onSelectEdge: (id: string) => void;
}) {
  return (
    <section className="io-section">
      <h3>Inputs</h3>
      <p>{inputDescription(node)}</p>
      <EdgeChips label="Incoming" edges={incoming} empty="No incoming edges" onSelectEdge={onSelectEdge} />
      <h3>Outputs</h3>
      <p>{outputDescription(node)}</p>
      <EdgeChips label="Outgoing" edges={outgoing} empty="No outgoing edges" onSelectEdge={onSelectEdge} />
    </section>
  );
}

function EdgeChips({
  label,
  edges,
  empty,
  onSelectEdge
}: {
  label: string;
  edges: PromptEdge[];
  empty: string;
  onSelectEdge: (id: string) => void;
}) {
  return (
    <div className="edge-chip-block">
      <span>{label}</span>
      {edges.length ? (
        <div className="edge-chip-list">
          {edges.map((edge) => (
            <button key={edge.id} onClick={() => onSelectEdge(edge.id)}>
              {edge.source}
              {" -> "}
              {edge.target}
            </button>
          ))}
        </div>
      ) : (
        <em>{empty}</em>
      )}
    </div>
  );
}

function EdgeEditor({
  node,
  graph,
  incoming,
  outgoing,
  disabled,
  onAddEdge,
  onRemoveEdge,
  onSelectNode,
  onSelectEdge
}: {
  node: PromptNode;
  graph: PromptGraph;
  incoming: PromptEdge[];
  outgoing: PromptEdge[];
  disabled: boolean;
  onAddEdge: (edge: Omit<PromptEdge, "id">) => void;
  onRemoveEdge: (id: string) => void;
  onSelectNode: (id: string) => void;
  onSelectEdge: (id: string) => void;
}) {
  const [target, setTarget] = useState("");
  const [source, setSource] = useState("");
  const [condition, setCondition] = useState("always");

  useEffect(() => {
    setTarget(graph.nodes.find((candidate) => candidate.id !== node.id)?.id || "");
    setSource(graph.nodes.find((candidate) => candidate.id !== node.id)?.id || "");
    setCondition("always");
  }, [graph.nodes, node.id]);

  return (
    <section className="edge-editor">
      <h3>Edges</h3>
      <div className="edge-table">
        {[...incoming, ...outgoing].map((edge) => (
          <div className="edge-row" key={edge.id}>
            <button onClick={() => onSelectEdge(edge.id)}>
              {edge.source}
              {" -> "}
              {edge.target}
            </button>
            <button className="icon-button" onClick={() => onRemoveEdge(edge.id)} disabled={disabled} title="Remove edge">
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
      <div className="edge-add-box">
        <label>
          Add outgoing to
          <select disabled={disabled} value={target} onChange={(event) => setTarget(event.target.value)}>
            {graph.nodes
              .filter((candidate) => candidate.id !== node.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.id}
                </option>
              ))}
          </select>
        </label>
        <label>
          Condition
          <input disabled={disabled} value={condition} onChange={(event) => setCondition(event.target.value)} />
        </label>
        <button disabled={disabled || !target} onClick={() => onAddEdge({ source: node.id, target, condition })}>
          <Plus size={14} />
          Add outgoing
        </button>
      </div>
      <div className="edge-add-box">
        <label>
          Add incoming from
          <select disabled={disabled} value={source} onChange={(event) => setSource(event.target.value)}>
            {graph.nodes
              .filter((candidate) => candidate.id !== node.id)
              .map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.id}
                </option>
              ))}
          </select>
        </label>
        <button disabled={disabled || !source} onClick={() => onAddEdge({ source, target: node.id, condition: "always" })}>
          <Plus size={14} />
          Add incoming
        </button>
      </div>
      <button className="subtle-button" onClick={() => onSelectNode(graph.entryNodeId)} disabled={!graph.entryNodeId}>
        Select start node
      </button>
    </section>
  );
}

function AllEdges({ graph, onSelectEdge }: { graph: PromptGraph; onSelectEdge: (id: string) => void }) {
  if (!graph.edges.length) return <div className="empty-state">No edges in this graph.</div>;
  return (
    <section className="edge-editor">
      <h3>All Edges</h3>
      <div className="edge-table">
        {graph.edges.map((edge) => (
          <button key={edge.id} onClick={() => onSelectEdge(edge.id)}>
            {edge.source}
            {" -> "}
            {edge.target}
          </button>
        ))}
      </div>
    </section>
  );
}

function VariableList() {
  return (
    <div className="variable-list">
      {variables.map((variable) => (
        <code key={variable}>{variable}</code>
      ))}
    </div>
  );
}

function inputDescription(node: PromptNode): string {
  if (node.type === "llm") return "Runtime variables and any prior node outputs referenced in prompts.";
  if (node.type === "parser") return "Raw text from the selected LLM node, or the latest LLM output.";
  if (node.type === "legal") return "Candidate move plus current legal move list.";
  if (node.logic?.kind === "moveNumberEquals") return "Current move number.";
  if (node.logic?.kind === "setMove") return "Fixed UCI move configured below.";
  return "Current runtime state.";
}

function outputDescription(node: PromptNode): string {
  if (node.type === "llm") return "output.text, raw assistant text, and token usage.";
  if (node.type === "parser") return "output.move and output.source.";
  if (node.type === "legal") return "output.isLegal, output.move, and output.legalMoves.";
  if (node.logic?.kind === "moveNumberEquals") return "output.match and output.moveNumber.";
  if (node.logic?.kind === "firstLegalMove") return "output.move with fallback=true.";
  return "A structured logic result used by outgoing edge conditions.";
}

function cloneNode(node: PromptNode): PromptNode {
  return JSON.parse(JSON.stringify(node)) as PromptNode;
}

function normalizeGraph(graph: PromptGraph): PromptGraph {
  const nodes = graph.nodes.map((node) => ({ ...node, label: node.id }));
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target));
  return {
    ...graph,
    label: graph.label || graph.id,
    entryNodeId: nodeIds.has(graph.entryNodeId) ? graph.entryNodeId : nodes[0]?.id || "",
    nodes,
    edges
  };
}

function normalizeTypePatch(type: PromptNodeType): Partial<PromptNode> {
  if (type === "llm") {
    return {
      type,
      model: DEFAULT_MODEL,
      temperature: 0.2,
      maxTokens: 96,
      systemPrompt: "Choose one legal chess move. Output UCI only.",
      promptTemplate: "FEN: {fen}\nLegal UCI moves: {legalMovesText}\nReturn one move.",
      logic: undefined,
      sourceNodeId: undefined
    };
  }
  if (type === "logic") {
    return {
      type,
      logic: { kind: "always" },
      systemPrompt: undefined,
      promptTemplate: undefined,
      sourceNodeId: undefined
    };
  }
  return {
    type,
    logic: undefined,
    systemPrompt: undefined,
    promptTemplate: undefined
  };
}
