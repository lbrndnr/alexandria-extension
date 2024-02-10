import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { XMLParser } from "fast-xml-parser";
import { AcademicDocumentProxy } from "./doc";
import { Rect, iterateURLs } from "./utils";

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

let VIEWER: PDFViewer = null;
let SCALE_VALUE = "page-width";

if (document.contentType == "application/pdf") {
    addEventListeners();
}

class PDFViewer {

    url: String
    doc: AcademicDocumentProxy
    container: HTMLDivElement;
    viewer: pv.PDFViewer;
    floatingFigure: HTMLCanvasElement;

    constructor(url: String, container: HTMLDivElement) {
        this.url = url;
        this.container = container;
    }

    async reload() {
        const pdf = await pl.getDocument(this.url).promise;
        this.doc = new AcademicDocumentProxy(pdf);

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

        this.viewer.setDocument(pdf);
        linkService.setViewer(this.viewer);
        linkService.setDocument(pdf);

        eventBus.on("pagesinit", () => {
            this.viewer.currentScaleValue = "page-width";
        });

        const title = this.doc.loadTitle();
        const authors = title.then((title) => {
            this._setDocumentTitle(title);
            return getAuthors(title);
        });
        const titleAndAuthors = Promise.all([title, authors]);
        const refs = await this.doc.loadReferences();

        eventBus.on("annotationlayerrendered", async (event: any) => {
            titleAndAuthors.then(async res => {
                const [title, authors] = res;

                for await (const occurences of this.doc.iterateOccurences(event.pageNumber, title)) { 
                    for (const [item, s, e] of occurences) {
                        this._addLinksToTextItem(event.pageNumber, item, [[searchQueryURL(title), "Search on Google Scholar", s, e]]);
                    }
                }   

                if (authors !== null) {
                    for (const author of authors) {
                        for await (const occurences of this.doc.iterateOccurences(event.pageNumber, author)) { 
                            for (const [item, s, e] of occurences) {
                                this._addLinksToTextItem(event.pageNumber, item, [[searchQueryURL(author), "Search on Google Scholar", s, e]]);
                            }
                        }   
                    }
                }
            });

            // Iterate through all citations, add links where we can match citation keywords
            if (refs !== null) {
                for await (const [item, occurences] of this.doc.iterateCitations(event.pageNumber)) {    
                    let links: [string, string, number, number][] = new Array();
                    for (const [start, end] of occurences) {
                        const keyword = item.str.substring(start, end);
                        const ref = refs.get(keyword);
                        if (ref === undefined) continue;
    
                        const url = citationURL(ref);
                        links.push([url, ref, start, end]);
                    }
    
                    this._addLinksToTextItem(event.pageNumber, item, links);
                }
            }

            for await (const rect of await this.doc.loadFigures(event.pageNumber)) {
                this._addButtonToPage(event.pageNumber, rect, () => {
                    this._addFloatingFigure(event.pageNumber, rect);
                });
            }
        });
    }



    private _setDocumentTitle(text: string) {
        // In case we're in an iframe, set the top document's title too
        top.document.title = text;

        const title = document.createElement("title");
        title.innerText = text;

        const head = document.createElement("head");
        head.appendChild(title);

        document.body.insertAdjacentElement("beforebegin", head);
    }

    private async _addLinksToTextItem(pageNumber: number, item: TextItem, links: [url: string, tooltip: string, start: number, end: number][]) {
        const als = document.querySelectorAll(`[data-page-number="${pageNumber}"] > .annotationLayer`);
        if (als.length != 1) return;

        const annotationLayer = als[0] as HTMLElement;
        annotationLayer.hidden = false;

        let spanHTML = "";
        let i = 0;
        for (const [url, tooltip, start, end] of links) {
            spanHTML += item.str.substring(i, start);
            const text = item.str.substring(start, end);
            spanHTML += `<a id="alexandria-url-google-scholar" href="${url}" title="${tooltip}" target="_blank">${text}</a>`;
            i = end;
        }
        spanHTML += item.str.substring(i, item.str.length);

        const span = document.createElement("span");
        span.role = "presentation";
        span.dir = item.dir;
        span.style.width = "100%";
        span.style.display = "block";
        span.style.fontSize = `calc(var(--scale-factor)*${item.height}px)`;
        span.style.font = await this.doc.resolveFontName(pageNumber, item.fontName);
        span.style.textAlignLast = "justify";
        span.style.whiteSpace = "nowrap";
        span.innerHTML = spanHTML;

        const top = this.doc.pageHeight - (item.transform[5] + item.height);
        const section = document.createElement("section");
        section.style.left = `calc(var(--scale-factor)*${item.transform[4]}px)`;
        section.style.top = `calc(var(--scale-factor)*${top}px)`;
        section.style.height = `calc(var(--scale-factor)*${item.height}px)`;
        section.style.width = `calc(var(--scale-factor)*${item.width}px)`;
        section.setAttribute("class", "linkAnnotation");
        section.appendChild(span);

        annotationLayer.appendChild(section);
    }

    private async _addButtonToPage(pageNumber: number, rect: Rect, onClick: (() => (void))) {
        const als = document.querySelectorAll(`[data-page-number="${pageNumber}"] > .annotationLayer`);
        if (als.length != 1) return;

        const annotationLayer = als[0] as HTMLElement;
        annotationLayer.hidden = false;

        const top = this.doc.pageHeight - rect.y2;
        const button = document.createElement("button");
        button.style.left = `calc(var(--scale-factor)*${rect.x1}px)`;
        button.style.top = `calc(var(--scale-factor)*${top}px)`;
        button.style.height = `calc(var(--scale-factor)*${rect.height}px)`;
        button.style.width = `calc(var(--scale-factor)*${rect.width}px)`;
        button.setAttribute("class", "figureAnnotation");
        button.onclick = onClick;

        annotationLayer.appendChild(button);
    }

