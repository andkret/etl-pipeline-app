// App.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react'
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
} from 'reactflow'
import 'reactflow/dist/style.css'
import './style.css'

/**
 * Global ID counter to ensure each node gets a unique identifier.
 * We increment this counter on each getId() call.
 */
let id = 0
const getId = () => `node_${id++}`

/**
 * SideNode
 * Custom React Flow node component that renders:
 *  - A fixed-size container with a label and editable textarea
 *  - Connection handles on the left (target) and right (source)
 */
function SideNode({ id, data }) {
  return (
    <div className="side-node">
      {/* Incoming connection handle, vertically centered */}
      <Handle
        type="target"
        position={Position.Left}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />

      {/* Node label */}
      <div className="node-label">{data.label}</div>

      {/* Editable description area */}
      <textarea
        className="node-desc"
        value={data.description}
        onChange={e => data.onDescriptionChange(id, e.target.value)}
      />

      {/* Outgoing connection handle, vertically centered */}
      <Handle
        type="source"
        position={Position.Right}
        style={{ top: '50%', transform: 'translateY(-50%)' }}
      />
    </div>
  )
}

// Register our custom node type under the key "sideNode"
const nodeTypes = { sideNode: SideNode }

/**
 * App
 * Top-level component that provides the React Flow context.
 */
export default function App() {
  return (
    <ReactFlowProvider>
      <PipelineBuilder />
    </ReactFlowProvider>
  )
}

/**
 * PipelineBuilder
 * Main component that renders:
 *  - A sidebar for dragging tools onto the canvas
 *  - The React Flow canvas for building the pipeline
 *
 * Responsibilities:
 * 1. Load and structure tool definitions from tools.json
 * 2. Load default descriptions from toolDescriptions.json
 * 3. Manage React Flow state: nodes, edges, connections
 * 4. Handle drag & drop from sidebar to canvas
 * 5. Export/import pipeline JSON (with ID collision handling)
 */
