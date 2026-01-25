window.Util ?? console.error("[init] Util을 찾지 못했습니다. index.html에서 util.js 로드 순서를 확인하세요.");
if (window.Util === undefined) {
  throw new Error("Util이 없어 실행할 수 없습니다.");
}

window.EShapeKind ??
  console.error("[init] EShapeKind를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EShapeKind === undefined) {
  throw new Error("EShapeKind가 없어 실행할 수 없습니다.");
}

window.EToolValue ??
  console.error("[init] EToolValue를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.EToolValue === undefined) {
  throw new Error("EToolValue가 없어 실행할 수 없습니다.");
}

window.tools ??
  console.error("[init] tools를 찾지 못했습니다. index.html에서 const.js 로드 순서를 확인하세요.");
if (window.tools === undefined) {
  throw new Error("tools가 없어 실행할 수 없습니다.");
}

function readStyleFromUI() {
  const strokeColor = document.getElementById("strokeColor");
  const fillEnabled = document.getElementById("fillEnabled");
  const fillColor = document.getElementById("fillColor");
  const lineWidth = document.getElementById("lineWidth");

  strokeColor ?? console.error("[ui] strokeColor 엘리먼트를 찾지 못했습니다.");
  fillEnabled ?? console.error("[ui] fillEnabled 엘리먼트를 찾지 못했습니다.");
  fillColor ?? console.error("[ui] fillColor 엘리먼트를 찾지 못했습니다.");
  lineWidth ?? console.error("[ui] lineWidth 엘리먼트를 찾지 못했습니다.");

  const stroke = strokeColor?.value ?? "#2f6df6";
  const fillEnabledValue = fillEnabled?.checked ?? true;
  const fill = fillColor?.value ?? "#2f6df633";
  const lineWidthValue = Number(lineWidth?.value ?? 3);

  return {
    stroke,
    lineWidth: Util.clamp(lineWidthValue, 1, 50),
    fillEnabled: fillEnabledValue,
    fill,
  };
}

// ---------- DOM ----------

const canvasEl = Util.getRequiredEl("canvas");
const hudEl = Util.getRequiredEl("hud");
const toolSelectEl = Util.getRequiredEl("toolSelect");
const lineWidthEl = Util.getRequiredEl("lineWidth");
const lineWidthOutEl = Util.getRequiredEl("lineWidthOut");
const zoomOutBtnEl = Util.getRequiredEl("zoomOutBtn");
const zoomInBtnEl = Util.getRequiredEl("zoomInBtn");
const zoomValueOutEl = Util.getRequiredEl("zoomValueOut");
const undoBtnEl = Util.getRequiredEl("undoBtn");
const clearBtnEl = Util.getRequiredEl("clearBtn");
const shapeListEl = Util.getRequiredEl("shapeList");

const toolDefinitions = Array.isArray(window.tools) ? window.tools : [];

//--------------------------------------------------
// Get Object Instance
//--------------------------------------------------
const EditorInputControllerCtor = window.EditorInputController ?? null;
EditorInputControllerCtor ??
  console.error("[init] EditorInputController를 찾지 못했습니다. index.html에서 editor_input_controller.js 로드 순서를 확인하세요.");
if (EditorInputControllerCtor === null) {
  throw new Error("EditorInputController가 없어 실행할 수 없습니다.");
}

const CanvasRendererCtor = window.CanvasRenderer ?? null;
CanvasRendererCtor ??
  console.error("[init] CanvasRenderer를 찾지 못했습니다. index.html에서 canvas_renderer.js 로드 순서를 확인하세요.");
if (CanvasRendererCtor === null) {
  throw new Error("CanvasRenderer가 없어 실행할 수 없습니다.");
}

const renderer = new CanvasRendererCtor({ canvas: canvasEl, hud: hudEl, gridStep: 32 });

// ---------- 상태 ----------

