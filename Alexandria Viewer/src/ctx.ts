import { OPS } from "pdfjs-dist";
import { PDFOperatorList } from "pdfjs-dist/types/src/display/api";
import { Rect } from "./utils";
import * as gl from "gl-matrix";

gl.glMatrix.setMatrixArrayType(Array);

// interface Indexable {
//     [key: string]: any;
// }

// const op2str = new Array(1000);
// for (const op in OPS) {
//     const idx = (OPS as IIndexable)[op];
//     op2str[idx] = op;
// }

function _point(op: number, args: number[]): [number, number]|null {
    function _xy(i: number): [number, number] { return [args[i], args[i+1]]; }

    switch (op) {
        case OPS.lineTo: return _xy(0);
        case OPS.curveTo: return _xy(4);
        case OPS.curveTo2: return _xy(2);
        case OPS.curveTo3: return _xy(2);
        default: return null;
    }
}

function _transformPoint(x: number, y: number, ctm: gl.mat2d): [number, number] {
    const pt = gl.vec2.fromValues(x, y);
    gl.vec2.transformMat2d(pt, pt, ctm);

    return [pt[0], pt[1]];
}

function _transformedRectFromValues(xs: number[], ys: number[], ctm: gl.mat2d): Rect {
    let x1 = Math.min.apply(null, xs);
    let x2 = Math.max.apply(null, xs);
    let y1 = Math.min.apply(null, ys);
    let y2 = Math.max.apply(null, ys);

    [x1, y1] = _transformPoint(x1, y1, ctm);
    [x2, y2] = _transformPoint(x2, y2, ctm);

    return new Rect(x1, x2, y1, y2);
}

export function combineOverlappingRects(rects: Rect[]) {
    for (let i = 0; i < rects.length; i++) {
        for (let j = i+1; j < rects.length; j++) {
            if (rects[i].overlapsWith(rects[j])) {
                rects[i].encloseRect(rects[j]);

                // remove the jth rect from the array
                rects.splice(j, 1);

                // make sure that no new overlapping rects were created
                combineOverlappingRects(rects);
                return;
            }
        }
    }
}

export function getFigureRects(ops: PDFOperatorList): Rect[] {
    var rects = new Array<Rect>();
    let state = new Array();
    let xs = new Array<number>();
    let ys = new Array<number>();
    let ctm = gl.mat2d.create();
    let isVisible = false;

    function _appendCurrentRect() {
        if (xs.length > 0 && isVisible) {
            const r = _transformedRectFromValues(xs, ys, ctm);
            if (r.height > 0 && r.width > 0) {
                rects.push(r);
                combineOverlappingRects(rects);
            }
        }
        
        xs = [], ys = [];
        isVisible = false;
    }

    for (const [op, args] of _iterateOperations(ops)) {
        if (op == OPS.closePath || op == OPS.endPath) {
            _appendCurrentRect();
        }
        else if (op == OPS.stroke || op == OPS.fill || op == OPS.eoFill || op == OPS.eoFillStroke) {
            isVisible = true;
        }
        else if (op == OPS.closeFillStroke || op == OPS.closeStroke || op == OPS.closeEOFillStroke) {
            isVisible = true;
            _appendCurrentRect();
        }
        else if (op == OPS.save) {
            state.push(gl.mat2d.clone(ctm));
        }
        else if (op == OPS.restore) {
            ctm = state.pop() ?? gl.mat2d.create();
        }
        else if (op == OPS.transform) {
            const transform = gl.mat2d.fromValues(args[0], args[1], args[2], args[3], args[4], args[5]);
            gl.mat2d.mul(ctm, transform, ctm);
        }
        else if (op == OPS.constructPath) {
            throw new Error("constructPath not valid in flattened operator list");
        }
        else if (op == OPS.paintImageXObject) {
            const x1 = xs[xs.length-1];
            const y1 = ys[ys.length-1];

            const r = new Rect(x1, y1, x1+args[0], y1+args[1]);
            for (const [x, y] of r.coords) { 
                xs.push(x), ys.push(y);
            }
        }
        else if (op == OPS.rectangle) {
            _appendCurrentRect();
            
            let r = new Rect(args[0], args[0] + args[2], args[1], args[1] + args[3]);             
            for (const [x, y] of r.coords) {
                xs.push(x), ys.push(y);
            }
            _appendCurrentRect();
        }
        else {
            const pt = _point(op, args);
            if (pt !== null) {
                xs.push(pt[0]), ys.push(pt[1]);
            }
        }
    }

    // append the last rect, in case the path wasn't closed
    _appendCurrentRect();

    return rects;
}

// iterates the operations and their respective arguments
// while flattening the constructPath operation
function *_iterateOperations(list: PDFOperatorList): Generator<[number, any[]], void, void> {
    const numArgs = new Map([
        [OPS.moveTo, 2],
        [OPS.lineTo, 2],
        [OPS.curveTo, 6],
        [OPS.curveTo2, 4],
        [OPS.curveTo3, 4],
        [OPS.closePath, 0],
        [OPS.rectangle, 4]
    ]);

    for (let i = 0; i < list.fnArray.length; i++) {
        const op = list.fnArray[i];
        const args = list.argsArray[i];

        if (op == OPS.constructPath) {
            const sops = args[0];
            const sargs = args[1];
            for (let j = 0, k = 0; j < sops.length && k < sargs.length; j++) {
                const sop = sops[j];
                const count = numArgs.get(sop);
                if (count === undefined) {
                    throw new Error(`undefined operation in constructPath: ${sop}`);
                }

                yield [sop, sargs.slice(k, k+count)];
                k += count;
            }
        }
        else {
            yield [op, args]
        }
    }
}