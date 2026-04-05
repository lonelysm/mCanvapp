// 모양을 정의하는 클래스
// BaseShape는 모양들의 공통적인 속성들이 있으며 멤버 함수는 대부분 상속 클래스에서 구현한다

import { EShapeKind } from "./const.js";
import { Util } from "../util.js";

/**
 * 사각형에 라운드 값이 있으면 둥근 모서리 path를 생성한다.
 * @param {CanvasRenderingContext2D} ctx
 * @param {{ x: number, y: number, w: number, h: number }} rect
 * @param {number} cornerRadius
 */
function buildRoundedRectPath(ctx, rect, cornerRadius) {
    if (ctx === null || ctx === undefined) {
        console.warn("[buildRoundedRectPath] ctx가 없습니다.");
        return;
    }
    if (rect === null || rect === undefined) {
        console.warn("[buildRoundedRectPath] rect가 없습니다.");
        return;
    }
    const safeRadius = Math.max(0, Number(cornerRadius) || 0);
    const limitedRadius = Math.min(safeRadius, rect.w / 2, rect.h / 2);
    if (limitedRadius <= 0) {
        ctx.rect(rect.x, rect.y, rect.w, rect.h);
        return;
    }
    ctx.moveTo(rect.x + limitedRadius, rect.y);
    ctx.lineTo(rect.x + rect.w - limitedRadius, rect.y);
    ctx.arcTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + limitedRadius, limitedRadius);
    ctx.lineTo(rect.x + rect.w, rect.y + rect.h - limitedRadius);
    ctx.arcTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - limitedRadius, rect.y + rect.h, limitedRadius);
    ctx.lineTo(rect.x + limitedRadius, rect.y + rect.h);
    ctx.arcTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - limitedRadius, limitedRadius);
    ctx.lineTo(rect.x, rect.y + limitedRadius);
    ctx.arcTo(rect.x, rect.y, rect.x + limitedRadius, rect.y, limitedRadius);
    ctx.closePath();
}

class BaseShape {
    constructor(options) {
        this.id = options.id ?? Util.uid("INVALID_ID");
        this.kind = options.kind ?? "";
        this._displayName = options.displayName ?? "도형";
        this.style = options.style ?? { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
    }

    get displayName() {
        return this._displayName ?? "도형";
    }

    /** 아웃라이너·디테일 패널에서 표시 이름을 바꿀 때 사용한다. */
    setDisplayName(name) {
        if (typeof name !== "string") {
            console.warn("[BaseShape.setDisplayName] 문자열이 아님");
            return;
        }
        const trimmed = name.trim();
        if (trimmed === "") {
            console.warn("[BaseShape.setDisplayName] 빈 문자열");
            return;
        }
        this._displayName = trimmed;
    }

    getPosition() {
        return null;
    }

    // histroy를 위해서 복제해서 반환
    translate(deltaX, deltaY) {
        return this.clone();
    }

    clone() {
        throw new Error("clone() must be implemented by subclass");
    }

    hitTest(pointerPoint, tolerance) {
        return false;
    }

    getSubLabel() {
        return "";
    }

    updateDraftShape(pointerPoint) {
        throw new Error("updateDraftShape() must be implemented by subclass");
    }

    /** ctx에 this.style 적용. 서브클래스 drawShape에서 호출 */
    applyStyle(ctx) {
        if (ctx === null || ctx === undefined) {
            console.warn("[BaseShape.applyStyle] ctx가 없습니다.");
            return;
        }
        ctx.strokeStyle = this.style.stroke;
        ctx.fillStyle = this.style.fill;
        ctx.lineWidth = this.style.lineWidth;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";
    }

    /** 도형 본연의 모양을 ctx에 그린다. 서브클래스에서 구현 */
    drawShape(ctx) {
        if (ctx === null || ctx === undefined) {
            console.warn("[BaseShape.drawShape] ctx가 없습니다.");
            return;
        }
        throw new Error("drawShape(ctx) must be implemented by subclass");
    }

    /** 선택 시 표시할 아웃라인을 ctx에 그린다. 서브클래스에서 구현 */
    drawSelectionOutline(ctx) {
        if (ctx === null || ctx === undefined) {
            console.warn("[BaseShape.drawSelectionOutline] ctx가 없습니다.");
            return;
        }
        throw new Error("drawSelectionOutline(ctx) must be implemented by subclass");
    }

    // 다각형만 구현
    finalize() {}
}

class PointShape extends BaseShape {
    constructor(options) {
        options.id ??= Util.uid("pt");
        super({ ...options, kind: EShapeKind.POINT, displayName: "점" });
        this.position = options.position ?? { x: 0, y: 0 };
        this.radius = options.radius ?? 4;
    }

