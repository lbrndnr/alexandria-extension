import { iteratePattern, appendTextItem, Rect } from "./utils";
import { PDFDocumentProxy, OPS } from "pdfjs-dist";
import * as gl from "gl-matrix";
import { TextItem, PDFOperatorList } from "pdfjs-dist/types/src/display/api";
import { SemanticScholar, Paper } from 'semanticscholarjs';

gl.glMatrix.setMatrixArrayType(Array)

const sch = new SemanticScholar();

export class AcademicDocumentProxy {

    pdf: PDFDocumentProxy;
    private _meta: Paper;
    private _title: string;
    private _references: Map<string, string>;
    pageHeight: number
    private _fontNames = new Map<string, string>();

    constructor(pdf: PDFDocumentProxy) {
        this.pdf = pdf;
    }

    private async _loadMeta(query: string) {
        const fields = ["url", "title", "authors", "references", "references,references.url", "references.authors"]
        const search = await sch.search_paper(query, null, null, null, null, null, fields, 5);
        const res = await search.nextPage();
        
        if (res.length > 0) {
            this._meta = res[0];
        }
    }

    async loadTitle(): Promise<string> {
        if (this._title !== undefined) {
            return this._title;
        }

        const f1 = this._loadLargestLine(1);
        const f2 = this._loadLargestLine(2);
        const [[t1, h1], [t2, h2]] = await Promise.all([f1, f2]);

        this._title = (h2 >= h1) ? t2 : t1;
        return this._title;
    }

    async _loadLargestLine(pageNumber: number): Promise<[string, number]> {
        let line = "";
        let title = "";
        let titleFont = undefined;
        let currentTop = undefined;
        let maxHeight = 0;
    
        for await (const item of this._iterateHorizontalTextItems(pageNumber, pageNumber)) {      
            // TextItems aren't necessarily in order
            // use the y coordinate to start a new line if necessary
            // this works assuming that words within a line are in order
            if (currentTop != item.transform[5]) line = "";
            currentTop = item.transform[5];       
            line = appendTextItem(line, item, false)[0];

            // has to be more than one character to avoid initial capitals
            if (item.height > maxHeight && item.str.length > 1) {
                maxHeight = item.height;
                titleFont = item.fontName;
                title = line;
            }
            else if (item.height == maxHeight && item.fontName == titleFont) {
                title += " " + line;
            }
        }

        return [title, maxHeight];
    }

    async loadReferences(): Promise<Map<string, string>> {
        if (this._references !== undefined) {
            return this._references;
        }

        // we first query SemanticScholar
        // if (this._meta === undefined) {
        //     await this.loadTitle();
        // }

        // gather all text with the respective letter sizes
        let text = "";
        let letterSizes = new Array<number>();
        for await (const item of this._iterateHorizontalTextItems(1, this.pdf.numPages)) {
            let s, e;
            [text, [s, e]] = appendTextItem(text, item, false);

            if (e-s <= 0) continue;
            const sizes = Array(e-s).fill(0);
            letterSizes.concat(sizes);
            for (let i = s; i < e; i++) letterSizes[i] = item.height;
        }

        // find the largest reference/bibliography text
        let re = /(references|bibliography)/gi;
        let maxHeight = 0;
        let refStart = 0;

        for (const [s, e] of iteratePattern(re, text)) {
            const height = letterSizes.slice(s, e).reduce((a, b) => a + b, 0) / (e-s);
            if (height > maxHeight) {
                maxHeight = height;
                refStart = s;
            }   
        }

        this._references = new Map();
        let keyword = null;
        text = text.slice(refStart);
        re = /\[\d+\]/gi;
        let j = 0;
        
        for (const [s, e] of iteratePattern(re, text)) {
            if (keyword !== null) {
                const cit = text.slice(j, s).trim();
                this._references.set(keyword, cit);
            }

            keyword = text.slice(s+1, e-1);
            j = e;

        }

        // insert last references if we already have a keyword
        if (keyword !== null) {
            const cit = text.substring(j+1, text.length);
            this._references.set(keyword, cit.trim());
        }

        // filter references using results from SemanticScholar
        // Todo

        return this._references;
    }