const editorState = {
  currentTool: "line",
  shapes: [],
  undoStack: [],
  selectedId: null,

  viewScale: 1,

  isPointerDown: false,
  pointerDownPos: null,
  pointerPos: null,

  draftShape: null,
  draftPolygon: null,

  dragStart: null,
  dragShapesSnapshot: null, // 드래그 시작 시 전체 스냅샷
  dragOriginal: new Map(), // 선택된 1개 도형의 원본
};

// ---------- 렌더 ----------

function render() {
  renderer.render({
    shapes: editorState.shapes,
    draftShape: editorState.draftShape,
    draftPolygon: editorState.draftPolygon,
    selectedId: editorState.selectedId,
    pointerPos: editorState.pointerPos,
    currentTool: editorState.currentTool,
    viewScale: editorState.viewScale,
  });
  renderShapeList();
}

function renderShapeList() {
  const items = editorState.shapes
    .slice()
    .reverse()
    .map((s, idxFromEnd) => {
      const idx = editorState.shapes.length - 1 - idxFromEnd;
      const title = `${idx + 1}. ${shapeLabel(s)}`;
      const sub = shapeSub(s);
      const selected = editorState.selectedId === s.id;
      const swatch = s.style.stroke;
      return { id: s.id, title, sub, selected, swatch };
    });

  shapeListEl.innerHTML = "";
  for (const it of items) {
    const div = document.createElement("div");
    div.className = `shapeItem${it.selected ? " shapeItem--selected" : ""}`;
    div.dataset.id = it.id;

    const sw = document.createElement("div");
    sw.className = "shapeSwatch";
    sw.style.background = it.swatch;

    const meta = document.createElement("div");
    meta.className = "shapeMeta";

    const t = document.createElement("div");
    t.className = "shapeMeta__title";
    t.textContent = it.title;

    const subEl = document.createElement("div");
    subEl.className = "shapeMeta__sub";
    subEl.textContent = it.sub;

    meta.appendChild(t);
    meta.appendChild(subEl);
    div.appendChild(sw);
    div.appendChild(meta);
    div.addEventListener("click", () => {
      editorState.selectedId = it.id;
      setTool(window.EToolValue.Select);
    });

    shapeListEl.appendChild(div);
  }
}

function shapeLabel(shape) {
  if (shape.kind === EShapeKind.POINT) {
    return "점";
  }
  if (shape.kind === EShapeKind.LINE) {
    return "선";
  }
  if (shape.kind === EShapeKind.CIRCLE) {
    return "원";
  }
  if (shape.kind === EShapeKind.RECT) {
    return "사각형";
  }
  if (shape.kind === EShapeKind.POLYGON) {
    return shape.isClosed ? "다각형" : "다각형(작성중)";
  }
  if (shape.kind === EShapeKind.FREEHAND) {
    return "자유곡선";
  }
  return "도형";
}

function shapeSub(shape) {
  if (shape.kind === EShapeKind.POINT) {
    return `(${Math.round(shape.position.x)}, ${Math.round(shape.position.y)})`;
  }
  if (shape.kind === EShapeKind.LINE) {
    return `Start(${Math.round(shape.start.x)},${Math.round(shape.start.y)}) → End(${Math.round(shape.end.x)},${Math.round(
      shape.end.y
    )})`;
  }
  if (shape.kind === EShapeKind.CIRCLE) {
    return `Center(${Math.round(shape.center.x)},${Math.round(shape.center.y)}), r=${Math.round(shape.radius)}`;
  }
  if (shape.kind === EShapeKind.RECT) {
    const rect = Util.rectFromPoints(shape.start, shape.end);
    return `x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.w)}, h=${Math.round(rect.h)}`;
  }
  if (shape.kind === EShapeKind.POLYGON) {
    return `점 ${shape.points.length}개`;
  }
  if (shape.kind === EShapeKind.FREEHAND) {
    return `점 ${shape.points.length}개`;
  }
  return "";
}

// ---------- 좌표/히트테스트 ----------

function hitTest(shape, pointerPoint) {
  const tolerance = Math.max(6, shape.style.lineWidth + 6);

  if (shape.kind === EShapeKind.POINT) {
    return Util.distance(pointerPoint, shape.position) <= shape.radius + tolerance;
  }
  if (shape.kind === EShapeKind.LINE) {
    return Util.distanceToSegment(pointerPoint, shape.start, shape.end) <= tolerance;
  }

  if (shape.kind === EShapeKind.CIRCLE) {
    const centerDistance = Util.distance(pointerPoint, shape.center);
    const edgeDistance = Math.abs(centerDistance - shape.radius);
    if (edgeDistance <= tolerance) {
      return true;
    }
    return shape.style.fillEnabled ? centerDistance <= shape.radius : false;
  }

  if (shape.kind === EShapeKind.RECT) {
    const rect = Util.rectFromPoints(shape.start, shape.end);
    if (shape.style.fillEnabled && Util.isPointInsideRect(pointerPoint, rect)) {
      return true;
    }

    const topStartPoint = { x: rect.x, y: rect.y };
    const topEndPoint = { x: rect.x + rect.w, y: rect.y };
    const bottomStartPoint = { x: rect.x, y: rect.y + rect.h };
    const bottomEndPoint = { x: rect.x + rect.w, y: rect.y + rect.h };
    const leftStartPoint = { x: rect.x, y: rect.y };
    const leftEndPoint = { x: rect.x, y: rect.y + rect.h };
    const rightStartPoint = { x: rect.x + rect.w, y: rect.y };
    const rightEndPoint = { x: rect.x + rect.w, y: rect.y + rect.h };
    return (
      Util.distanceToSegment(pointerPoint, topStartPoint, topEndPoint) <= tolerance ||
      Util.distanceToSegment(pointerPoint, bottomStartPoint, bottomEndPoint) <= tolerance ||
      Util.distanceToSegment(pointerPoint, leftStartPoint, leftEndPoint) <= tolerance ||
      Util.distanceToSegment(pointerPoint, rightStartPoint, rightEndPoint) <= tolerance
    );
  }

  if (shape.kind === EShapeKind.POLYGON) {
    if (shape.points.length < 2) {
      return false;
    }
    for (let pointIndex = 0; pointIndex < shape.points.length - 1; pointIndex++) {
      if (Util.distanceToSegment(pointerPoint, shape.points[pointIndex], shape.points[pointIndex + 1]) <= tolerance) {
        return true;
      }
    }
    if (shape.isClosed && shape.points.length >= 3) {
      if (Util.distanceToSegment(pointerPoint, shape.points[shape.points.length - 1], shape.points[0]) <= tolerance) {
        return true;
      }
      return shape.style.fillEnabled ? Util.isPointInsidePolygon(pointerPoint, shape.points) : false;
    }
    return false;
  }

  if (shape.kind === EShapeKind.FREEHAND) {
    for (let pointIndex = 0; pointIndex < shape.points.length - 1; pointIndex++) {
      if (Util.distanceToSegment(pointerPoint, shape.points[pointIndex], shape.points[pointIndex + 1]) <= tolerance) {
        return true;
      }
    }
    return false;
  }

  return false;
}

function pickShape(pointerPoint) {
  // 상단(나중에 그린 것) 우선
  for (let shapeIndex = editorState.shapes.length - 1; shapeIndex >= 0; shapeIndex--) {
    const shape = editorState.shapes[shapeIndex];
    if (hitTest(shape, pointerPoint)) {
      return shape;
    }
  }
  return null;
}

// ---------- 상태 변경 ----------

function setTool(tool) {
  editorState.currentTool = tool;
  toolSelectEl.value = tool;
  if (editorState.draftPolygon !== null && tool !== EShapeKind.Polygon) {
    finalizePolygon();
  }
  render();
}

function applyToolSelectOptions(inTools) {
  toolSelectEl.innerHTML = "";
  for (const tool of inTools) {
    const option = document.createElement("option");
    option.value = tool.value;
    option.textContent = tool.shortcut ? `${tool.display} (${tool.shortcut})` : tool.display;
    toolSelectEl.appendChild(option);
  }
}

function getDefaultToolValue(inTools) {
  const defaultTool = inTools.find((t) => t && t.isDefault) ?? null;
  if (defaultTool) {
    return defaultTool.value;
  }

  const firstTool = inTools[0] ?? null;
  if (firstTool) {
    return firstTool.value;
  }

  return EShapeKind.Line;
}

function pushUndoSnapshot(snapshot) {
  editorState.undoStack.push(snapshot ?? structuredClone(editorState.shapes));
  if (editorState.undoStack.length > 50) {
    editorState.undoStack.shift();
  }
}

function undo() {
  const prev = editorState.undoStack.pop();
  if (!prev) {
    return;
  }
  editorState.shapes = prev;
  editorState.selectedId = null;
  editorState.draftShape = null;
  editorState.draftPolygon = null;
  render();
}

function clearAll() {
  pushUndoSnapshot();
  editorState.shapes = [];
  editorState.selectedId = null;
  editorState.draftShape = null;
  editorState.draftPolygon = null;
  render();
}

function addShape(s) {
  pushUndoSnapshot();
  editorState.shapes.push(s);
  editorState.selectedId = s.id;
  render();
}

function deleteSelected() {
  if (editorState.selectedId === null) {
    return;
  }
  const idx = editorState.shapes.findIndex((s) => s.id === editorState.selectedId);
  if (idx < 0) {
    return;
  }
  pushUndoSnapshot();
  editorState.shapes.splice(idx, 1);
  editorState.selectedId = null;
  render();
}

function finalizePolygon() {
  if (editorState.draftPolygon === null) {
    return;
  }
  if (editorState.draftPolygon.points.length >= 3) {
    pushUndoSnapshot();
    const final = { ...editorState.draftPolygon, isClosed: true };
    editorState.shapes.push(final);
    editorState.selectedId = final.id;
  }
  editorState.draftPolygon = null;
  render();
}

function isDraftValid(shape) {
  if (shape.kind === EShapeKind.LINE) {
    return Util.distance(shape.start, shape.end) >= 3;
  }
  if (shape.kind === EShapeKind.RECT) {
    const rect = Util.rectFromPoints(shape.start, shape.end);
    return rect.w >= 3 && rect.h >= 3;
  }
  if (shape.kind === EShapeKind.CIRCLE) {
    return shape.radius >= 3;
  }
  if (shape.kind === EShapeKind.FREEHAND) {
    return shape.points.length >= 2 && Util.distance(shape.points[0], shape.points[shape.points.length - 1]) >= 2;
  }
  return true;
}

function moveShape(shape, deltaX, deltaY) {
  if (shape.kind === EShapeKind.POINT) {
    return { ...shape, position: Util.translatePoint(shape.position, deltaX, deltaY) };
  }
  if (shape.kind === EShapeKind.LINE) {
    return {
      ...shape,
      start: Util.translatePoint(shape.start, deltaX, deltaY),
      end: Util.translatePoint(shape.end, deltaX, deltaY),
    };
  }
  if (shape.kind === EShapeKind.CIRCLE) {
    return { ...shape, center: Util.translatePoint(shape.center, deltaX, deltaY) };
  }
  if (shape.kind === EShapeKind.RECT) {
    return {
      ...shape,
      start: Util.translatePoint(shape.start, deltaX, deltaY),
      end: Util.translatePoint(shape.end, deltaX, deltaY),
    };
  }
  if (shape.kind === EShapeKind.POLYGON) {
    return { ...shape, points: shape.points.map((point) => Util.translatePoint(point, deltaX, deltaY)) };
  }
  if (shape.kind === EShapeKind.FREEHAND) {
    return { ...shape, points: shape.points.map((point) => Util.translatePoint(point, deltaX, deltaY)) };
  }
  return shape;
}

// ---------- 바인딩 ----------

