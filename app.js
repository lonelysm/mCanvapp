// Canvas 기반 점/선/원/사각형/다각형/자유곡선 샘플 (JS only)

// ---------- 유틸 ----------

function clamp(value, minValue, maxValue) {
  return Math.max(minValue, Math.min(maxValue, value));
}

function distance(point1, point2) {
  const deltaX = point1.x - point2.x;
  const deltaY = point1.y - point2.y;
  return Math.hypot(deltaX, deltaY);
}

function subtract(point1, point2) {
  return { x: point1.x - point2.x, y: point1.y - point2.y };
}

function translatePoint(point, deltaX, deltaY) {
  return { x: point.x + deltaX, y: point.y + deltaY };
}

function rectFromPoints(startPoint, endPoint) {
  const x1 = Math.min(startPoint.x, endPoint.x);
  const y1 = Math.min(startPoint.y, endPoint.y);
  const x2 = Math.max(startPoint.x, endPoint.x);
  const y2 = Math.max(startPoint.y, endPoint.y);
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function isPointInsideRect(point, rect) {
  return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
}

function distanceToSegment(point, segmentStart, segmentEnd) {
  const segmentDeltaX = segmentEnd.x - segmentStart.x;
  const segmentDeltaY = segmentEnd.y - segmentStart.y;
  const pointDeltaX = point.x - segmentStart.x;
  const pointDeltaY = point.y - segmentStart.y;
  const segmentLengthSquared = segmentDeltaX * segmentDeltaX + segmentDeltaY * segmentDeltaY;
  const projectionT =
    segmentLengthSquared > 0
      ? clamp((pointDeltaX * segmentDeltaX + pointDeltaY * segmentDeltaY) / segmentLengthSquared, 0, 1)
      : 0;
  const projectedPoint = {
    x: segmentStart.x + segmentDeltaX * projectionT,
    y: segmentStart.y + segmentDeltaY * projectionT,
  };
  return distance(point, projectedPoint);
}

function isPointInsidePolygon(point, polygonPoints) {
  // Ray casting
  let inside = false;
  for (let pointIndex = 0, prevIndex = polygonPoints.length - 1; pointIndex < polygonPoints.length; prevIndex = pointIndex++) {
    const currentX = polygonPoints[pointIndex].x;
    const currentY = polygonPoints[pointIndex].y;
    const prevX = polygonPoints[prevIndex].x;
    const prevY = polygonPoints[prevIndex].y;
    const intersect =
      currentY > point.y !== prevY > point.y &&
      point.x < ((prevX - currentX) * (point.y - currentY)) / (prevY - currentY + 0.0000001) + currentX;
    if (intersect) inside = !inside;
  }
  return inside;
}

function uid(prefix) {
  const r = Math.random().toString(16).slice(2, 10);
  return `${prefix}_${Date.now()}_${r}`;
}

function getRequiredEl(id) {
  const el = document.getElementById(id);
  el ?? console.error(`[init] ${id} 엘리먼트를 찾지 못했습니다.`);
  if (el === null) throw new Error(`${id} 엘리먼트를 찾지 못했습니다.`);
  return el;
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
    lineWidth: clamp(lineWidthValue, 1, 50),
    fillEnabled: fillEnabledValue,
    fill,
  };
}

// ---------- DOM ----------

const canvasEl = getRequiredEl("canvas");
const hudEl = getRequiredEl("hud");
const toolSelectEl = getRequiredEl("toolSelect");
const lineWidthEl = getRequiredEl("lineWidth");
const lineWidthOutEl = getRequiredEl("lineWidthOut");
const undoBtnEl = getRequiredEl("undoBtn");
const clearBtnEl = getRequiredEl("clearBtn");
const shapeListEl = getRequiredEl("shapeList");

const EditorInputControllerCtor = window.EditorInputController ?? null;
EditorInputControllerCtor ??
  console.error("[init] EditorInputController를 찾지 못했습니다. index.html에서 editor_input_controller.js 로드 순서를 확인하세요.");
if (EditorInputControllerCtor === null) throw new Error("EditorInputController가 없어 실행할 수 없습니다.");

const CanvasRendererCtor = window.CanvasRenderer ?? null;
CanvasRendererCtor ??
  console.error("[init] CanvasRenderer를 찾지 못했습니다. index.html에서 canvas_renderer.js 로드 순서를 확인하세요.");
if (CanvasRendererCtor === null) throw new Error("CanvasRenderer가 없어 실행할 수 없습니다.");

const renderer = new CanvasRendererCtor({ canvas: canvasEl, hud: hudEl, gridStep: 32 });

// ---------- 상태 ----------

const editorState = {
  currentTool: "line",
  shapes: [],
  undoStack: [],
  selectedId: null,

  isPointerDown: false,
  pointerDownPos: null,
  pointerPos: null,

  draftShape: null,
  polygonDraft: null,

  dragStart: null,
  dragShapesSnapshot: null, // 드래그 시작 시 전체 스냅샷
  dragOriginal: new Map(), // 선택된 1개 도형의 원본
};

// ---------- 렌더 ----------

function render() {
  renderer.render({
    shapes: editorState.shapes,
    draftShape: editorState.draftShape,
    polygonDraft: editorState.polygonDraft,
    selectedId: editorState.selectedId,
    pointerPos: editorState.pointerPos,
    currentTool: editorState.currentTool,
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
      editorState.currentTool = "select";
      toolSelectEl.value = "select";
      render();
    });

    shapeListEl.appendChild(div);
  }
}

function shapeLabel(shape) {
  if (shape.kind === "point") return "점";
  if (shape.kind === "line") return "선";
  if (shape.kind === "circle") return "원";
  if (shape.kind === "rect") return "사각형";
  if (shape.kind === "polygon") return shape.isClosed ? "다각형" : "다각형(작성중)";
  if (shape.kind === "freehand") return "자유곡선";
  return "도형";
}

function shapeSub(shape) {
  if (shape.kind === "point") return `(${Math.round(shape.position.x)}, ${Math.round(shape.position.y)})`;
  if (shape.kind === "line")
    return `Start(${Math.round(shape.start.x)},${Math.round(shape.start.y)}) → End(${Math.round(shape.end.x)},${Math.round(shape.end.y)})`;
  if (shape.kind === "circle") return `Center(${Math.round(shape.center.x)},${Math.round(shape.center.y)}), r=${Math.round(shape.radius)}`;
  if (shape.kind === "rect") {
    const rect = rectFromPoints(shape.start, shape.end);
    return `x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.w)}, h=${Math.round(rect.h)}`;
  }
  if (shape.kind === "polygon") return `점 ${shape.points.length}개`;
  if (shape.kind === "freehand") return `점 ${shape.points.length}개`;
  return "";
}

// ---------- 좌표/히트테스트 ----------

function hitTest(shape, pointerPoint) {
  const tolerance = Math.max(6, shape.style.lineWidth + 6);

  if (shape.kind === "point") return distance(pointerPoint, shape.position) <= shape.radius + tolerance;
  if (shape.kind === "line") return distanceToSegment(pointerPoint, shape.start, shape.end) <= tolerance;

  if (shape.kind === "circle") {
    const centerDistance = distance(pointerPoint, shape.center);
    const edgeDistance = Math.abs(centerDistance - shape.radius);
    if (edgeDistance <= tolerance) return true;
    return shape.style.fillEnabled ? centerDistance <= shape.radius : false;
  }

  if (shape.kind === "rect") {
    const rect = rectFromPoints(shape.start, shape.end);
    if (shape.style.fillEnabled && isPointInsideRect(pointerPoint, rect)) return true;

    const topStartPoint = { x: rect.x, y: rect.y };
    const topEndPoint = { x: rect.x + rect.w, y: rect.y };
    const bottomStartPoint = { x: rect.x, y: rect.y + rect.h };
    const bottomEndPoint = { x: rect.x + rect.w, y: rect.y + rect.h };
    const leftStartPoint = { x: rect.x, y: rect.y };
    const leftEndPoint = { x: rect.x, y: rect.y + rect.h };
    const rightStartPoint = { x: rect.x + rect.w, y: rect.y };
    const rightEndPoint = { x: rect.x + rect.w, y: rect.y + rect.h };
    return (
      distanceToSegment(pointerPoint, topStartPoint, topEndPoint) <= tolerance ||
      distanceToSegment(pointerPoint, bottomStartPoint, bottomEndPoint) <= tolerance ||
      distanceToSegment(pointerPoint, leftStartPoint, leftEndPoint) <= tolerance ||
      distanceToSegment(pointerPoint, rightStartPoint, rightEndPoint) <= tolerance
    );
  }

  if (shape.kind === "polygon") {
    if (shape.points.length < 2) return false;
    for (let pointIndex = 0; pointIndex < shape.points.length - 1; pointIndex++) {
      if (distanceToSegment(pointerPoint, shape.points[pointIndex], shape.points[pointIndex + 1]) <= tolerance) return true;
    }
    if (shape.isClosed && shape.points.length >= 3) {
      if (distanceToSegment(pointerPoint, shape.points[shape.points.length - 1], shape.points[0]) <= tolerance) return true;
      return shape.style.fillEnabled ? isPointInsidePolygon(pointerPoint, shape.points) : false;
    }
    return false;
  }

  if (shape.kind === "freehand") {
    for (let pointIndex = 0; pointIndex < shape.points.length - 1; pointIndex++) {
      if (distanceToSegment(pointerPoint, shape.points[pointIndex], shape.points[pointIndex + 1]) <= tolerance) return true;
    }
    return false;
  }

  return false;
}

