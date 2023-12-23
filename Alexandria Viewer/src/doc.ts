import { PDFDocumentProxy } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import { SemanticScholar, Paper } from 'semanticscholarjs';

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

        let line = "";
        let title = "";
        let titleFont = undefined;
        let maxHeight = 0;
    
        for await (const item of this._iterateHorizontalTextItems(1, 2)) {             
            line = _appendTextItem(line, item, false);

            // has to be more than one character to avoid initial capitals
            if (item.height > maxHeight && item.str.length > 1) {
                maxHeight = item.height;
                titleFont = item.fontName;
                title = line;
            }
            else if (item.height == maxHeight && item.fontName == titleFont) {
                title += " " + item.str;
            }

            if (item.hasEOL) line = "";
        }

        this._title = title;
        return this._title;
    }

    async loadReferences(): Promise<Map<string, string>> {
        if (this._references !== undefined) {
            return this._references;
        }

        // we first query SemanticScholar
        if (this._meta === undefined) {
            await this.loadTitle();
        }

        // gather all text with the respective letter sizes
        let text = "";
        let letterSizes = new Array<number>();
        for await (const item of this._iterateHorizontalTextItems(1, this.pdf.numPages)) {
            text += item.str;

            const sizes = Array(item.str.length).fill(item.height);
            letterSizes.concat(sizes);
        }

        // find the largest reference/bibliography text
        let re = /(references|bibliography)/gi;
        let m;
        let maxHeight = 0;
        let refStart = 0;

        do {
            m = re.exec(text);
            if (m) {
                const e = re.lastIndex-1;
                const s = e-m[1].length;
    
                const height = letterSizes.slice(s, e).reduce((a, b) => a + b, 0) / (e-s);
                if (height > maxHeight) {
                    maxHeight = height;
                    refStart = s;
                }
            }
        } while (m);

        this._references = new Map();
        let keyword = null;

        let j = 0;
        for (let i = refStart; i < text.length; i++) {
            if (text[i] == "[") {
                if (keyword !== null) {
                    const cit = text.substring(j+1, i);
                    this._references.set(keyword, cit.trim());
                    keyword = null;
                }
                j = i;
            }
            else if (text[i] == "]") {
                keyword = text.substring(j+1, i);
                j = i;
            }
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

export function _appendTextItem(text: string, item: TextItem, appendNewLine: boolean): string {
    text += item.str;
    if (item.hasEOL) {
        if (text.endsWith("-")) text = text.slice(0, -1);
        if (appendNewLine) text += "\n";
    }

    return text;
}