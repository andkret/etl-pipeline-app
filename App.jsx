// App.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactFlow, {
  ReactFlowProvider,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  MiniMap,
  Controls,
  Background,
  MarkerType,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import './style.css';

let id = 0;
const getId = () => `node_${id++}`;

function SideNode({ id, data }) {
  return (
    <div className="side-node">
      <button className="node-delete-btn" onClick={() => data.onDelete(id)}>🗑️</button>
      <Handle type="target" position={Position.Left} style={{ top: '50%', transform: 'translateY(-50%)' }} />
      {data.isCustom ? (
        <input
          className="node-label-input"
          value={data.label}
          onChange={(e) => data.onLabelChange(id, e.target.value)}
        />
      ) : (
        <div className="node-label">{data.label}</div>
      )}
      <textarea
        className="node-desc"
        value={data.description}
        onChange={(e) => data.onDescriptionChange(id, e.target.value)}
      />
      <Handle type="source" position={Position.Right} style={{ top: '50%', transform: 'translateY(-50%)' }} />
    </div>
  );
}

const nodeTypes = { sideNode: SideNode };

export default function App() {
  return (
    <ReactFlowProvider>
      <PipelineBuilder />
    </ReactFlowProvider>
  );
}

function PipelineBuilder() {
  const wrapperRef = useRef(null);
  const [rfInstance, setRfInstance] = useState(null);
  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [groupedTools, setGroupedTools] = useState({});
  const [collapsed, setCollapsed] = useState({});
  const [descriptions, setDescriptions] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [designFiles, setDesignFiles] = useState([]);

  const onDescriptionChange = useCallback((nodeId, desc) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, description: desc } } : n
      )
    );
  }, []);

  const handleDeleteNode = useCallback((nodeId) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) =>
      eds.filter((e) => e.source !== nodeId && e.target !== nodeId)
    );
  }, []);

  const handleLabelChange = useCallback((nodeId, label) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, label } } : n
      )
    );
  }, []);

  const loadDiagram = useCallback((jsonPath) => {
    fetch(jsonPath)
      .then((res) => res.json())
      .then(({ nodes: inN = [], edges: inE = [] }) => {
        let maxIndex = -1;
        const remapped = inN.map((n) => {
          const m = /^node_(\d+)$/.exec(n.id);
          if (m) {
            const idx = Number(m[1]);
            if (idx > maxIndex) maxIndex = idx;
          }
          return {
            ...n,
            data: {
              ...n.data,
              onDescriptionChange,
              onDelete: handleDeleteNode,
              onLabelChange: handleLabelChange,
              isCustom: n.data.isCustom || false,
            },
          };
        });
        id = maxIndex + 1;
        setNodes(remapped);
        setEdges(inE);
      })
      .catch(console.error);
  }, [onDescriptionChange, handleDeleteNode, handleLabelChange]);

  useEffect(() => {
    loadDiagram('architecture-template.json');
  }, [loadDiagram]);

  useEffect(() => {
    const before = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', before);
    return () => window.removeEventListener('beforeunload', before);
  }, []);

  useEffect(() => {
    fetch('tools.json')
      .then((res) => res.json())
      .then((data) => {
        const platforms = ['AWS', 'Azure', 'GCP', 'Open Source', 'Vendor'];
        const nested = {};
        platforms.forEach((p) => (nested[p] = {}));
        data.forEach((entry) => {
          platforms.forEach((p) => {
            const arr = entry[p] || [];
            if (!arr.length) return;
            if (!nested[p][entry.category]) nested[p][entry.category] = {};
            const types = nested[p][entry.category];
            if (!types[entry.type]) types[entry.type] = [];
            arr.forEach((toolName) => {
              if (!types[entry.type].includes(toolName)) {
                types[entry.type].push(toolName);
              }
            });
          });
        });
        setGroupedTools(nested);

        const init = {};
        platforms.forEach((p) => {
          init[`plat|${p}`] = true;
          Object.entries(nested[p]).forEach(([cat, types]) => {
            init[`cat|${p}|${cat}`] = true;
            Object.keys(types).forEach((type) => {
              init[`type|${p}|${cat}|${type}`] = true;
            });
          });
        });
        setCollapsed(init);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch('toolDescriptions.json')
      .then((res) => res.json())
      .then((arr) => {
        const map = {};
        arr.forEach(({ tool, description }) => {
          map[tool] = description;
        });
        setDescriptions(map);
      })
      .catch(console.error);
  }, []);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);
  const onConnect = useCallback((conn) =>
    setEdges((eds) =>
      addEdge({ ...conn, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
    ), []);

  const onDragOver = useCallback((e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);
  const onDrop = useCallback((e) => {
    e.preventDefault();
    if (!rfInstance) return;
    const bounds = wrapperRef.current.getBoundingClientRect();
    let payload;
    try {
      payload = JSON.parse(e.dataTransfer.getData('application/reactflow'));
    } catch {
      return;
    }
    const position = rfInstance.project({ x: e.clientX - bounds.left, y: e.clientY - bounds.top });
    const nid = getId();
    setNodes((nds) => [
      ...nds,
      {
        id: nid,
        type: 'sideNode',
        position,
        data: {
          id: nid,
          label: payload.label,
          description: descriptions[payload.label] || '',
          onDescriptionChange,
          onDelete: handleDeleteNode,
          onLabelChange: handleLabelChange,
          isCustom: payload.isCustom || false,
        },
      },
    ]);
  }, [rfInstance, descriptions, onDescriptionChange, handleDeleteNode, handleLabelChange]);

  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'architecture.json';
    a.click();
  }, [nodes, edges]);

  const importJson = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { nodes: inN = [], edges: inE = [] } = JSON.parse(reader.result);
        let maxIndex = -1;
        const remapped = inN.map((n) => {
          const m = /^node_(\d+)$/.exec(n.id);
          if (m) {
            const idx = Number(m[1]);
            if (idx > maxIndex) maxIndex = idx;
          }
          return {
            ...n,
            data: {
              ...n.data,
              onDescriptionChange,
              onDelete: handleDeleteNode,
              onLabelChange: handleLabelChange,
              isCustom: n.data.isCustom || false,
            },
          };
        });
        id = maxIndex + 1;
        setNodes(remapped);
        setEdges(inE);
      } catch {
        alert('Invalid JSON file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [onDescriptionChange, handleDeleteNode, handleLabelChange]);

  const clearDiagram = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, []);

  const fetchDesignFiles = async () => {
    try {
    const res = await fetch(new URL('./designs/index.json', import.meta.url));
    const text = await res.text();
    
    const files = JSON.parse(text);
    setDesignFiles(files);
  } catch (err) {
    console.error('Failed to load designs:', err);
  }
  };

  const toggle = useCallback((key) => {
    setCollapsed((c) => ({ ...c, [key]: !c[key] }));
  }, []);

  const ToolItem = ({ label, isCustom = false }) => (
    <div
      className="tool"
      draggable
      onDragStart={(e) =>
        e.dataTransfer.setData('application/reactflow', JSON.stringify({ label, isCustom }))
      }
    >
      {label}
    </div>
  );

  const handleLoadDesign = () => {
    fetchDesignFiles();
    setShowModal(true);
  };

  const handleSelectDesign = (filename) => {
    setShowModal(false);
    clearDiagram();
    loadDiagram(`./designs/${filename}`);
  };

  return (
    <div className="dndflow">
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>Select a Design</h3>
            <div className="modal-list">
              {designFiles.map((file) => (
                <div key={file} className="modal-item" onClick={() => handleSelectDesign(file)}>
                  {file}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <aside className="tools-pane">
        <div className="promo">
          <div>Check out our Academy & Coaching. 30% Summer Sale at:</div>
          <a
            href="https://learndataengineering.com"
            target="_blank"
            rel="noopener noreferrer"
          >
            <img src="LDE-Logo.png" alt="LDE Logo" />
          </a>
        </div>
        <div className="tools-header">Tools</div>
        <div className="tools-content">
          {Object.entries(groupedTools).map(([platform, categories]) => {
            const pKey = `plat|${platform}`;
            return (
              <div key={platform} className="tools-category">
                <div
                  className="tools-category-header tools-level-1"
                  onClick={() => toggle(pKey)}
                >
                  {platform}{' '}
                  <span className="toggle-indicator">{collapsed[pKey] ? '+' : '–'}</span>
                </div>
                <div className={`tools-items ${collapsed[pKey] ? '' : 'expanded'}`}>
                  {Object.entries(categories).map(([category, types]) => {
                    const cKey = `cat|${platform}|${category}`;
                    const typeKeys = Object.keys(types);
                    return (
                      <div key={category}>
                        <div
                          className="tools-category-header tools-level-2"
                          onClick={() => toggle(cKey)}
                        >
                          {category}{' '}
                          <span className="toggle-indicator">{collapsed[cKey] ? '+' : '–'}</span>
                        </div>
                        <div className={`tools-items ${collapsed[cKey] ? '' : 'expanded'}`}>
                          {typeKeys.map((type) => {
                            const tKey = `type|${platform}|${category}|${type}`;
                            return (
                              <React.Fragment key={type}>
                                <div
                                  className="tools-category-header tools-level-3"
                                  onClick={() => toggle(tKey)}
                                >
                                  {type}{' '}
                                  <span className="toggle-indicator">{collapsed[tKey] ? '+' : '–'}</span>
                                </div>
                                <div className={`tools-items ${collapsed[tKey] ? '' : 'expanded'}`}>
                                  {types[type].map((t) => (
                                    <ToolItem key={t} label={t} />
                                  ))}
                                </div>
                              </React.Fragment>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                  <div className="tools-footer" style={{ padding: '8px' }}>
                    <ToolItem label="➕ Custom Element" isCustom={true} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </aside>

      <div className="reactflow-wrapper" ref={wrapperRef}>
        <div className="toolbar-left">
          <button onClick={clearDiagram}>Clear Diagram</button>
          <button onClick={handleLoadDesign}>Load Design</button>
        </div>
        <div className="toolbar">
          <button onClick={exportJson}>Export JSON</button>
          <label className="import-label">
            Import JSON
            <input
              type="file"
              accept="application/json"
              onChange={importJson}
              style={{ display: 'none' }}
            />
          </label>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onInit={setRfInstance}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDragOver={onDragOver}
          onDrop={onDrop}
          nodeTypes={nodeTypes}
          fitView
        >
          <MiniMap />
          <Controls />
          <Background variant="dots" gap={12} size={1} />
        </ReactFlow>
      </div>
    </div>
  );
}
