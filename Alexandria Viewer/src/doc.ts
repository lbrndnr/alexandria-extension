import { PDFDocumentProxy } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import { SemanticScholar } from 'semanticscholarjs';

function _normalize(str: string): string {
    return str.replace(/\s+/g, " ");
}

enum Section {
    References
}

const sch = new SemanticScholar();

export class AcademicDocumentProxy {

    pdf: PDFDocumentProxy;
    private _title: string;
    private _references: Map<string, string>;
    pageHeight: number
    private _fontNames = new Map<string, string>();

    constructor(pdf: PDFDocumentProxy) {
        this.pdf = pdf;
    }

    private async _loadMeta(query: string) {
        const search = await sch.search_paper(query, null, null, null, null, null, ["url", "title", "authors", "references"]);
        if (search.Total == 0) return;

        const res = await search.nextPage();
        if (res.length > 0) {
            this._title = res[0].title;
        }
    }

    async loadTitle(): Promise<string> {
        if (this._title !== undefined) {
            return this._title;
        }

        var title = "";
        var titleFont = undefined;
        var maxHeight = 0;
    
        for await (const item of this._iterateHorizontalTextItems(1, 2)) {    
            // has to be more than one character to avoid initial capitals
            if (item.height > maxHeight && item.str.length > 1) {
                maxHeight = item.height;
                titleFont = item.fontName;
                title = item.str;
            }
            else if (item.height == maxHeight && item.fontName == titleFont) {
                title += " " + item.str;
            }
        }

        await this._loadMeta(title);
        if (this._title === undefined) this._title = title;
        
        return this._title;
    }

    async loadReferences(): Promise<Map<string, string>> {
        if (this._references !== undefined) {
            return this._references;
        }

        const refs = await this.loadSection(Section.References);
        if (refs === null) {
            this._references = null;
            return this._references;
        }

        this._references = new Map();
        var keyword = null;
        var j = 0;
        for (var i = 0; i < refs.length; i++) {
            if (refs[i] == "[") {
                if (keyword !== null) {
                    const cit = refs.substring(j+1, i);
                    this._references.set(keyword, cit.trim());
                    keyword = null;
                }
                j = i;
            }
            else if (refs[i] == "]") {
                keyword = refs.substring(j+1, i);
                j = i;
            }
        }

        // insert last references if we already have a keyword
        if (keyword !== null) {
            const cit = refs.substring(j+1, refs.length);
            this._references.set(keyword, cit.trim());
        }

        return this._references;
    }

    async loadSection(section: Section): Promise<string> {
        var items = Array<TextItem>();
        var indicesWithFont = new Map();

        for await (const item of this._iterateHorizontalTextItems(1, this.pdf.numPages)) {  
            if (item.str.length == 0) continue;

            if (indicesWithFont.has(item.fontName)) {
                const indices = indicesWithFont.get(item.fontName);
                indices.push(items.length);
            }
            else {
                indicesWithFont.set(item.fontName, [items.length]);
            }
            items.push(item);
        }

        const typicalSections = ["abstract", "introduction", "background", "references", "bibliography"];
        var sectionFont = null;
        var maxNumMatches = 0;
        indicesWithFont.forEach((indices, fontName) => {
            const text = indices.reduce((text: string, idx: number) => text += items[idx].str.toLowerCase(), "");
            const numMatches = typicalSections
                .map((sec) => text.includes(sec))
                .reduce((a, b) => a + b, 0);

            if (numMatches > maxNumMatches) {
                sectionFont = fontName;
                maxNumMatches = numMatches;
            }
        });

        var referencesStart = undefined;
        for (const title of this.possibleTitlesForSection(section)) {
            for (const idx of indicesWithFont.get(sectionFont)) {
                if (items[idx].str.toLowerCase().includes(title)) {
                    referencesStart = idx;
                    break;
                }
            }
        }

        if (referencesStart === undefined) { return null; }

        var text = "";
        for (var i = referencesStart; i < items.length; i++) {
            text += items[i].str + " ";
        }

        return _normalize(text);
    }

    private async *_iterateHorizontalTextItems(start: number, end: number): AsyncGenerator<TextItem, void, void> {
        for (var i = start; i <= end; i++) {
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
        var matchedItems = new Array<[TextItem, number, number]>();
        var i = 0;

        for await (const item of this._iterateHorizontalTextItems(pageNumber, pageNumber)) {
            var s, e;
            for (var j = 0; j < item.str.length; j++) {
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
        var items = [];
        var idx = [];
        var text = "";
        for await (const item of this._iterateHorizontalTextItems(pageNumber, pageNumber)) {
            items.push(item);
            idx.push(text.length);
            text += item.str;
        }

        var cits: [number, number][] = new Array(); 
        const re = /\[(.+?)\]/g;
        var m;

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

        for (var i = 0; i < items.length; i++) {
            const itemStart = idx[i];
            const itemEnd = idx[i] + items[i].str.length;
            var itemCits = new Array<[number, number]>();

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

    private possibleTitlesForSection(section: Section): string[] {
        if (section == Section.References) {
            return ["references", "bibliography"];
        }

        return [];
    }

}