    getPosition() {
        return this.position;
    }

    translate(deltaX, deltaY) {
        return new PointShape({
            id: this.id,
            position: Util.translatePoint(this.position, deltaX, deltaY),
            radius: this.radius,
            style: this.style,
        });
    }

    clone() {
        return new PointShape({
            id: this.id,
            position: { ...this.position },
            radius: this.radius,
            style: { ...this.style },
        });
    }

    hitTest(pointerPoint, tolerance) {
        return Util.distance(pointerPoint, this.position) <= this.radius + tolerance;
    }

    getSubLabel() {
        return `(${Math.round(this.position.x)}, ${Math.round(this.position.y)})`;
    }

    updateDraftShape(pointerPoint) {
        // do nothing
    }

    drawShape(ctx) {
        this.applyStyle(ctx);
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = this.style.stroke;
        ctx.fill();
    }

    drawSelectionOutline(ctx) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.arc(this.position.x, this.position.y, this.radius + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

class LineShape extends BaseShape {
    constructor(options) {
        options.id ??= Util.uid("ln");
        super({ ...options, kind: EShapeKind.LINE, displayName: "선" });
        this.start = options.start ?? { x: 0, y: 0 };
        this.end = options.end ?? { x: 0, y: 0 };
    }

    getPosition() {
        return {
            x: (this.start.x + this.end.x) / 2,
            y: (this.start.y + this.end.y) / 2,
        };
    }

    translate(deltaX, deltaY) {
        return new LineShape({
            id: this.id,
            start: Util.translatePoint(this.start, deltaX, deltaY),
            end: Util.translatePoint(this.end, deltaX, deltaY),
            style: this.style,
        });
    }

    clone() {
        return new LineShape({
            id: this.id,
            start: { ...this.start },
            end: { ...this.end },
            style: { ...this.style },
        });
    }

    hitTest(pointerPoint, tolerance) {
        return Util.distanceToSegment(pointerPoint, this.start, this.end) <= tolerance;
    }

    getSubLabel() {
        return `Start(${Math.round(this.start.x)},${Math.round(this.start.y)}) ? End(${Math.round(this.end.x)},${Math.round(this.end.y)})`;
    }

    updateDraftShape(pointerPoint) {
        this.end = pointerPoint;
    }

    drawShape(ctx) {
        this.applyStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.stroke();
    }

    drawSelectionOutline(ctx) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.moveTo(this.start.x, this.start.y);
        ctx.lineTo(this.end.x, this.end.y);
        ctx.stroke();
        ctx.restore();
    }
}

class CircleShape extends BaseShape {
    constructor(options) {
        options.id ??= Util.uid("ci");
        super({ ...options, kind: EShapeKind.CIRCLE, displayName: "원" });
        this.center = options.center ?? { x: 0, y: 0 };
        this.radius = options.radius ?? 0;
    }

    getPosition() {
        return this.center;
    }

    translate(deltaX, deltaY) {
        return new CircleShape({
            id: this.id,
            center: Util.translatePoint(this.center, deltaX, deltaY),
            radius: this.radius,
            style: this.style,
        });
    }

    clone() {
        return new CircleShape({
            id: this.id,
            center: { ...this.center },
            radius: this.radius,
            style: { ...this.style },
        });
    }

    hitTest(pointerPoint, tolerance) {
        const centerDistance = Util.distance(pointerPoint, this.center);
        const edgeDistance = Math.abs(centerDistance - this.radius);
        if (edgeDistance <= tolerance) {
            return true;
        }
        return this.style.fillEnabled ? centerDistance <= this.radius : false;
    }

    getSubLabel() {
        return `Center(${Math.round(this.center.x)},${Math.round(this.center.y)}), r=${Math.round(this.radius)}`;
    }

    updateDraftShape(pointerPoint) {
        this.radius = Math.hypot(pointerPoint.x - this.center.x, pointerPoint.y - this.center.y);
    }