function PipelineBuilder() {
  const wrapperRef = useRef(null)          // Ref to the React Flow wrapper DOM element
  const [rfInstance, setRfInstance] = useState(null) // React Flow instance for coordinate transforms

  // Canvas state
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])

  // Sidebar state: structured tools and collapse flags
  const [groupedTools, setGroupedTools] = useState({})
  const [collapsed, setCollapsed] = useState({})

  // Default descriptions loaded from JSON
  const [descriptions, setDescriptions] = useState({})

  /**
   * Load tools.json once on mount.
   * Builds a nested object: platform → category → type → [tool names]
   * Also initializes collapse state for sidebar sections.
   */
  useEffect(() => {
    fetch('/tools.json')
      .then(res => res.json())
      .then(data => {
        const platforms = ['AWS', 'Azure', 'GCP', 'Open Source', 'Vendor']
        const nested = {}
        platforms.forEach(p => (nested[p] = {}))

        data.forEach(entry => {
          platforms.forEach(p => {
            const arr = entry[p] || []
            if (!arr.length) return
            // Create category container
            nested[p][entry.category] = nested[p][entry.category] || {}
            const types = nested[p][entry.category]
            // Create type array
            types[entry.type] = types[entry.type] || []
            // Append tools, avoiding duplicates
            arr.forEach(toolName => {
              if (!types[entry.type].includes(toolName)) {
                types[entry.type].push(toolName)
              }
            })
          })
        })

        setGroupedTools(nested)

        // Initialize collapse flags: everything collapsed by default
        const init = {}
        platforms.forEach(p => {
          init[`plat|${p}`] = true
          Object.entries(nested[p]).forEach(([cat, types]) => {
            init[`cat|${p}|${cat}`] = true
            if (Object.keys(types).length > 1) {
              Object.keys(types).forEach(type => {
                init[`type|${p}|${cat}|${type}`] = true
              })
            }
          })
        })
        setCollapsed(init)
      })
      .catch(console.error)
  }, [])

  /**
   * Load default tool descriptions from JSON on mount.
   * Maps tool name → description string.
   */
  useEffect(() => {
    fetch('/toolDescriptions.json')
      .then(res => res.json())
      .then(arr => {
        const map = {}
        arr.forEach(({ tool, description }) => {
          map[tool] = description
        })
        setDescriptions(map)
      })
      .catch(console.error)
  }, [])

  /**
   * onDescriptionChange
   * Updates a node's `data.description` as the user types.
   */
  const onDescriptionChange = useCallback((nodeId, desc) => {
    setNodes(nds =>
      nds.map(n =>
        n.id === nodeId ? { ...n, data: { ...n.data, description: desc } } : n
      )
    )
  }, [])

  // React Flow built-in handlers
  const onNodesChange = useCallback(changes => setNodes(nds => applyNodeChanges(changes, nds)), [])
  const onEdgesChange = useCallback(changes => setEdges(eds => applyEdgeChanges(changes, eds)), [])
  const onConnect = useCallback(conn =>
    setEdges(eds =>
      addEdge({ ...conn, animated: true, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
    ), []
  )
  const onDragOver = useCallback(e => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  /**
   * onDrop
   * Handles dragging a tool from the sidebar onto the canvas.
   * Always appends a new node to the current `nodes` array via functional update.
   */
  const onDrop = useCallback(
    e => {
      e.preventDefault()
      const bounds = wrapperRef.current.getBoundingClientRect()
      let payload
      try {
        payload = JSON.parse(e.dataTransfer.getData('application/reactflow'))
      } catch {
        return
      }
      const position = rfInstance.project({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      })
      const nid = getId()
      setNodes(nds => [
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
          },
        },
      ])
    },
    [rfInstance, descriptions, onDescriptionChange]
  )

  /**
   * exportJson
   * Serializes current nodes & edges to JSON and triggers file download.
   */
  const exportJson = useCallback(() => {
    const blob = new Blob([JSON.stringify({ nodes, edges }, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'architecture.json'
    a.click()
  }, [nodes, edges])

  /**
   * importJson
   * Reads a JSON file, reattaches description callback, resets the module ID
   * counter to avoid collisions, and replaces the canvas in one shot.
   */
  const importJson = useCallback(
    e => {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        try {
          const { nodes: inN = [], edges: inE = [] } = JSON.parse(reader.result)
          let maxIndex = -1
          const remapped = inN.map(n => {
            const match = /^node_(\d+)$/.exec(n.id)
            if (match) {
              const idx = parseInt(match[1], 10)
              if (idx > maxIndex) maxIndex = idx
            }
            return {
              ...n,
              data: { ...n.data, onDescriptionChange, id: n.id },
            }
          })
          // move global counter past the highest imported ID
          id = maxIndex + 1
          setNodes(remapped)
          setEdges(inE)
        } catch {
          alert('Invalid JSON file.')
        }
      }
      reader.readAsText(file)
      e.target.value = ''
    },
    [onDescriptionChange]
  )

  /**
   * toggle
   * Toggles a boolean collapse flag in the sidebar state.
   */
  const toggle = useCallback(key => {
    setCollapsed(c => ({ ...c, [key]: !c[key] }))
  }, [])

  /**
   * ToolItem
   * Renders a draggable tool name in the sidebar.
   */
  const ToolItem = ({ label }) => (
    <div
      className="tool"
      draggable
      onDragStart={e =>
        e.dataTransfer.setData('application/reactflow', JSON.stringify({ label }))
      }
    >
      {label}
    </div>
  )

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="dndflow">
      {/* Sidebar with collapsible categories */}
      <aside className="tools-pane">
        <div className="tools-header">Tools</div>
        <div className="tools-content">
          {Object.entries(groupedTools).map(([platform, categories]) => {
            const pKey = `plat|${platform}`
            return (
              <div key={platform}>
                <div
                  className="tools-category-header tools-level-1"
                  onClick={() => toggle(pKey)}
                >
                  {platform}{' '}
                  <span className="toggle-indicator">
                    {collapsed[pKey] ? '+' : '–'}
                  </span>
                </div>
                <div
                  className={`tools-items ${
                    collapsed[pKey] ? 'collapsed' : 'expanded'
                  }`}
                >
                  {Object.entries(categories).map(([category, types]) => {
                    const cKey = `cat|${platform}|${category}`
                    const typeKeys = Object.keys(types)
                    if (typeKeys.length === 1) {
                      // Skip type level if only one type present
                      const tools = types[typeKeys[0]]
                      return (
                        <div key={category}>
                          <div
                            className="tools-category-header tools-level-2"
                            onClick={() => toggle(cKey)}
                          >
                            {category}{' '}
                            <span className="toggle-indicator">
                              {collapsed[cKey] ? '+' : '–'}
                            </span>
                          </div>
                          <div
                            className={`tools-items ${
                              collapsed[cKey] ? 'collapsed' : 'expanded'
                            }`}
                          >
                            {tools.map(t => (
                              <ToolItem key={t} label={t} />
                            ))}
                          </div>
                        </div>
                      )
                    }
                    return (
                      <div key={category}>
                        <div
                          className="tools-category-header tools-level-2"
                          onClick={() => toggle(cKey)}
                        >
                          {category}{' '}
                          <span className="toggle-indicator">
                            {collapsed[cKey] ? '+' : '–'}
                          </span>
                        </div>
                        <div
                          className={`tools-items ${
                            collapsed[cKey] ? 'collapsed' : 'expanded'
                          }`}
                        >
                          {typeKeys.map(type => {
                            const tKey = `type|${platform}|${category}|${type}`
                            const tools = types[type]
                            return (
                              <div key={type}>
                                <div
                                  className="tools-category-header tools-level-3"
                                  onClick={() => toggle(tKey)}
                                >
                                  {type}{' '}
                                  <span className="toggle-indicator">
                                    {collapsed[tKey] ? '+' : '–'}
                                  </span>
                                </div>
                                <div
                                  className={`tools-items ${
                                    collapsed[tKey] ? 'collapsed' : 'expanded'
                                  }`}
                                >
                                  {tools.map(t => (
                                    <ToolItem key={t} label={t} />
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </aside>

      {/* Canvas area with toolbar */}
      <div className="reactflow-wrapper" ref={wrapperRef}>
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

        {/* React Flow canvas */}
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
  )
}
