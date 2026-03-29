// 도형 인스턴스의 월드 축 정렬 바운딩 박스(min/max)를 구한다.

import { EShapeKind } from "./const.js";
import { Util } from "../util.js";

/**
 * @param {import("./shapes.js").BaseShape} shape
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function getShapeBoundingBox(shape) {
    if (shape === null || shape === undefined) {
        console.warn("[shape_bounds] shape 없음");
        return null;
    }
    const k = shape.kind;
    if (k === EShapeKind.POINT) {
        const r = shape.radius ?? 4;
        return {
            minX: shape.position.x - r,
            minY: shape.position.y - r,
            maxX: shape.position.x + r,
            maxY: shape.position.y + r,
        };
    }
    if (k === EShapeKind.LINE) {
        return {
            minX: Math.min(shape.start.x, shape.end.x),
            minY: Math.min(shape.start.y, shape.end.y),
            maxX: Math.max(shape.start.x, shape.end.x),
            maxY: Math.max(shape.start.y, shape.end.y),
        };
    }
    if (k === EShapeKind.CIRCLE) {
        const rad = Math.max(0, shape.radius ?? 0);
        return {
            minX: shape.center.x - rad,
            minY: shape.center.y - rad,
            maxX: shape.center.x + rad,
            maxY: shape.center.y + rad,
        };
    }
    if (k === EShapeKind.RECT) {
        const rect = Util.rectFromPoints(shape.start, shape.end);
        return {
            minX: rect.x,
            minY: rect.y,
            maxX: rect.x + rect.w,
            maxY: rect.y + rect.h,
        };
    }
    if (k === EShapeKind.POLYGON || k === EShapeKind.FREEHAND) {
        const pts = shape.points;
        if (pts === null || pts === undefined || pts.length === 0) {
            return null;
        }
        let minX = pts[0].x;
        let minY = pts[0].y;
        let maxX = pts[0].x;
        let maxY = pts[0].y;
        for (let i = 1; i < pts.length; i++) {
            minX = Math.min(minX, pts[i].x);
            minY = Math.min(minY, pts[i].y);
            maxX = Math.max(maxX, pts[i].x);
            maxY = Math.max(maxY, pts[i].y);
        }
        return { minX, minY, maxX, maxY };
    }
    console.warn("[shape_bounds] 미지원 kind=%s", k);
    return null;
}