    drawShape(ctx) {
        this.applyStyle(ctx);
        ctx.beginPath();
        ctx.arc(this.center.x, this.center.y, Math.max(0, this.radius), 0, Math.PI * 2);
        if (this.style.fillEnabled) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawSelectionOutline(ctx) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.arc(this.center.x, this.center.y, Math.max(0, this.radius) + 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }
}

class RectShape extends BaseShape {
    constructor(options) {
        options.id ??= Util.uid("rc");
        super({ ...options, kind: EShapeKind.RECT, displayName: "사각형" });
        this.start = options.start ?? { x: 0, y: 0 };
        this.end = options.end ?? { x: 0, y: 0 };
        this.round = Math.max(0, Number(options.round) || 0);
    }

    getPosition() {
        const rect = Util.rectFromPoints(this.start, this.end);
        return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
    }

    translate(deltaX, deltaY) {
        return new RectShape({
            id: this.id,
            start: Util.translatePoint(this.start, deltaX, deltaY),
            end: Util.translatePoint(this.end, deltaX, deltaY),
            round: this.round,
            style: this.style,
        });
    }

    clone() {
        return new RectShape({
            id: this.id,
            start: { ...this.start },
            end: { ...this.end },
            round: this.round,
            style: { ...this.style },
        });
    }

    hitTest(pointerPoint, tolerance) {
        const rect = Util.rectFromPoints(this.start, this.end);
        if (this.style.fillEnabled && Util.isPointInsideRect(pointerPoint, rect)) {
            return true;
        }
        const topStart = { x: rect.x, y: rect.y };
        const topEnd = { x: rect.x + rect.w, y: rect.y };
        const bottomStart = { x: rect.x, y: rect.y + rect.h };
        const bottomEnd = { x: rect.x + rect.w, y: rect.y + rect.h };
        const leftStart = { x: rect.x, y: rect.y };
        const leftEnd = { x: rect.x, y: rect.y + rect.h };
        const rightStart = { x: rect.x + rect.w, y: rect.y };
        const rightEnd = { x: rect.x + rect.w, y: rect.y + rect.h };
        return (
            Util.distanceToSegment(pointerPoint, topStart, topEnd) <= tolerance ||
            Util.distanceToSegment(pointerPoint, bottomStart, bottomEnd) <= tolerance ||
            Util.distanceToSegment(pointerPoint, leftStart, leftEnd) <= tolerance ||
            Util.distanceToSegment(pointerPoint, rightStart, rightEnd) <= tolerance
        );
    }

    getSubLabel() {
        const rect = Util.rectFromPoints(this.start, this.end);
        return `x=${Math.round(rect.x)}, y=${Math.round(rect.y)}, w=${Math.round(rect.w)}, h=${Math.round(rect.h)}`;
    }

    updateDraftShape(pointerPoint) {
        this.end = pointerPoint;
    }

    drawShape(ctx) {
        this.applyStyle(ctx);
        const rect = Util.rectFromPoints(this.start, this.end);
        ctx.beginPath();
        buildRoundedRectPath(ctx, rect, this.round);
        if (this.style.fillEnabled) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawSelectionOutline(ctx) {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        const rect = Util.rectFromPoints(this.start, this.end);
        ctx.beginPath();
        buildRoundedRectPath(
            ctx,
            { x: rect.x - 4, y: rect.y - 4, w: rect.w + 8, h: rect.h + 8 },
            this.round + 4
        );
        ctx.stroke();
        ctx.restore();
    }
}

class PolygonShape extends BaseShape {
    constructor(options) {
        options.id ??= Util.uid("poly");
        const isClosed = options.isClosed ?? false;
        super({
            ...options,
            kind: EShapeKind.POLYGON,
            displayName: options.displayName ?? (isClosed ? "다각형" : "다각형(작성중)"),
        });
        this.points = options.points ? options.points.map((p) => ({ ...p })) : [];
        this.isClosed = isClosed;
    }

    getPosition() {
        if (this.points.length === 0) {
            return null;
        }
        return { ...this.points[0] };
    }

    translate(deltaX, deltaY) {
        return new PolygonShape({
            id: this.id,
            points: this.points.map((p) => Util.translatePoint(p, deltaX, deltaY)),
            isClosed: this.isClosed,
            style: this.style,
        });
    }

