// 도형 클래스: BaseShape 상속으로 id, displayName, type, 위치 등 공통 관리
// history(undo)는 BaseShape 인스턴스 배열로 관리

(function () {
    if (typeof window.EShapeKind === "undefined") {
        throw new Error("EShapeKind가 없어 실행할 수 없습니다. const.js 로드 순서를 확인하세요.");
    }
    if (typeof window.Util === "undefined") {
        throw new Error("Util이 없어 실행할 수 없습니다. util.js 로드 순서를 확인하세요.");
    }

    const EShapeKind = window.EShapeKind;
    const Util = window.Util;

    class BaseShape {
        constructor(options) {
            this.id = options.id ?? "";
            this.kind = options.kind ?? "";
            this.displayName = options.displayName ?? "도형";
            this.style = options.style ?? { stroke: "#2f6df6", lineWidth: 3, fillEnabled: true, fill: "rgba(47,109,246,0.20)" };
        }

        getPosition() {
            return null;
        }

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
    }

    class PointShape extends BaseShape {
        constructor(options) {
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
    }

    class LineShape extends BaseShape {
        constructor(options) {
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
            return `Start(${Math.round(this.start.x)},${Math.round(this.start.y)}) → End(${Math.round(this.end.x)},${Math.round(this.end.y)})`;
        }
    }

    class CircleShape extends BaseShape {
        constructor(options) {
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
    }

    class RectShape extends BaseShape {
        constructor(options) {
            super({ ...options, kind: EShapeKind.RECT, displayName: "사각형" });
            this.start = options.start ?? { x: 0, y: 0 };
            this.end = options.end ?? { x: 0, y: 0 };
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
                style: this.style,
            });
        }

        clone() {
            return new RectShape({
                id: this.id,
                start: { ...this.start },
                end: { ...this.end },
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
    }

    class PolygonShape extends BaseShape {
        constructor(options) {
            super({ ...options, kind: EShapeKind.POLYGON, displayName: "다각형" });
            this.points = options.points ? options.points.map((p) => ({ ...p })) : [];
            this.isClosed = options.isClosed ?? false;
        }

        get displayName() {
            return this.isClosed ? "다각형" : "다각형(작성중)";
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
    }

    class FreehandShape extends BaseShape {
        constructor(options) {
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
    }

    window.BaseShape = BaseShape;
    window.PointShape = PointShape;
    window.LineShape = LineShape;
    window.CircleShape = CircleShape;
    window.RectShape = RectShape;
    window.PolygonShape = PolygonShape;
    window.FreehandShape = FreehandShape;
})();
