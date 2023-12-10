import { PDFDocumentProxy } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";

function _normalize(str: string): string {
    return str.replace(/\s+/g, " ");
}

export class AcademicDocumentProxy {

    pdf: PDFDocumentProxy;
    private _title: string;
    private _references: Map<string, string>;
    pageHeight: number

    constructor(pdf: PDFDocumentProxy) {
        this.pdf = pdf;
    }

    async loadTitle(): Promise<string> {
        if (this._title !== undefined) {
            return this._title;
        }

        var title = "";
        var maxHeight = 0;
    
        for await (const item of this._iterateHorizontalTextItems(1, 2)) {    
            if (item.height > maxHeight) {
                maxHeight = item.height;
                title = item.str;
            }
            else if (item.height == maxHeight) {
                title += " " + item.str;
            }
        }
    
        this._title = _normalize(title);
        return this._title;
    }

    async loadReferences(): Promise<Map<string, string>> {
        if (this._references !== undefined) {
            return this._references;
        }

        const refs = await this.loadSection("References");
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

        return this._references;
    }

    async loadSection(name: string): Promise<string> {
        var items = Array<TextItem>();
        var indicesOfHeight = new Map();

        for await (const item of this._iterateHorizontalTextItems(1, this.pdf.numPages)) {  
            if (item.str.length == 0) continue;
            const height = Math.ceil(item.height * 100);

            if (indicesOfHeight.has(height)) {
                const indices = indicesOfHeight.get(height);
                indices.push(items.length);
            }
            else {
                indicesOfHeight.set(height, [items.length]);
            }
            items.push(item);
        }

        const typicalSections = ["Introduction", "Background", "Results", "Conclusion", "Discussion", "References", "Bibliography"];
        var sectionHeight = 0;
        var maxNumMatches = 0;
        indicesOfHeight.forEach((indices, height) => {
            const text = indices.reduce((text: string, idx: number) => text += items[idx].str, "")

            const numMatches = typicalSections
                .map((sec) => text.includes(sec))
                .reduce((a, b) => a + b, 0);

            if (numMatches > maxNumMatches && height > sectionHeight) {
                sectionHeight = height;
                maxNumMatches = numMatches;
            }
        });

        const referenceTitles = ["References", "Bibliography"];
        var referencesStart = undefined;
        for (const title of referenceTitles) {
            for (const idx of indicesOfHeight.get(sectionHeight)) {
                if (items[idx].str.includes(title)) {
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
            console.log(page.commonObjs);
        
            for (const elem of textContent.items) {
                const item = elem as TextItem;
                // only consider horizontal text
                if (Math.abs(item.transform[1]) > 0 || Math.abs(item.transform[2]) > 0) continue;
        
                yield item;
            }
        }
    }

    async *iterateCitations(pageNumber: number): AsyncGenerator<[TextItem, [number, number][]], void, void> {
        for await (const item of this._iterateHorizontalTextItems(pageNumber, pageNumber)) {   
            var cits: [number, number][] = new Array(); 
            const re = /\[(.+?)\]/g;
            var m;

            do {
                m = re.exec(item.str);
                if (m) {
                    const keywords = m[1].split(",").map((s) => s.trim());
                    for (const keyword of keywords) {
                        const idx = m[1].indexOf(keyword);
                        const start = re.lastIndex-1-m[1].length+idx;
                        cits.push([start, start+keyword.length])
                    }
                }
            } while (m);

            if (cits.length > 0) {
                yield [item, cits];
            }
        }
    }

}