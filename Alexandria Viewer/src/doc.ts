import { PDFDocumentProxy } from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";

function _normalize(str: string): string {
    return str.replace(/\s+/g, " ");
}

export class AcademicDocumentProxy {

    pdf: PDFDocumentProxy;
    private _title: string;

    constructor(pdf: PDFDocumentProxy) {
        this.pdf = pdf;
    }

    async loadTitle(): Promise<string> {
        if (this._title !== undefined) {
            return this._title;
        }

        var title = "";
        var maxHeight = 0;
    
        for await (const item of this._iterateHorizontalText(1, 2)) {    
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

    async loadSection(name: string): Promise<string> {
        var items = Array<TextItem>();
        var indicesOfHeight = new Map();

        for await (const item of this._iterateHorizontalText(1, this.pdf.numPages)) {  
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

    private async *_iterateHorizontalText(start: number, end: number): AsyncGenerator<TextItem, void, void> {
        for (var i = start; i <= end; i++) {
            const page = await this.pdf.getPage(i);
            const textContent = await page.getTextContent();
        
            for (const elem of textContent.items) {
                const item = elem as TextItem;
                // only consider horizontal text
                if (Math.abs(item.transform[1]) > 0 || Math.abs(item.transform[2]) > 0) continue;
        
                yield item;
            }
        }
    }

}