    private async *_iterateHorizontalTextItems(start: number, end: number): AsyncGenerator<TextItem, void, void> {
        for (let i = start; i <= end; i++) {
            const page = await this.pdf.getPage(i);
            const textContent = await page.getTextContent();
            if (this.pageHeight === undefined) this.pageHeight = page.view[3] - page.view[1];
        
            for (const elem of textContent.items) {
                const item = elem as TextItem;
                // only consider horizontal text
                if (Math.abs(item.transform[1]) > 0 || Math.abs(item.transform[2]) > 0) continue;
        
                yield item;
            }
        }
    }

    async *iterateOccurences(pageNumber: number, text: string): AsyncGenerator<[TextItem, number, number][], void, void> {
        let matchedItems = new Array<[TextItem, number, number]>();
        let i = 0;

        for await (const item of this._iterateHorizontalTextItems(pageNumber, pageNumber)) {
            var s, e;
            for (let j = 0; j < item.str.length; j++) {
                if (text[i] == item.str[j]) {
                    i++;
                    if (s === undefined) s = j;
                    e = j;
                }
                else {
                    i = 0;
                    s = undefined;
                    e = undefined;
                }
            }

            if (s !== undefined && e !== undefined) {
                matchedItems.push([item, s, e+1]);
            }
            else {
                matchedItems = [];
            }

            // we have matched all, yield all elements
            if (i == text.length) {
                yield matchedItems;
            }
            else if (text[i] == " " && i < text.length-1) {
                i++;
            }
        }
    }

    async *iterateCitations(pageNumber: number): AsyncGenerator<[TextItem, [number, number][]], void, void> {
        let items = [];
        let idx = [];
        let text = "";
        for await (const item of this._iterateHorizontalTextItems(pageNumber, pageNumber)) {
            items.push(item);
            idx.push(text.length);
            text += item.str;
        }

        let cits: [number, number][] = new Array(); 
        const re = /\[(.+?)\]/g;
        let m;

        do {
            m = re.exec(text);
            if (m) {
                const keywords = m[1].split(",").map((s) => s.trim());
                for (const keyword of keywords) {
                    const idx = m[1].indexOf(keyword);
                    const start = re.lastIndex-1-m[1].length+idx;
                    cits.push([start, start+keyword.length]);
                }
            }
        } while (m);

        function rangeOverlaps(a_start: number, a_end: number, b_start: number, b_end: number) {
            if (a_start <= b_start && b_start < a_end) return true; // b starts in a
            if (a_start < b_end   && b_end   <= a_end) return true; // b ends in a
            if (b_start <  a_start && a_end   <  b_end) return true; // a in b
            return false;
        }

        for (let i = 0; i < items.length; i++) {
            const itemStart = idx[i];
            const itemEnd = idx[i] + items[i].str.length;
            let itemCits = new Array<[number, number]>();

            // find every citation overlapping with the current item
            for (const [citStart, citEnd] of cits) {
                if (rangeOverlaps(citStart, citEnd, itemStart, itemEnd)) {
                    const relativeStart = Math.max(citStart, itemStart) - itemStart;
                    const relativeEnd = Math.min(citEnd, itemEnd) - itemStart;

                    itemCits.push([relativeStart, relativeEnd]);
                }
            }

            if (itemCits.length > 0) {
                yield [items[i], itemCits];
            }
        }
    }