    clone() {
        return new PolygonShape({
            id: this.id,
            points: this.points.map((p) => ({ ...p })),
            isClosed: this.isClosed,
            style: { ...this.style },
        });
    }

    hitTest(pointerPoint, tolerance) {
        if (this.points.length < 2) {
            return false;
        }
        for (let i = 0; i < this.points.length - 1; i++) {
            if (Util.distanceToSegment(pointerPoint, this.points[i], this.points[i + 1]) <= tolerance) {
                return true;
            }
        }
        if (this.isClosed && this.points.length >= 3) {
            if (
                Util.distanceToSegment(pointerPoint, this.points[this.points.length - 1], this.points[0]) <= tolerance
            ) {
                return true;
            }
            return this.style.fillEnabled ? Util.isPointInsidePolygon(pointerPoint, this.points) : false;
        }
        return false;
    }

    getSubLabel() {
        return `점 ${this.points.length}개`;
    }

    drawShape(ctx) {
        if (this.points.length < 2) {
            return;
        }
        this.applyStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let pointIndex = 1; pointIndex < this.points.length; pointIndex++) {
            ctx.lineTo(this.points[pointIndex].x, this.points[pointIndex].y);
        }
        if (this.isClosed) {
            ctx.closePath();
        }
        if (this.isClosed && this.style.fillEnabled) {
            ctx.fill();
        }
        ctx.stroke();
    }

    drawSelectionOutline(ctx) {
        if (this.points.length < 2) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let pointIndex = 1; pointIndex < this.points.length; pointIndex++) {
            ctx.lineTo(this.points[pointIndex].x, this.points[pointIndex].y);
        }
        if (this.isClosed) {
            ctx.closePath();
        }
        ctx.stroke();
        ctx.restore();
    }

    finalize() {}
}

class FreehandShape extends BaseShape {
    constructor(options) {
        options.id ??= Util.uid("freehand");
        super({ ...options, kind: EShapeKind.FREEHAND, displayName: "자유곡선" });
        this.points = options.points ? options.points.map((p) => ({ ...p })) : [];
    }

    getPosition() {
        if (this.points.length === 0) {
            return null;
        }
        return { ...this.points[0] };
    }

    translate(deltaX, deltaY) {
        return new FreehandShape({
            id: this.id,
            points: this.points.map((p) => Util.translatePoint(p, deltaX, deltaY)),
            style: this.style,
        });
    }

    clone() {
        return new FreehandShape({
            id: this.id,
            points: this.points.map((p) => ({ ...p })),
            style: { ...this.style },
        });
    }

    hitTest(pointerPoint, tolerance) {
        for (let i = 0; i < this.points.length - 1; i++) {
            if (Util.distanceToSegment(pointerPoint, this.points[i], this.points[i + 1]) <= tolerance) {
                return true;
            }
        }
        return false;
    }

    getSubLabel() {
        return `점 ${this.points.length}개`;
    }

    updateDraftShape(pointerPoint) {
        const lastPoint = this.points[this.points.length - 1] ?? null;
        lastPoint ?? console.warn("[freehand] last 포인트가 없습니다.");
        if (lastPoint) {
            const stepDistance = Math.hypot(pointerPoint.x - lastPoint.x, pointerPoint.y - lastPoint.y);
            if (stepDistance >= 1.5) {
                this.points.push(pointerPoint);
            }
        }
    }

    drawShape(ctx) {
        if (this.points.length < 2) {
            return;
        }
        this.applyStyle(ctx);
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let pointIndex = 1; pointIndex < this.points.length; pointIndex++) {
            ctx.lineTo(this.points[pointIndex].x, this.points[pointIndex].y);
        }
        ctx.stroke();
    }

    drawSelectionOutline(ctx) {
        if (this.points.length < 2) {
            return;
        }
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.lineCap = "butt";
        ctx.lineJoin = "miter";
        ctx.beginPath();
        ctx.moveTo(this.points[0].x, this.points[0].y);
        for (let pointIndex = 1; pointIndex < this.points.length; pointIndex++) {
            ctx.lineTo(this.points[pointIndex].x, this.points[pointIndex].y);
        }
        ctx.stroke();
        ctx.restore();
    }
}

export { BaseShape, PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape };
