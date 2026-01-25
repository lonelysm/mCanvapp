// 공용 상수(ENUM-like)
// JS에는 enum 문법이 없어서 Object.freeze로 “열거형처럼” 사용합니다.

const EShapeKind = Object.freeze({
  // PascalCase (사용 예: EShapeKind.Point)
  Point: "point",
  Line: "line",
  Circle: "circle",
  Rect: "rect",
  Polygon: "polygon",
  Freehand: "freehand",

  // UPPERCASE (기존 코드 호환)
  POINT: "point",
  LINE: "line",
  CIRCLE: "circle",
  RECT: "rect",
  POLYGON: "polygon",
  FREEHAND: "freehand",
});

window.EShapeKind = EShapeKind;

// 편집기 "툴" 값 (select는 도형이 아니라 편집 동작이므로 별도 상수로 둡니다)
const EToolValue = Object.freeze({
  Select: "select",
});

window.EToolValue = EToolValue;

// 툴 정의 (toolSelect 옵션 + 단축키를 data-driven으로 구성)
// - value: toolSelect.value로 들어가는 값(문자열)
// - display: UI 표시 텍스트
// - shortcut: 키보드 단축키 (대문자 1글자 권장)
// - isDefault: 시작 시 기본 선택 (1개만 true 권장)
const tools = Object.freeze([
  Object.freeze({ value: EToolValue.Select, display: "선택/이동", shortcut: "V" }),
  Object.freeze({ value: EShapeKind.Point, display: "점", shortcut: "P" }),
  Object.freeze({ value: EShapeKind.Line, display: "선", shortcut: "L", isDefault: true }),
  Object.freeze({ value: EShapeKind.Circle, display: "원", shortcut: "C" }),
  Object.freeze({ value: EShapeKind.Rect, display: "사각형", shortcut: "R" }),
  Object.freeze({ value: EShapeKind.Polygon, display: "다각형", shortcut: "G" }),
  Object.freeze({ value: EShapeKind.Freehand, display: "자유곡선", shortcut: "F" }),
]);

window.tools = tools;

