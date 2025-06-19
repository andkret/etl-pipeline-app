// App.jsx
import React, { useCallback, useState, useRef, useEffect } from 'react'
import Papa from 'papaparse'
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
import './style.css'    // your CSS including toolbar styles

let id = 0
const getId = () => `node_${id++}`

// --- Custom node with side handles ---
function SideNode({ data }) {
  return (
    <div className="side-node">
      <Handle type="target" position={Position.Left} className="handle" />
      {data.label}
      <Handle type="source" position={Position.Right} className="handle" />
    </div>
  )
}
const nodeTypes = { sideNode: SideNode }

export default function App() {
  return (
    <ReactFlowProvider>
      <PipelineBuilder />
    </ReactFlowProvider>
  )
}

function PipelineBuilder() {
  const reactFlowWrapper = useRef(null)
  const [rfInstance, setRfInstance] = useState(null)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])

  // palette state
  const [groupedTools, setGroupedTools] = useState({})
  const [collapsed, setCollapsed] = useState({})

  // ---- ReactFlow handlers ----
  const onNodesChange = useCallback(chg => setNodes(nds => applyNodeChanges(chg, nds)), [])
  const onEdgesChange = useCallback(chg => setEdges(eds => applyEdgeChanges(chg, eds)), [])
  const onConnect    = useCallback(conn => setEdges(eds =>
    addEdge({ ...conn, markerEnd: { type: MarkerType.ArrowClosed } }, eds)
  ), [])

  const onDragOver = useCallback(evt => {
    evt.preventDefault()
    evt.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(evt => {
    evt.preventDefault()
    const bounds = reactFlowWrapper.current.getBoundingClientRect()
    const raw = evt.dataTransfer.getData('application/reactflow')
    if (!raw) return
    const { label } = JSON.parse(raw)
    const pos = rfInstance.project({
      x: evt.clientX - bounds.left,
      y: evt.clientY - bounds.top,
    })
    setNodes(nds => nds.concat({ id: getId(), type: 'sideNode', position: pos, data: { label } }))
  }, [rfInstance])

  // ---- Import / Export ----
  const exportJson = useCallback(() => {
    const flow = { nodes, edges }
    const dataStr = JSON.stringify(flow, null, 2)
    const blob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'architecture.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [nodes, edges])

  const importJson = useCallback(evt => {
    const file = evt.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const { nodes: inNodes, edges: inEdges } = JSON.parse(reader.result)
        setNodes(inNodes || [])
        setEdges(inEdges || [])
      } catch {
        alert('Invalid JSON file.')
      }
    }
    reader.readAsText(file)
    evt.target.value = ''
  }, [])

  // ---- Load & group CSV ----
  useEffect(() => {
    Papa.parse('/tools.csv', {
      download: true,
      header: false,
      skipEmptyLines: true,
      complete: ({ data }) => {
        const rows = data.slice(3)  // skip top headers
        const groups = {}
        rows.forEach(r => {
          const cat = r[1]?.trim()
          if (!cat) return
          groups[cat] = groups[cat] || []
          r.slice(2, 7).forEach(cell => {
            if (cell) {
              cell.toString()
                .split(/[,;]+|\s{2,}/)
                .map(t => t.trim())
                .filter(Boolean)
                .forEach(tool => {
                  if (!groups[cat].includes(tool)) groups[cat].push(tool)
                })
            }
          })
        })
        setGroupedTools(groups)
        // start collapsed
        const init = {}
        Object.keys(groups).forEach(c => { init[c] = true })
        setCollapsed(init)
      },
    })
  }, [])

  const toggleCategory = useCallback(cat => {
    setCollapsed(c => ({ ...c, [cat]: !c[cat] }))
  }, [])

  // draggable tool
  const ToolItem = ({ label }) => (
    <div
      className="tool"
      draggable
      onDragStart={e =>
        e.dataTransfer.setData(
          'application/reactflow',
          JSON.stringify({ label })
        )
      }
    >
      {label}
    </div>
  )

  return (
    <div className="dndflow">
      <aside className="tools-pane">
        <div className="tools-header">Tools</div>
        <div className="tools-content">
          {Object.entries(groupedTools).map(([cat, tools]) => (
            <div key={cat} className="tools-category">
              <div
                className="tools-category-header"
                onClick={() => toggleCategory(cat)}
              >
                {cat}
                <span className="toggle-indicator">
                  {collapsed[cat] ? '+' : '–'}
                </span>
              </div>
              <div className={`tools-items ${collapsed[cat] ? 'collapsed' : 'expanded'}`}>
                {tools.map(tool => <ToolItem key={tool} label={tool} />)}
              </div>
            </div>
          ))}
        </div>
      </aside>

      <div className="reactflow-wrapper" ref={reactFlowWrapper}>
        {/* import/export toolbar */}
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
  )
}