    private async _addFloatingFigure(pageNumber: number, rect: Rect) {
        if (!this.floatingFigure) {
            this.floatingFigure = document.createElement("canvas");
            this.floatingFigure.setAttribute("class", "floatingFigure");
            this.floatingFigure.style.left = "20px";
            this.floatingFigure.style.top = "20px";
            this.container.appendChild(this.floatingFigure);

            let offset = [0, 0];
            const onmousemove = (event: MouseEvent) => {
                this.floatingFigure.style.left = `${event.clientX - offset[0]}px`;
                this.floatingFigure.style.top = `${event.clientY - offset[1]}px`;
            };

            this.floatingFigure.onmousedown = (event) => {
                offset[0] = event.offsetX;
                offset[1] = event.offsetY;
                window.onmousemove = onmousemove;
                this.floatingFigure.style.cursor = "grabbing";
            }

            this.floatingFigure.onmouseup = (event) => {
                window.onmousemove = null;
                this.floatingFigure.attributeStyleMap.delete("cursor");
                this.floatingFigure.attributeStyleMap.delete("left");
                this.floatingFigure.attributeStyleMap.delete("right");
                this.floatingFigure.attributeStyleMap.delete("top");
                this.floatingFigure.attributeStyleMap.delete("bottom");

                if (event.clientX - offset[0] + this.floatingFigure.clientWidth/2.0 <= window.innerWidth/2.0) {
                    this.floatingFigure.style.left = "20px";
                }
                else {
                    this.floatingFigure.style.right = "20px";
                }

                if (event.clientY - offset[1] + this.floatingFigure.clientHeight/2.0 <= window.innerHeight/2.0) {
                    this.floatingFigure.style.top = "20px";
                }
                else {
                    this.floatingFigure.style.bottom = "20px";
                }
            };
        }

        const pageCanvas = this.container.querySelectorAll(`div[data-page-number='${pageNumber}'] canvas`)[0] as HTMLCanvasElement;
        const cs = pageCanvas.width/this.doc.pageWidth;

        const pr = window.devicePixelRatio || 1.0;
        this.floatingFigure.width = Math.floor(cs*rect.width);
        this.floatingFigure.height = Math.floor(cs*rect.height);
        this.floatingFigure.style.width = `${pr * rect.width}px`;
        this.floatingFigure.style.height = `${pr * rect.height}px`;

        const pageContext = pageCanvas.getContext("2d");
        const img = pageContext.getImageData(Math.floor(cs*rect.x1), Math.floor(pageCanvas.height-rect.y2*cs), Math.ceil(cs*rect.width), Math.ceil(cs*rect.height));
        const ibm = await window.createImageBitmap(img, 0, 0, img.width, img.height);

        const figureContext = this.floatingFigure.getContext("2d");
        figureContext.drawImage(ibm, 0, 0);
    }

}

function searchQueryURL(text: string): string {
    const query = encodeURIComponent(text);
    return `https://scholar.google.com/scholar?q=${query}`;
}

function citationURL(cit: string): string {
    for (const [s, e] of iterateURLs(cit)) {
        return cit.slice(s, e);
    }

    return searchQueryURL(cit);
}

async function getAuthors(title: string): Promise<string[] | null> {
    const query = encodeURIComponent(title.replace(":", " "));
    const url = `https://export.arxiv.org/api/query?search_query=${query}`;

    const res = await fetch(url);
    const text = await res.text();
    const parser = new XMLParser();
    const body = parser.parse(text);
    if (body.feed.entry === undefined) {
        return null;
    }

    for (const entry of body.feed.entry) {
        const val = entry.title.replace(/\s+/g, " ");

        if (val.toLowerCase() == title.toLowerCase()) {
            return entry.author.map((a: any) => { return a.name });
        }
    }

    return [];
}

function addEventListeners() {
    document.addEventListener("DOMContentLoaded", (_) => {
        const container = prepareBody();    
        const url = window.location.href;
        VIEWER = new PDFViewer(url, container);
        VIEWER.reload();
    });   

    document.addEventListener("keypress", (event) => {
        switch (event.key) {
            case "s": {
                const url = searchQueryURL(top.document.title);
                window.open(url, "_blank");
                break;
            }
            case "i": {
                const cls = "inverted-color";
                if (VIEWER.container.classList.contains(cls)) {
                    VIEWER.container.classList.remove(cls)
                }
                else {
                    VIEWER.container.classList.add(cls);
                }
                break;
            }
            case "8": setScaleValue("page-fit"); break;
            case "9": setScaleValue("page-width"); break;
            case "0": setScaleValue("auto"); break;
            case "Escape": {
                VIEWER.floatingFigure.remove();
                VIEWER.floatingFigure = null;
                break;
            }
        }
    });

    window.onresize = (event) => {
        VIEWER.viewer.currentScaleValue = SCALE_VALUE;
    };
}

function setScaleValue(value: string) {
    SCALE_VALUE = value;
    VIEWER.viewer.currentScaleValue = value;
}

function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.appendChild(container);

    return container;
}