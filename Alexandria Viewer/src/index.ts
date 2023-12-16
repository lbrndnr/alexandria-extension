import * as pl from "pdfjs-dist";
import { TextItem } from "pdfjs-dist/types/src/display/api";
import * as pv from "pdfjs-dist/web/pdf_viewer";
import { XMLParser } from "fast-xml-parser";
import { AcademicDocumentProxy } from "./doc";

pl.GlobalWorkerOptions.workerSrc = require("pdfjs-dist/build/pdf.worker.entry");

var VIEWER: PDFViewer = null;
var SCALE_VALUE = "page-width";

if (document.contentType == "application/pdf") {
    addEventListeners();
}

class PDFViewer {

    url: String
    doc: AcademicDocumentProxy
    container: HTMLDivElement;
    viewer: pv.PDFViewer;

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
                        this._addLinksToTextItem(event.pageNumber, item, [[googleScholarQueryURL(title), "Search on Google Scholar", s, e]]);
                    }
                }   

                if (authors !== null) {
                    for (const author of authors) {
                        for await (const occurences of this.doc.iterateOccurences(event.pageNumber, author)) { 
                            for (const [item, s, e] of occurences) {
                                this._addLinksToTextItem(event.pageNumber, item, [[googleScholarQueryURL(author), "Search on Google Scholar", s, e]]);
                            }
                        }   
                    }
                }
            });

            // Iterate through all citations, add links where we can match citation keywords
            if (refs !== null) {
                for await (const [item, occurences] of this.doc.iterateCitations(event.pageNumber)) {    
                    var links: [string, string, number, number][] = new Array();
                    for (const [start, end] of occurences) {
                        const keyword = item.str.substring(start, end);
                        const ref = refs.get(keyword);
                        if (ref === undefined) continue;
    
                        const url = googleScholarQueryURL(ref);
                        links.push([url, ref, start, end]);
                    }
    
                    this._addLinksToTextItem(event.pageNumber, item, links);
                }
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

        var spanHTML = "";
        var i = 0;
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
        section.style.zIndex = "10";
        section.style.left = `calc(var(--scale-factor)*${item.transform[4]}px)`;
        section.style.top = `calc(var(--scale-factor)*${top}px)`;
        section.style.height = `calc(var(--scale-factor)*${item.height}px)`;
        section.style.width = `calc(var(--scale-factor)*${item.width}px)`;
        section.setAttribute("class", "linkAnnotation");
        section.style.opacity = "0";
        section.appendChild(span);

        annotationLayer.appendChild(section);
    }

    _normalize(str: string): string {
        return str.replace(/\s+/g, " ");
    }

}

function googleScholarQueryURL(text: string): string {
    const query = encodeURIComponent(text);
    return `https://scholar.google.com/scholar?q=${query}`;
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
                const url = googleScholarQueryURL(top.document.title);
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

export function prepareBody(): HTMLDivElement {
    const viewer = document.createElement("div");
    viewer.setAttribute("class", "pdfViewer");
    
    const container = document.createElement("div");
    container.setAttribute("id", "alexandria-pdf-container");
    container.appendChild(viewer);

    document.body.appendChild(container);

    return container;
}