function pickShape(pointerPoint) {
  // 상단(나중에 그린 것) 우선
  for (let shapeIndex = editorState.shapes.length - 1; shapeIndex >= 0; shapeIndex--) {
    const shape = editorState.shapes[shapeIndex];
    if (hitTest(shape, pointerPoint)) return shape;
  }
  return null;
}

// ---------- 상태 변경 ----------

function setTool(tool) {
  editorState.currentTool = tool;
  toolSelectEl.value = tool;
  if (editorState.polygonDraft !== null && tool !== "polygon") finalizePolygon();
  render();
}

function pushUndoSnapshot(snapshot) {
  editorState.undoStack.push(snapshot ?? structuredClone(editorState.shapes));
  if (editorState.undoStack.length > 50) editorState.undoStack.shift();
}

function undo() {
  const prev = editorState.undoStack.pop();
  if (!prev) return;
  editorState.shapes = prev;
  editorState.selectedId = null;
  editorState.draftShape = null;
  editorState.polygonDraft = null;
  render();
}

function clearAll() {
  pushUndoSnapshot();
  editorState.shapes = [];
  editorState.selectedId = null;
  editorState.draftShape = null;
  editorState.polygonDraft = null;
  render();
}

function addShape(s) {
  pushUndoSnapshot();
  editorState.shapes.push(s);
  editorState.selectedId = s.id;
  render();
}

function deleteSelected() {
  if (editorState.selectedId === null) return;
  const idx = editorState.shapes.findIndex((s) => s.id === editorState.selectedId);
  if (idx < 0) return;
  pushUndoSnapshot();
  editorState.shapes.splice(idx, 1);
  editorState.selectedId = null;
  render();
}

function finalizePolygon() {
  if (editorState.polygonDraft === null) return;
  if (editorState.polygonDraft.points.length >= 3) {
    pushUndoSnapshot();
    const final = { ...editorState.polygonDraft, isClosed: true };
    editorState.shapes.push(final);
    editorState.selectedId = final.id;
  }
  editorState.polygonDraft = null;
  render();
}

function isDraftValid(shape) {
  if (shape.kind === "line") return distance(shape.start, shape.end) >= 3;
  if (shape.kind === "rect") {
    const rect = rectFromPoints(shape.start, shape.end);
    return rect.w >= 3 && rect.h >= 3;
  }
  if (shape.kind === "circle") return shape.radius >= 3;
  if (shape.kind === "freehand")
    return shape.points.length >= 2 && distance(shape.points[0], shape.points[shape.points.length - 1]) >= 2;
  return true;
}

function moveShape(shape, deltaX, deltaY) {
  if (shape.kind === "point") return { ...shape, position: translatePoint(shape.position, deltaX, deltaY) };
  if (shape.kind === "line")
    return { ...shape, start: translatePoint(shape.start, deltaX, deltaY), end: translatePoint(shape.end, deltaX, deltaY) };
  if (shape.kind === "circle") return { ...shape, center: translatePoint(shape.center, deltaX, deltaY) };
  if (shape.kind === "rect")
    return { ...shape, start: translatePoint(shape.start, deltaX, deltaY), end: translatePoint(shape.end, deltaX, deltaY) };
  if (shape.kind === "polygon")
    return { ...shape, points: shape.points.map((point) => translatePoint(point, deltaX, deltaY)) };
  if (shape.kind === "freehand")
    return { ...shape, points: shape.points.map((point) => translatePoint(point, deltaX, deltaY)) };
  return shape;
}

// ---------- 바인딩 ----------

function bindUI() {
  lineWidthOutEl.value = String(lineWidthEl.value);

  toolSelectEl.addEventListener("change", () => {
    setTool(toolSelectEl.value);
  });

  lineWidthEl.addEventListener("input", () => {
    lineWidthOutEl.value = String(lineWidthEl.value);
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

  editorState.shapes.push({ id: uid("rc"), kind: "rect", start: { x: 120, y: 100 }, end: { x: 420, y: 280 }, style: style1 });
  editorState.shapes.push({ id: uid("ci"), kind: "circle", center: { x: 650, y: 220 }, radius: 90, style: style2 });
  editorState.shapes.push({ id: uid("ln"), kind: "line", start: { x: 160, y: 420 }, end: { x: 520, y: 540 }, style: style3 });
  editorState.shapes.push({
    id: uid("pt"),
    kind: "point",
    position: { x: 820, y: 420 },
    radius: 6,
    style: { ...style3, stroke: "#ff4d4d" },
  });
  editorState.shapes.push({
    id: uid("poly"),
    kind: "polygon",
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
  bindUI();

  const getCanvasPointFromEvent = (event) => {
    const rect = canvasEl.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const inputController = new EditorInputControllerCtor({
    canvasElement: canvasEl,
    state: editorState,
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
    uid,
  });
  inputController.attach();

  seed();
  render();
  window.addEventListener("resize", () => render());
}

main();

