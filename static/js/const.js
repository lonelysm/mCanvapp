// 공용 상수(ENUM-like)

const EShapeKind = {
    Select: "select",
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
};

// 툴 정의 (toolSelect 옵션 + 단축키를 data-driven으로 구성)
// - value: toolSelect.value로 들어가는 값(문자열)
// - display: UI 표시 텍스트
// - shortcut: 키보드 단축키 (대문자 1글자 권장)
// - isDefault: 시작 시 기본 선택 (1개만 true 권장)
const ShapeMenuList = [
    { value: EShapeKind.Select, display: "선택/이동", shortcut: "V", isDefault: true },
    { value: EShapeKind.Point, display: "점", shortcut: "P" },
    { value: EShapeKind.Line, display: "선", shortcut: "L" },
    { value: EShapeKind.Circle, display: "원", shortcut: "C" },
    { value: EShapeKind.Rect, display: "사각형", shortcut: "R" },
    { value: EShapeKind.Polygon, display: "다각형", shortcut: "G" },
    { value: EShapeKind.Freehand, display: "자유곡선", shortcut: "F" },
];

// 툴바 그룹 정의 (index.html 툴바 구조를 객체화). Util.createElement + for문으로 동적 생성.
export const ToolbarGroupInfos = [
    {
        label: "도구",
        controls: [
            { tag: "select", id: "toolSelect", className: "toolbar__control" },
        ],
    },
    {
        label: "선 색",
        controls: [
            { tag: "input", type: "color", id: "strokeColor", className: "toolbar__control", value: "#2f6df6" },
        ],
    },
    {
        label: "채움",
        controls: [
            { tag: "input", type: "checkbox", id: "fillEnabled", className: "toolbar__control", checked: true },
        ],
    },
    {
        label: "채움 색",
        controls: [
            { tag: "input", type: "color", id: "fillColor", className: "toolbar__control", value: "#2f6df633" },
        ],
    },
    {
        label: "두께",
        controls: [
            { tag: "input", type: "range", id: "lineWidth", className: "toolbar__control toolbar__control--range", min: "1", max: "18", step: "1", value: "3" },
            { tag: "output", id: "lineWidthOut", className: "toolbar__output", value: "3" },
        ],
    },
    {
        wrapperTag: "div",
        label: "확대",
        role: "group",
        ariaLabel: "확대/축소",
        controls: [
            { tag: "button", id: "zoomOutBtn", className: "btn", type: "button", title: "축소", textContent: "-" },
            { tag: "output", id: "zoomValueOut", className: "toolbar__output", value: "100%" },
            { tag: "button", id: "zoomInBtn", className: "btn", type: "button", title: "확대", textContent: "+" },
        ],
    },
    {
        controls: [
            { tag: "button", id: "undoBtn", className: "btn", type: "button", title: "되돌리기 (Ctrl+Z)", textContent: "되돌리기" },
        ],
    },
    {
        controls: [
            { tag: "button", id: "clearBtn", className: "btn btn--danger", type: "button", title: "전체 삭제", textContent: "전체 삭제" },
        ],
    },
];

export { EShapeKind, ShapeMenuList };