function bindUI() {
  lineWidthOutEl.value = String(lineWidthEl.value);
  zoomValueOutEl.value = `${Math.round(editorState.viewScale * 100)}%`;

  toolSelectEl.addEventListener("change", () => {
    setTool(toolSelectEl.value);
  });

  lineWidthEl.addEventListener("input", () => {
    lineWidthOutEl.value = String(lineWidthEl.value);
    render();
  });

  zoomOutBtnEl.addEventListener("click", () => {
    const nextScale = Util.clamp(Number(editorState.viewScale) / 1.1, 0.2, 4);
    editorState.viewScale = Math.round(nextScale * 100) / 100;
    zoomValueOutEl.value = `${Math.round(editorState.viewScale * 100)}%`;
    render();
  });

  zoomInBtnEl.addEventListener("click", () => {
    const nextScale = Util.clamp(Number(editorState.viewScale) * 1.1, 0.2, 4);
    editorState.viewScale = Math.round(nextScale * 100) / 100;
    zoomValueOutEl.value = `${Math.round(editorState.viewScale * 100)}%`;
    render();
  });

  undoBtnEl.addEventListener("click", () => undo());
  clearBtnEl.addEventListener("click", () => clearAll());
}

// ---------- 초기 데이터 ----------

function seed() {
  const style1 = { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
  const style2 = { stroke: "#32d583", lineWidth: 4, fillEnabled: true, fill: "rgba(50,213,131,0.20)" };
  const style3 = { stroke: "#ffb020", lineWidth: 3, fillEnabled: false, fill: "rgba(0,0,0,0)" };

  editorState.shapes.push({
    id: Util.uid("rc"),
    kind: EShapeKind.RECT,
    start: { x: 120, y: 100 },
    end: { x: 420, y: 280 },
    style: style1,
  });
  editorState.shapes.push({
    id: Util.uid("ci"),
    kind: EShapeKind.CIRCLE,
    center: { x: 650, y: 220 },
    radius: 90,
    style: style2,
  });
  editorState.shapes.push({
    id: Util.uid("ln"),
    kind: EShapeKind.LINE,
    start: { x: 160, y: 420 },
    end: { x: 520, y: 540 },
    style: style3,
  });
  editorState.shapes.push({
    id: Util.uid("pt"),
    kind: EShapeKind.POINT,
    position: { x: 820, y: 420 },
    radius: 6,
    style: { ...style3, stroke: "#ff4d4d" },
  });
  editorState.shapes.push({
    id: Util.uid("poly"),
    kind: EShapeKind.POLYGON,
    points: [
      { x: 880, y: 120 },
      { x: 1030, y: 150 },
      { x: 1080, y: 260 },
      { x: 960, y: 300 },
      { x: 860, y: 220 },
    ],
    isClosed: true,
    style: { stroke: "#c084fc", lineWidth: 3, fillEnabled: true, fill: "rgba(192,132,252,0.22)" },
  });
}

function main() {
  applyToolSelectOptions(toolDefinitions);
  const defaultToolValue = getDefaultToolValue(toolDefinitions);
  editorState.currentTool = defaultToolValue;
  toolSelectEl.value = defaultToolValue;

  bindUI();

  const getCanvasPointFromEvent = (event) => {
    const rect = canvasEl.getBoundingClientRect();
    const scale = Number(editorState.viewScale) || 1;
    return { x: (event.clientX - rect.left) / scale, y: (event.clientY - rect.top) / scale };
  };

  const inputController = new EditorInputControllerCtor({
    canvasElement: canvasEl,
    state: editorState,
    toolDefinitions,
    readStyleFromUI,
    getCanvasPointFromEvent,
    render,
    setTool,
    pickShape,
    addShape,
    moveShape,
    finalizePolygon,
    deleteSelected,
    undo,
    pushUndoSnapshot,
    isDraftValid,
    uid: Util.uid,
  });
  inputController.attach();

  seed();
  render();
  window.addEventListener("resize", () => render());
}

main();

