// 도형 인스턴스 ↔ JSON 직렬화(프리뷰 페이지 sessionStorage 등). kind는 EShapeKind 문자열 값과 동일.

import { EShapeKind } from "./const.js";
import { PointShape, LineShape, CircleShape, RectShape, PolygonShape, FreehandShape } from "./shapes.js";

/**
 * 도형을 저장용 평면 객체로 변환한다.
 * @param {import("./shapes.js").BaseShape} shape
 * @returns {object | null}
 */
export function shapeToPlain(shape) {
    if (shape === null || shape === undefined) {
        console.warn("[shape_snapshot] shapeToPlain: shape 없음");
        return null;
    }
    const base = { kind: shape.kind, id: shape.id, style: { ...shape.style } };
    switch (shape.kind) {
        case EShapeKind.POINT:
            return { ...base, position: { ...shape.position }, radius: shape.radius };
        case EShapeKind.LINE:
            return { ...base, start: { ...shape.start }, end: { ...shape.end } };
        case EShapeKind.CIRCLE:
            return { ...base, center: { ...shape.center }, radius: shape.radius };
        case EShapeKind.RECT:
            return { ...base, start: { ...shape.start }, end: { ...shape.end }, round: shape.round };
        case EShapeKind.POLYGON:
            return {
                ...base,
                points: shape.points.map((p) => ({ ...p })),
                isClosed: shape.isClosed,
            };
        case EShapeKind.FREEHAND:
            return { ...base, points: shape.points.map((p) => ({ ...p })) };
        default:
            console.warn("[shape_snapshot] shapeToPlain: 알 수 없는 kind=%s", shape.kind);
            return null;
    }
}

/**
 * 저장용 평면 객체를 도형 인스턴스로 복원한다.
 * @param {object} plain
 * @returns {import("./shapes.js").BaseShape | null}
 */
export function shapeFromPlain(plain) {
    if (plain === null || plain === undefined || typeof plain !== "object") {
        console.warn("[shape_snapshot] shapeFromPlain: plain 없음");
        return null;
    }
    const kind = plain.kind;
    const style = plain.style ?? {};
    switch (kind) {
        case EShapeKind.POINT:
            return new PointShape({
                id: plain.id,
                position: plain.position,
                radius: plain.radius,
                style,
            });
        case EShapeKind.LINE:
            return new LineShape({
                id: plain.id,
                start: plain.start,
                end: plain.end,
                style,
            });
        case EShapeKind.CIRCLE:
            return new CircleShape({
                id: plain.id,
                center: plain.center,
                radius: plain.radius,
                style,
            });
        case EShapeKind.RECT:
            return new RectShape({
                id: plain.id,
                start: plain.start,
                end: plain.end,
                round: plain.round,
                style,
            });
        case EShapeKind.POLYGON:
            return new PolygonShape({
                id: plain.id,
                points: plain.points,
                isClosed: plain.isClosed,
                style,
            });
        case EShapeKind.FREEHAND:
            return new FreehandShape({
                id: plain.id,
                points: plain.points,
                style,
            });
        default:
            console.warn("[shape_snapshot] shapeFromPlain: 알 수 없는 kind=%s", kind);
            return null;
    }
}