    async *iterateFigures(pageNumber: number): AsyncGenerator<Rect, void, void> {
        const page = await this.pdf.getPage(pageNumber);
        const list = await page.getOperatorList();
        const [fops, fargs] = flattenOperatorList(list);

        const pageWidth = page.view[2] - page.view[0];
        const pageHeight = page.view[3] - page.view[1];

        // processes an operator
        // returns a list of points and a flag indicating whether the op appends to the current path
        function _process(op: number, args: number[]): [number, number][] {
            function _xy(i: number): [number, number] { return [args[i], args[i+1]]; }

            switch (op) {
                case OPS.lineTo: return [_xy(0)];
                case OPS.curveTo: return [_xy(4)];
                case OPS.curveTo2: return [_xy(2)];
                case OPS.curveTo3: return [_xy(2)];
                case OPS.rectangle: {
                    const r = new Rect(args[0], args[0] + args[2], args[1], args[1] + args[3]);
                    return r.coords;
                }
                default: return [];
            }
        }

        let state = new Array();
        let rect = Rect.undefined();
        let ctm = gl.mat2d.create();
        let isVisible = false;

        function _transformedPoint(x: number, y: number): [number, number] {
            const pt = gl.vec2.fromValues(x, y);
            gl.vec2.transformMat2d(pt, pt, ctm);

            // if (pt[0] > pageWidth || pt[1] > pageHeight) {
            //     throw new Error(`out of bounds ${pt} from ${x}/${y}`);
            // }
            return [pt[0], pt[1]];
        }
        
        for (let i = 0; i < fops.length; i++) {
            const op = fops[i];
            const args = fargs[i]; 

            if (op == OPS.closePath || op == OPS.endPath) {
                if (!rect.isUndefined && isVisible) yield rect;
                rect = Rect.undefined() 
                isVisible = false;
            }
            else if (op == OPS.stroke || op == OPS.fill || op == OPS.eoFill || op == OPS.eoFillStroke) {
                isVisible = true;
            }
            else if (op == OPS.closeFillStroke || op == OPS.closeStroke || op == OPS.closeEOFillStroke) {
                isVisible = true;
                if (!rect.isUndefined && isVisible) yield rect;

                rect = Rect.undefined();
                rect.enclose(_transformedPoint(args[0], args[1]));
                isVisible = false;
            }
            else if (op == OPS.moveTo) {
                if (!rect.isUndefined && isVisible) yield rect;

                rect = Rect.undefined() 
                rect.enclose(_transformedPoint(args[0], args[1]));
                isVisible = false;
            }
            else if (op == OPS.save) {
                // console.log("save");

                state.push(gl.mat2d.clone(ctm));
            }
            else if (op == OPS.restore) {
                // console.log("restore", ctm, "->", state[state.length-1]);
                ctm = state.pop() ?? gl.mat2d.create();
            }
            else if (op == OPS.transform) {
                const transform = gl.mat2d.fromValues(args[0], args[1], args[2], args[3], args[4], args[5]);
                gl.mat2d.mul(ctm, transform, ctm);
                // console.log(args, ctm);
            }
            else if (op == OPS.constructPath) {
                throw new Error("constructPath not valid in flattened operator list");
            }
            // else if (op == OPS.beginGroup) {
            //     console.log("beginGroup", args);
            // }
            // else if (op == OPS.setGState) {
            //     console.log("setGState", args);
            // }
            // else if (op == OPS.beginInlineImage) {
            //     console.log("beginInlineImage", args);
            // }
            else {
                const coords = _process(op, args);
                for (const [x, y] of coords) rect.enclose(_transformedPoint(x, y));
            }
        }

        // yield the last rect that wasn't explicitely closed
        if (!rect.isUndefined && isVisible) yield rect;
    }

    async resolveFontName(pageNumber: number, fontName: string): Promise<string> {
        let resolvedFontName = this._fontNames.get(fontName);
        if (resolvedFontName !== undefined) {
            return resolvedFontName;
        }

        const page = await this.pdf.getPage(pageNumber);
        resolvedFontName = page.commonObjs.get(fontName).name;
        this._fontNames.set(fontName, resolvedFontName);

        return resolvedFontName;
    }

}

function flattenOperatorList(list: PDFOperatorList): [number[], any[]] {
    const numArgs = new Map([
        [OPS.moveTo, 2],
        [OPS.lineTo, 2],
        [OPS.curveTo, 6],
        [OPS.curveTo2, 4],
        [OPS.curveTo3, 4],
        [OPS.closePath, 0],
        [OPS.rectangle, 4]
    ]);

    let flatOps = new Array();
    let flatArgs = new Array();
    for (let i = 0; i < list.fnArray.length; i++) {
        const op = list.fnArray[i];
        const args = list.argsArray[i];

        if (op == OPS.constructPath) {
            const sops = args[0];
            const sargs = args[1];
            for (let j = 0, k =0; j < sops.length && k < sargs.length; j++) {
                const sop = sops[j];
                const count = numArgs.get(sop);
                flatOps.push(sop);
                flatArgs.push(sargs.slice(k, k+count));
                k += count;
            }
        }
        else {
            flatOps.push(op);
            flatArgs.push(args);
        }
    }

    return [flatOps, flatArgs];
}