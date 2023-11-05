import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { CrossrefClient, QueryWorksParams } from "@jamesgopsill/crossref-client"

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

var gpdf: Promise<pl.PDFDocumentProxy> = null;
if (document.contentType == "application/pdf") {
    const url = window.location.href;
    gpdf = pl.getDocument(url).promise;
}

// const client = new CrossrefClient()
    
// const search: QueryWorksParams = {
//     queryTitle: title,
// };
// client.works(search).then(r => {
//     console.log(r);
//     for (const paper of r.content.message.items) {
//         console.log(paper.title);
//     }
// });

class PDFViewer {

    url: String
    pdf: pl.PDFDocumentProxy | undefined
    container: HTMLDivElement;
    viewer: pv.PDFViewer | undefined;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    async reload() {
        // this.pdf = await pl.getDocument(this.url).promise;
        this.pdf = await gpdf;

        const eventBus = new pv.EventBus();
        const linkService = new pv.PDFLinkService({
            eventBus,
            externalLinkRel: "noopener noreferrer nofollow",
            externalLinkTarget: pv.LinkTarget.BLANK
        });	
        this.viewer = new pv.PDFViewer({
            container: this.container,
            eventBus,
            linkService,
            l10n: pv.NullL10n
        });

        this.viewer.setDocument(this.pdf);
        linkService.setViewer(this.viewer);
        linkService.setDocument(this.pdf);

        eventBus.on("pagesinit", () => {
            this.viewer.currentScaleValue = "page-width";
        });

        const title = await this._getPDFTitle();
        const query = encodeURIComponent(title);
        const url = `https://scholar.google.com/scholar?q=${query}`;
        this._setDocumentTitle(title);

        eventBus.on("annotationlayerrendered", () => {
            this._addLinkToText(title, url, 1);
        });
    }

    async _getPDFTitle(): Promise<string> {
        const page = await this.pdf.getPage(1);
        const textContent = await page.getTextContent();
    
        var title = "";
        var maxHeight = 0;
    
        for (const elem of textContent.items) {
            const item = elem as TextItem;
    
            if (item.height > maxHeight) {
                maxHeight = item.height;
                title = item.str;
            }
            else if (item.height == maxHeight) {
                title += " " + item.str;
            }
        }
    
        return this._normalize(title);
    }

    _setDocumentTitle(text: string) {
        const title = document.createElement("title");
        title.innerText = text;

        const head = document.createElement("head");
        head.appendChild(title);

        document.body.insertAdjacentElement("beforebegin", head);
    }

    async _addLinkToText(str: string, url: string, pageIdx: number) {
        const als = document.getElementsByClassName("annotationLayer");
        if (als.length < pageIdx) return;

        const annotationLayer = als[pageIdx-1] as HTMLElement;
        annotationLayer.hidden = false;

        var text = "";
        var idx: number[] = [];
        var items: TextItem[] = [];

        const page = await this.pdf.getPage(pageIdx);
        const textContent = await page.getTextContent();
    
        for (const elem of textContent.items) {
            const item = elem as TextItem;
            if (item.str.length == 0) continue;

            items.push(item);
            idx.push(text.length);
            text += item.str + " ";
            text = this._normalize(text);
        }

        const k = text.indexOf(str);
        if (k >= 0) {            
            idx.forEach((i, j) => {
                if (i >= k && i < k + str.length) {
                    const item = items[j];

                    const a = document.createElement("a");
                    a.setAttribute("title", "Search on Google Scholar");
                    a.setAttribute("id", "alexandria-url-google-scholar");
                    a.setAttribute("href", url);
                    a.setAttribute("target", "_blank");

                    const pageHeight = page.view[3] - page.view[1];
                    const top = pageHeight - (item.transform[5] + item.height);
                    const section = document.createElement("section");
                    section.style.zIndex = "0";
                    section.style.left = `calc(var(--scale-factor)*${item.transform[4]}px)`;
                    section.style.top = `calc(var(--scale-factor)*${top}px)`;
                    section.style.height = `calc(var(--scale-factor)*${item.height}px)`;
                    section.style.width = `calc(var(--scale-factor)*${item.width}px)`;
                    section.setAttribute("class", "linkAnnotation");
                    section.appendChild(a);

                    annotationLayer.appendChild(section);
                }
            });
        }
    }

    _normalize(str: string): string {
        return str.replace(/\s+/g, " ");
    }

}

document.addEventListener("DOMContentLoaded", (_) => {
    if (document.contentType == "application/pdf") {
        const container = prepareBody();    
        const url = window.location.href;
        const viewer = new PDFViewer(url, container);
        viewer.reload();
    }
    // else {
        // const declaration = document.styleSheets[0].rules[0].style;
        // const oldValue = declaration.removeProperty("background-color");
    // }
});

function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.appendChild(container);

    return container;
}